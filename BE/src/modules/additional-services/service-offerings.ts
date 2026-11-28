import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { businessToday } from '../../business-date.js';

// Catalog IDs remain the historical service IDs; prices/stock are scoped offers.
export type OfferingRecord = Prisma.FacilityServiceOfferingGetPayload<{
  include: { additionalService: true };
}>;
export function offeringView(offer: OfferingRecord) {
  return {
    ...offer.additionalService,
    facilityId: offer.facilityId,
    offeringId: offer.id,
    localIsActive: offer.isActive,
    globalIsActive: offer.additionalService.isActive,
    unitPrice: offer.unitPrice,
    isActive: offer.isActive && offer.additionalService.isActive && !offer.configurationReview,
    inventory: offer,
    offerings: undefined,
  };
}
export async function pricedServices(
  db: Prisma.TransactionClient,
  ids: string[],
  facilityId: string,
  committedDailyIds: string[] = [],
) {
  if (!ids.length) return [];
  const offers = await db.facilityServiceOffering.findMany({
    where: {
      facilityId,
      additionalServiceId: { in: ids },
      ...publicOfferingScope,
      additionalService: {
        ...publicOfferingScope.additionalService,
        OR: [newServiceTerms, { id: { in: committedDailyIds } }],
      },
    },
    include: { additionalService: true },
  });
  return offers.map(offeringView);
}
export const eligibleServiceFacility = {
  bookingEnabled: true,
  operationalStatus: 'OPEN',
} as const;

export const newServiceTerms = { NOT: { kind: 'RENTAL', billingUnit: 'DAY' } } satisfies Prisma.AdditionalServiceWhereInput;

export const publicOfferingScope = {
  isActive: true,
  configurationReview: { equals: Prisma.DbNull },
  additionalService: { isActive: true },
  facility: eligibleServiceFacility,
  unitPrice: { gt: 0n },
} as const;

export function offeringQuantity(offer: OfferingRecord) {
  return offer.additionalService.kind === 'PURCHASE'
    ? offer.stockOnHand
    : offer.rentalCapacity;
}
export function serviceFacilityScope(facilityId: string): Prisma.ReservationServiceWhereInput {
  return { OR: [{ serviceFacilityId: facilityId }, { serviceFacilityId: null, reservation: { facilityId } }] };
}

export async function committedOfferingQuantities(
  db: Prisma.TransactionClient,
  offers: OfferingRecord[],
  includeTodaysRentals: boolean,
) {
  const today = businessToday();
  const scope = offers.flatMap<Prisma.ReservationServiceWhereInput>((offer) => {
    const base = {
      additionalServiceId: offer.additionalServiceId,
      reservation: { status: 'CONFIRMED' as const },
      ...serviceFacilityScope(offer.facilityId),
    };
    if (offer.additionalService.kind === 'PURCHASE')
      return [{ ...base, fulfillmentStatus: 'RESERVED' }];
    return includeTodaysRentals
      ? [
          {
            ...base,
            AND: [{ OR: [{ fulfillmentStatus: null }, { fulfillmentStatus: { not: 'RELEASED' } }] }],
            serviceStartDate: { lte: today },
            serviceEndDate: { gt: today },
          },
        ]
      : [];
  });
  const totals = new Map<string, number>();
  if (scope.length === 0) return totals;
  const rows = await db.reservationService.findMany({
    where: { OR: scope },
    select: {
      additionalServiceId: true,
      quantity: true,
      serviceFacilityId: true,
      reservation: { select: { facilityId: true } },
    },
  });
  for (const row of rows) {
    const key = offeringKey(
      row.additionalServiceId,
      row.serviceFacilityId ?? row.reservation.facilityId,
    );
    totals.set(key, (totals.get(key) ?? 0) + row.quantity);
  }
  return totals;
}

export function offeringKey(serviceId: string, facilityId: string) {
  return `${serviceId}:${facilityId}`;
}

export async function availablePublicOfferings(
  db: Prisma.TransactionClient,
  facilityId?: string,
) {
  const offers = await db.facilityServiceOffering.findMany({
    where: {
      ...publicOfferingScope,
      additionalService: { ...publicOfferingScope.additionalService, ...newServiceTerms },
      ...(facilityId ? { facilityId } : {}),
    },
    include: { additionalService: true },
    orderBy: [{ additionalService: { name: 'asc' } }, { facilityId: 'asc' }],
  });
  const configured = offers.filter(
    (offer) => (offeringQuantity(offer) ?? 0) > 0,
  );
  const reserved = await committedOfferingQuantities(db, configured, false);
  // Rentals are validated for the actual dates selected by the customer.
  return configured.filter(
    (offer) =>
      (offeringQuantity(offer) ?? 0) >
      (reserved.get(offeringKey(offer.additionalServiceId, offer.facilityId)) ??
        0),
  );
}

export const MAX_OFFERING_QUANTITY = 2_147_483_647;
export function explicitPrice(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new BadRequestException('Nhập giá VND nguyên lớn hơn 0 cho cơ sở.');
  return BigInt(value);
}
