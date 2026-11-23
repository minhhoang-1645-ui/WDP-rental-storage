import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

// Catalog IDs remain the historical service IDs; prices/stock are scoped offers.
export type OfferingRecord = Prisma.FacilityServiceOfferingGetPayload<{
  include: { additionalService: true };
}>;
export function offeringView(offer: OfferingRecord) {
  return {
    ...offer.additionalService,
    facilityId: offer.facilityId,
    offeringId: offer.id,
    unitPrice: offer.unitPrice,
    isActive: offer.isActive && offer.additionalService.isActive,
    inventory: offer,
    offerings: undefined,
  };
}
export async function pricedServices(
  db: Prisma.TransactionClient,
  ids: string[],
  facilityId: string,
) {
  if (!ids.length) return [];
  const offers = await db.facilityServiceOffering.findMany({
    where: {
      facilityId,
      additionalServiceId: { in: ids },
      isActive: true,
      additionalService: { isActive: true },
    },
    include: { additionalService: true },
  });
  return offers.map(offeringView);
}
export const publicOfferingScope = {
  isActive: true,
  additionalService: { isActive: true },
  facility: { bookingEnabled: true, operationalStatus: 'OPEN' },
} as const;
export function explicitPrice(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new BadRequestException('Nhập giá VND nguyên lớn hơn 0 cho cơ sở.');
  return BigInt(value);
}
