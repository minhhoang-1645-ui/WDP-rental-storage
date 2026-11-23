import {
  offeringView,
  publicOfferingScope,
  type OfferingRecord,
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
    return Promise.all(items.map((o) => this.managerView(offeringView(o))));
  }
  async managerGet(serviceId: string, actor: PublicUser, facilityId?: string) {
    const item = await this.scoped(this.prisma, serviceId, actor, facilityId);
    return this.managerView(item);
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
        const item = await this.scoped(
          tx,
          serviceId,
          actor,
          typeof input.facilityId === 'string' ? input.facilityId : undefined,
        );
        await assertFacility(tx, actor, item.facilityId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "FacilityServiceOffering" WHERE id=${item.inventory.id} FOR UPDATE`,
        );
        const value =
          item.kind === 'PURCHASE'
            ? this.nonNegative(input.stockOnHand, 'stockOnHand')
            : this.nonNegative(input.rentalCapacity, 'rentalCapacity');
        if (item.kind === 'PURCHASE') {
          const state = await this.purchaseAvailability(tx, item, 0);
          if (value < state.reservedQuantity)
            throw new ConflictException('Tồn kho thấp hơn số lượng đã giữ.');
        } else if (
          value < (await this.peakRental(tx, item.id, item.facilityId))
        )
          throw new ConflictException('Công suất thấp hơn lượng thuê đã đặt.');
        return tx.facilityServiceOffering.update({
          where: { id: item.inventory.id },
          data:
            item.kind === 'PURCHASE'
              ? { stockOnHand: value }
              : { rentalCapacity: value },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async assertQuoteAvailable(
    tx: Prisma.TransactionClient,
    services: any[],
    storageTypeId: string,
  ) {
    const ids = services.map((service) => service.serviceId);
    if (!ids.length) return;
    const target = await tx.storageType.findUnique({
      where: { id: storageTypeId },
      select: { facilityId: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy loại kho.');
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "FacilityServiceOffering" WHERE "additionalServiceId" IN (${Prisma.join(ids)}) AND "facilityId" = ${target!.facilityId} ORDER BY id FOR UPDATE`,
    );
    for (const selection of services) {
      const offer: OfferingRecord | null =
        await tx.facilityServiceOffering.findUnique({
          where: {
            additionalServiceId_facilityId: {
              additionalServiceId: selection.serviceId,
              facilityId: target!.facilityId,
            },
          },
          include: { additionalService: true },
        });
      const service: ReturnType<typeof offeringView>|null = offer ? offeringView(offer) : null;
      if (!service?.facilityId || service.facilityId !== target?.facilityId)
        throw new ConflictException(
          'Thiết bị chưa thuộc cơ sở của kho đã chọn.',
        );
      if (
        !service?.isActive ||
        !service?.inventory ||
        (service.kind === 'PURCHASE'
          ? service.inventory.stockOnHand === null
          : service.inventory.rentalCapacity === null)
      )
        throw new ConflictException({
          code: 'ADDITIONAL_SERVICE_INVENTORY_NOT_CONFIGURED',
          message: 'Add-on chưa có tồn kho được cấu hình.',
        });
      if (
        selection.unitPrice !== undefined &&
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
  async fulfillPurchases(tx: Prisma.TransactionClient, reservationId: string) {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { facilityId: true },
    });
    const services = await tx.reservationService.findMany({
      where: {
        reservationId,
        serviceKindSnapshot: 'PURCHASE',
        fulfillmentStatus: 'RESERVED',
      },
      orderBy: { additionalServiceId: 'asc' },
    });
    for (const service of services) {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "FacilityServiceOffering" WHERE "additionalServiceId"=${service.additionalServiceId} AND "facilityId"=${reservation.facilityId} FOR UPDATE`,
      );
      const inventory = await tx.facilityServiceOffering.findUnique({
        where: {
          additionalServiceId_facilityId: {
            additionalServiceId: service.additionalServiceId,
            facilityId: reservation.facilityId,
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
      await tx.reservationService.update({
        where: { id: service.id },
        data: { fulfillmentStatus: 'FULFILLED' },
      });
    }
  }

  private async managerView(item: any) {
    if (item.kind === 'PURCHASE')
      return this.purchaseAvailability(this.prisma, item, 0);
    return {
      facilityId: item.facilityId,
      serviceId: item.id,
      code: item.code,
      kind: item.kind,
      billingUnit: item.billingUnit,
      rentalCapacity: item.inventory.rentalCapacity,
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
        reservation: { status: 'CONFIRMED', facilityId: service.facilityId },
      },
      _sum: { quantity: true },
    });
    const stockOnHand = service.inventory.stockOnHand;
    const reservedQuantity = reserved._sum.quantity ?? 0;
    const availableQuantity = stockOnHand - reservedQuantity;
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
      available: stockOnHand !== null && requestedQuantity <= availableQuantity,
    };
  }
  private async rentalAvailability(
    db: Db,
    service: any,
    requestedQuantity: number,
    startDate: string,
    endDate: string,
  ) {
    const committed = await db.reservationService.aggregate({
      where: {
        additionalServiceId: service.id,
        reservation: { status: 'CONFIRMED', facilityId: service.facilityId },
        serviceStartDate: { lt: this.date(endDate) },
        serviceEndDate: { gt: this.date(startDate) },
      },
      _sum: { quantity: true },
    });
    const rentalCapacity = service.inventory.rentalCapacity;
    const committedQuantity = committed._sum.quantity ?? 0;
    const availableQuantity = rentalCapacity - committedQuantity;
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
  private async peakRental(db: Db, serviceId: string, facilityId: string) {
    const rows = await db.reservationService.findMany({
      where: {
        additionalServiceId: serviceId,
        reservation: { status: 'CONFIRMED', facilityId },
        serviceStartDate: { not: null },
        serviceEndDate: { not: null },
      },
      select: { quantity: true, serviceStartDate: true, serviceEndDate: true },
    });
    const points = rows
      .flatMap((row) => [
        { date: row.serviceStartDate!, amount: row.quantity },
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
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum)
      throw new BadRequestException(
        `${field} phải là số nguyên >= ${minimum}.`,
      );
    return number;
  }
  private interval(input: Record<string, unknown>) {
    const startDate =
        typeof input.startDate === 'string' ? input.startDate : '',
      endDate = typeof input.endDate === 'string' ? input.endDate : '';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      endDate <= startDate
    )
      throw new BadRequestException('startDate và endDate không hợp lệ.');
    return { startDate, endDate };
  }
  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
}
