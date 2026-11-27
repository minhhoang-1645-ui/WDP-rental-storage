import {
  eligibleServiceFacility,
  offeringView,
  publicOfferingScope,
  newServiceTerms,
  serviceFacilityScope,
  type OfferingRecord,
  MAX_OFFERING_QUANTITY,
} from './service-offerings.js';
import type { PublicUser } from '../auth/auth.types.js';
import {
  assertFacility,
  facilityIds,
} from '../facility-access/facility-access.service.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday, rentalMonthEnd } from '../../business-date.js';

export function purchasedPhysicalUnit(quote: unknown, serviceId: string): string | null {
  if (!quote || typeof quote !== 'object' || !('services' in quote) || !Array.isArray(quote.services)) return null;
  const unit: unknown = quote.services.find(entry => entry?.serviceId === serviceId)?.physicalUnit;
  return typeof unit === 'string' && unit.trim() ? unit : null;
}

const emptyActivity = { soldByUnit: [], completedRentalCount: 0 };
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AdditionalServiceInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async publicAvailability(serviceId: string, input: Record<string, unknown>) {
    const offers = await this.prisma.facilityServiceOffering.findMany({
      where: {
        ...publicOfferingScope,
        ...(typeof input.facilityId === 'string'
          ? { facilityId: input.facilityId }
          : {}),
        additionalService: {
          isActive: true,
          ...newServiceTerms,
          OR: [{ id: serviceId }, { code: serviceId }],
        },
      },
      include: { additionalService: true },
    });
    if (!offers.length)
      throw new NotFoundException('Thiết bị chưa được cấu hình tại cơ sở.');
    if (offers.length !== 1)
      throw new BadRequestException('Chọn cơ sở để kiểm tra thiết bị.');
    const service = offeringView(offers[0]);
    if (
      (service.kind === 'PURCHASE' && service.inventory.stockOnHand === null) ||
      (service.kind === 'RENTAL' && service.inventory.rentalCapacity === null)
    )
      throw new ConflictException('Chưa xác nhận tồn kho tại cơ sở.');
    const quantity = this.quantity(input.quantity);
    if (service.kind === 'PURCHASE')
      return this.purchaseAvailability(this.prisma, service, quantity);
    const { startDate, endDate } = this.interval(input);
    const months = (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
      Number(endDate.slice(5, 7)) - Number(startDate.slice(5, 7));
    if (rentalMonthEnd(startDate, months) !== endDate)
      throw new BadRequestException('Thiết bị thuê tháng cần thời gian sử dụng đủ số tháng theo lịch.');
    return this.rentalAvailability(
      this.prisma,
      service,
      quantity,
      startDate,
      endDate,
    );
  }

  async managerList(actor: PublicUser) {
    managerReservationScope(actor);
    const ids = await facilityIds(this.prisma, actor);
    const items = await this.prisma.facilityServiceOffering.findMany({
      where: { facilityId: { in: ids } },
      include: { additionalService: true },
    });
    const activity = await this.managerActivity(ids, items.map(item => item.additionalServiceId));
    return Promise.all(items.map(async offer => ({
      ...await this.managerView(offeringView(offer)),
      ...(activity.get(offer.facilityId + ':' + offer.additionalServiceId) ?? emptyActivity),
    })));
  }
  async managerGet(serviceId: string, actor: PublicUser, facilityId?: string) {
    const item = await this.scoped(this.prisma, serviceId, actor, facilityId);
    const activity = await this.managerActivity([item.facilityId], [item.id]);
    return { ...await this.managerView(item), ...(activity.get(item.facilityId + ':' + item.id) ?? emptyActivity) };
  }
  private async managerActivity(facilityIds: string[], serviceIds: string[]) {
    const totals = new Map<string, { soldByUnit: { unit: string | null; quantity: number }[]; completedRentalCount: number }>();
    if (!facilityIds.length || !serviceIds.length) return totals;
    const lines = await this.prisma.reservationService.findMany({
      where: {
        additionalServiceId: { in: serviceIds },
        reservation: { status: 'CONFIRMED' },
        AND: [{ OR: facilityIds.map(serviceFacilityScope) }],
        OR: [
          { serviceKindSnapshot: 'PURCHASE', fulfillmentStatus: 'FULFILLED',
            reservation: { invoices: { some: { type: 'INITIAL', status: 'PAID' } } } },
          { serviceKindSnapshot: 'RENTAL', serviceEndDate: { lte: businessToday() },
            reservation: { appointments: { some: { status: 'COMPLETED' } } } },
        ],
      },
      select: {
        additionalServiceId: true, quantity: true, serviceKindSnapshot: true, serviceFacilityId: true,
        reservation: { select: { facilityId: true, quoteSnapshot: true } },
      },
    });
    for (const line of lines) {
      const key = (line.serviceFacilityId ?? line.reservation.facilityId) + ':' + line.additionalServiceId;
      const total = totals.get(key) ?? { soldByUnit: [], completedRentalCount: 0 };
      if (line.serviceKindSnapshot === 'RENTAL') total.completedRentalCount++;
      else {
        const unit = purchasedPhysicalUnit(line.reservation.quoteSnapshot, line.additionalServiceId);
        const bucket = total.soldByUnit.find(entry => entry.unit === unit);
        if (bucket) bucket.quantity += line.quantity;
        else total.soldByUnit.push({ unit, quantity: line.quantity });
      }
      totals.set(key, total);
    }
    return totals;
  }

  private async scoped(
    db: Db,
    id: string,
    actor: PublicUser,
    facilityId?: string,
  ) {
    managerReservationScope(actor);
    const ids = await facilityIds(db, actor);
    const offers = await db.facilityServiceOffering.findMany({
      where: {
        facilityId: { in: ids, ...(facilityId ? { equals: facilityId } : {}) },
        additionalService: { OR: [{ id }, { code: id }] },
      },
      include: { additionalService: true },
    });
    if (!offers.length)
      throw new NotFoundException('Không tìm thấy cấu hình dịch vụ tại cơ sở.');
    if (offers.length !== 1)
      throw new BadRequestException('Chọn cơ sở của dịch vụ.');
    return offeringView(offers[0]);
  }
  async update(
    serviceId: string,
    input: Record<string, unknown>,
    actor: PublicUser,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "AdditionalService" WHERE id = ${serviceId} OR code = ${serviceId} ORDER BY id FOR SHARE`);
        const item = await this.scoped(
          tx,
          serviceId,
          actor,
          typeof input.facilityId === 'string' ? input.facilityId : undefined,
        );
        await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', actor.id);
        await assertFacility(tx, actor, item.facilityId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "FacilityServiceOffering" WHERE id=${item.inventory.id} FOR UPDATE`,
        );
        if (item.inventory.configurationReview)
          throw new ConflictException('Xác nhận cấu hình mới trước khi cập nhật số lượng.');
        const field = item.kind === 'PURCHASE' ? 'stockOnHand' : 'rentalCapacity';
        const before = item.inventory[field];
        const value = this.nonNegative(input[field], field);
        if (input.expectedQuantity !== undefined) {
          const expected = input.expectedQuantity === null ? null : this.nonNegative(input.expectedQuantity, field);
          if (expected !== before)
            throw new ConflictException('Số lượng đã thay đổi. Vui lòng đóng biểu mẫu và tải lại số lượng mới.');
        }
        if (item.kind === 'PURCHASE') {
          const state = await this.purchaseAvailability(tx, item, 0);
          if (value < state.reservedQuantity)
            throw new ConflictException('Tồn kho thấp hơn số lượng đã giữ.');
        } else if (
          value <
          (await this.peakRental(tx, item.id, item.facilityId, businessToday()))
        )
          throw new ConflictException('Tổng số thiết bị thấp hơn số lượng đã đặt đồng thời.');
        const updated = await tx.facilityServiceOffering.update({
          where: { id: item.inventory.id },
          data:
            item.kind === 'PURCHASE'
              ? { stockOnHand: value }
              : { rentalCapacity: value },
        });
        if (before !== value) await tx.auditEvent.create({ data: {
          category: 'ACTIVITY', outcome: 'SUCCESS', action: 'UPDATE_OFFERING_QUANTITY',
          actorId: actor.id, actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email,
          resource: 'facility-service-offering', resourceId: item.inventory.id,
          route: '/manager/additional-services/:id/inventory', method: 'PATCH', httpStatus: 200,
          metadata: { facilityId: item.facilityId, field, before, after: value },
        } });
        // Prisma returns unitPrice as BigInt. Keep the inventory response JSON-safe
        // and return only inventory fields, without leaking the pricing record.
        return {
          id: updated.id,
          additionalServiceId: updated.additionalServiceId,
          facilityId: updated.facilityId,
          stockOnHand: updated.stockOnHand,
          rentalCapacity: updated.rentalCapacity,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      },
      { isolationLevel: 'Serializable' },
    ).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new ConflictException('Số lượng vừa thay đổi. Vui lòng đóng biểu mẫu và tải lại số lượng mới.');
      throw error;
    });
  }

  async assertQuoteAvailable(
    tx: Prisma.TransactionClient,
    services: any[],
    storageTypeId: string,
    existingReservation = false,
    committedDailyIds: string[] = [],
  ) {
    const ids = services.map((service) => service.serviceId);
    if (!ids.length) return;
    const target = await tx.storageType.findUnique({
      where: { id: storageTypeId },
      select: { facilityId: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy loại kho.');
    // Serialize final selection validation with global catalog updates.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AdditionalService" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "FacilityServiceOffering" WHERE "additionalServiceId" IN (${Prisma.join(ids)}) AND "facilityId" = ${target!.facilityId} ORDER BY id FOR UPDATE`,
    );
    for (const selection of services) {
      const offer: (OfferingRecord & {
        facility: Pick<Prisma.FacilityGetPayload<object>, 'bookingEnabled' | 'operationalStatus'>;
      }) | null = await tx.facilityServiceOffering.findUnique({
          where: {
            additionalServiceId_facilityId: {
              additionalServiceId: selection.serviceId,
              facilityId: target!.facilityId,
            },
          },
          include: { additionalService: true, facility: { select: { bookingEnabled: true, operationalStatus: true } } },
        });
      const service: ReturnType<typeof offeringView> | null = offer
        ? offeringView(offer)
        : null;
      if (!service?.facilityId || service.facilityId !== target?.facilityId)
        throw new ConflictException(
          'Thiết bị chưa thuộc cơ sở của kho đã chọn.',
        );
      if (!existingReservation && service.kind === 'RENTAL' && service.billingUnit === 'DAY' &&
        !committedDailyIds.includes(selection.serviceId))
        throw new ConflictException('Thiết bị thuê ngày cũ đã ngừng nhận giao dịch mới.');
      if (
        (!existingReservation && (!offer?.facility.bookingEnabled || offer.facility.operationalStatus !== eligibleServiceFacility.operationalStatus ||
          !service.isActive || (service.unitPrice ?? 0n) <= 0n)) ||
        (service.kind === 'PURCHASE'
          ? service.inventory.stockOnHand === null
          : service.inventory.rentalCapacity === null)
      )
        throw new ConflictException({
          code: 'ADDITIONAL_SERVICE_INVENTORY_NOT_CONFIGURED',
          message: 'Add-on chưa có tồn kho được cấu hình.',
        });
      if (!existingReservation && (
        selection.kind !== service.kind || selection.billingUnit !== service.billingUnit ||
        (selection.physicalUnit ?? null) !== (service.physicalUnit ?? null)
      )) throw new ConflictException('Cấu hình dịch vụ vừa thay đổi. Vui lòng lấy báo giá mới.');
      if (
        !existingReservation && selection.unitPrice !== undefined &&
        (service.unitPrice === null ||
          BigInt(selection.unitPrice) !== service.unitPrice)
      )
        throw new ConflictException(
          'Giá dịch vụ vừa thay đổi. Vui lòng lấy báo giá mới.',
        );
      if (service.kind === 'PURCHASE') {
        const state = await this.purchaseAvailability(
          tx,
          service,
          selection.quantity,
        );
        if (!state.available)
          throw new ConflictException({
            code: 'PURCHASE_ITEM_OUT_OF_STOCK',
            message: 'Sản phẩm mua không đủ tồn kho.',
            serviceId: service.id,
            requestedQuantity: selection.quantity,
            availableQuantity: state.availableQuantity,
          });
      } else {
        const state = await this.rentalAvailability(
          tx,
          service,
          selection.quantity,
          selection.serviceStartDate,
          selection.serviceEndDate,
        );
        if (!state.available)
          throw new ConflictException({
            code: 'RENTAL_EQUIPMENT_NOT_AVAILABLE',
            message: 'Thiết bị thuê không đủ công suất.',
            serviceId: service.id,
            requestedQuantity: selection.quantity,
            availableQuantity: state.availableQuantity,
          });
      }
    }
  }

  async reservePurchases(tx: Prisma.TransactionClient, reservationId: string) {
    await tx.reservationService.updateMany({
      where: {
        reservationId,
        serviceKindSnapshot: 'PURCHASE',
        fulfillmentStatus: null,
      },
      data: { fulfillmentStatus: 'RESERVED' },
    });
  }
  async releasePurchases(tx: Prisma.TransactionClient, reservationId: string) {
    await tx.reservationService.updateMany({
      where: {
        reservationId,
        serviceKindSnapshot: 'PURCHASE',
        fulfillmentStatus: 'RESERVED',
      },
      data: { fulfillmentStatus: 'RELEASED' },
    });
  }
  async fulfillPurchases(tx: Prisma.TransactionClient, reservationId: string, confirmedLineIds: string[]) {
    const delivered: string[] = [];
    if (!confirmedLineIds.length) return delivered;
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { facilityId: true },
    });
    const services = await tx.reservationService.findMany({
      where: {
        reservationId,
        serviceKindSnapshot: 'PURCHASE',
        fulfillmentStatus: 'RESERVED',
        id: { in: confirmedLineIds },
      },
      orderBy: { additionalServiceId: 'asc' },
    });
    for (const service of services) {
      const facilityId = service.serviceFacilityId ?? reservation.facilityId;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "FacilityServiceOffering" WHERE "additionalServiceId"=${service.additionalServiceId} AND "facilityId"=${facilityId} FOR UPDATE`,
      );
      const claimed = await tx.reservationService.updateMany({
        where: { id: service.id, fulfillmentStatus: 'RESERVED' },
        data: { fulfillmentStatus: 'FULFILLED' },
      });
      if (!claimed.count) continue;
      const inventory = await tx.facilityServiceOffering.findUnique({
        where: {
          additionalServiceId_facilityId: {
            additionalServiceId: service.additionalServiceId,
            facilityId,
          },
        },
      });
      if (
        !inventory ||
        inventory.stockOnHand === null ||
        inventory.stockOnHand < service.quantity
      )
        throw new ConflictException('Chưa đủ tồn kho thực tế để bàn giao.');
      await tx.facilityServiceOffering.update({
        where: { id: inventory.id },
        data: { stockOnHand: { decrement: service.quantity } },
      });
      delivered.push(service.id);
    }
    return delivered;
  }

  private async managerView(item: ReturnType<typeof offeringView>) {
    // A pending review keeps the stored quantity in its last approved configuration.
    const review = item.inventory.configurationReview as { before: { kind: typeof item.kind; billingUnit: typeof item.billingUnit } } | null;
    const definition = review?.before ?? item;
    if (definition.kind === 'PURCHASE')
      return this.purchaseAvailability(this.prisma, { ...item, billingUnit: definition.billingUnit }, 0);
    return {
      facilityId: item.facilityId,
      serviceId: item.id,
      code: item.code,
      kind: definition.kind,
      billingUnit: definition.billingUnit,
      rentalCapacity: item.inventory.rentalCapacity,
      peakCommittedQuantity: item.inventory.configurationReview ? undefined :
        await this.peakRental(this.prisma, item.id, item.facilityId, businessToday()),
    };
  }
  private async purchaseAvailability(
    db: Db,
    service: any,
    requestedQuantity: number,
  ) {
    const reserved = await db.reservationService.aggregate({
      where: {
        additionalServiceId: service.id,
        fulfillmentStatus: 'RESERVED',
        reservation: { status: 'CONFIRMED' }, ...serviceFacilityScope(service.facilityId),
      },
      _sum: { quantity: true },
    });
    const stockOnHand = service.inventory.stockOnHand;
    const reservedQuantity = reserved._sum.quantity ?? 0;
    const availableQuantity =
      stockOnHand === null ? null : Math.max(0, stockOnHand - reservedQuantity);
    return {
      facilityId: service.facilityId,
      serviceId: service.id,
      code: service.code,
      kind: 'PURCHASE',
      billingUnit: service.billingUnit,
      stockOnHand,
      reservedQuantity,
      availableQuantity,
      requestedQuantity,
      available:
        availableQuantity !== null && requestedQuantity <= availableQuantity,
    };
  }
  private async rentalAvailability(
    db: Db,
    service: any,
    requestedQuantity: number,
    startDate: string,
    endDate: string,
  ) {
    const committedQuantity = await this.peakRental(
      db,
      service.id,
      service.facilityId,
      this.date(startDate),
      this.date(endDate),
    );
    const rentalCapacity = service.inventory.rentalCapacity;
    const availableQuantity = Math.max(0, rentalCapacity - committedQuantity);
    return {
      facilityId: service.facilityId,
      serviceId: service.id,
      code: service.code,
      kind: 'RENTAL',
      billingUnit: service.billingUnit,
      rentalCapacity,
      committedQuantity,
      availableQuantity,
      requestedQuantity,
      available: requestedQuantity <= availableQuantity,
    };
  }
  private async peakRental(
    db: Db,
    serviceId: string,
    facilityId: string,
    start: Date,
    end?: Date,
  ) {
    const rows = await db.reservationService.findMany({
      where: {
        additionalServiceId: serviceId,
        serviceKindSnapshot: 'RENTAL',
        reservation: { status: 'CONFIRMED' }, ...serviceFacilityScope(facilityId),
        AND: [{ OR: [{ fulfillmentStatus: null }, { fulfillmentStatus: { not: 'RELEASED' } }] }],
        serviceStartDate: end ? { lt: end } : { not: null },
        serviceEndDate: { gt: start },
      },
      select: { quantity: true, serviceStartDate: true, serviceEndDate: true },
    });
    const points = rows
      .flatMap((row) => [
        {
          date: row.serviceStartDate! < start ? start : row.serviceStartDate!,
          amount: row.quantity,
        },
        { date: row.serviceEndDate!, amount: -row.quantity },
      ])
      .sort(
        (a, b) => a.date.getTime() - b.date.getTime() || a.amount - b.amount,
      );
    let current = 0,
      peak = 0;
    for (const point of points) {
      current += point.amount;
      peak = Math.max(peak, current);
    }
    return peak;
  }
  private quantity(value: unknown) {
    return this.nonNegative(value, 'quantity', 1);
  }
  private nonNegative(value: unknown, field: string, minimum = 0) {
    const number =
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (
      typeof number !== 'number' ||
      !Number.isSafeInteger(number) ||
      number < minimum ||
      number > MAX_OFFERING_QUANTITY
    )
      throw new BadRequestException(
        `${field === 'stockOnHand' ? 'Tồn kho' : field === 'rentalCapacity' ? 'Số lượng thiết bị' : 'Số lượng'} phải là số nguyên từ ${minimum} đến ${MAX_OFFERING_QUANTITY}.`,
      );
    return number;
  }
  private interval(input: Record<string, unknown>) {
    const startDate =
        typeof input.startDate === 'string' ? input.startDate : '',
      endDate = typeof input.endDate === 'string' ? input.endDate : '';
    if (
      !this.isCalendarDate(startDate) ||
      !this.isCalendarDate(endDate) ||
      endDate <= startDate
    )
      throw new BadRequestException(
        'Ngày bắt đầu và ngày kết thúc không hợp lệ.',
      );
    return { startDate, endDate };
  }
  private isCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = this.date(value);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }
  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
}
