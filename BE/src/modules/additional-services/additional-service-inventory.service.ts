import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AdditionalServiceInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async publicAvailability(serviceId: string, input: Record<string, unknown>) {
    const service = await this.prisma.additionalService.findFirst({ where: { OR: [{ id: serviceId }, { code: serviceId }] }, include: { inventory: true } });
    if (!service?.inventory) throw new NotFoundException('Không tìm thấy tồn kho add-on.');
    const quantity = this.quantity(input.quantity);
    if (service.kind === 'PURCHASE') return this.purchaseAvailability(this.prisma, service, quantity);
    const { startDate, endDate } = this.interval(input);
    return this.rentalAvailability(this.prisma, service, quantity, startDate, endDate);
  }

  async managerList() { const items = await this.prisma.additionalService.findMany({ include: { inventory: true }, orderBy: { code: 'asc' } }); return Promise.all(items.map((item) => this.managerView(item))); }
  async managerGet(serviceId: string) { const item = await this.prisma.additionalService.findFirst({ where: { OR: [{ id: serviceId }, { code: serviceId }] }, include: { inventory: true } }); if (!item?.inventory) throw new NotFoundException('Không tìm thấy tồn kho add-on.'); return this.managerView(item); }
  async update(serviceId: string, input: Record<string, unknown>) {
    const item = await this.prisma.additionalService.findFirst({ where: { OR: [{ id: serviceId }, { code: serviceId }] }, include: { inventory: true } });
    if (!item?.inventory) throw new NotFoundException('Không tìm thấy tồn kho add-on.');
    const value = item.kind === 'PURCHASE' ? this.nonNegative(input.stockOnHand, 'stockOnHand') : this.nonNegative(input.rentalCapacity, 'rentalCapacity');
    if (item.kind === 'PURCHASE') { const state = await this.purchaseAvailability(this.prisma, item, 0); if (value < state.reservedQuantity) throw new ConflictException({ code: 'INVENTORY_REDUCTION_CONFLICTS_WITH_RESERVED_STOCK', message: 'Tồn kho mới thấp hơn số lượng đã giữ.' }); return this.prisma.additionalServiceInventory.update({ where: { additionalServiceId: item.id }, data: { stockOnHand: value } }); }
    const peak = await this.peakRental(this.prisma, item.id); if (value < peak) throw new ConflictException({ code: 'INVENTORY_REDUCTION_CONFLICTS_WITH_EXISTING_BOOKINGS', message: 'Công suất mới thấp hơn lượng thuê chồng lấp lớn nhất.' }); return this.prisma.additionalServiceInventory.update({ where: { additionalServiceId: item.id }, data: { rentalCapacity: value } });
  }

  async assertQuoteAvailable(tx: Prisma.TransactionClient, services: any[]) {
    const ids = services.map((service) => service.serviceId); if (!ids.length) return;
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdditionalServiceInventory" WHERE "additionalServiceId" IN (${Prisma.join(ids)}) FOR UPDATE`);
    for (const selection of services) {
      const service = await tx.additionalService.findUnique({ where: { id: selection.serviceId }, include: { inventory: true } });
      if (!service?.inventory) throw new ConflictException({ code: 'ADDITIONAL_SERVICE_INVENTORY_NOT_CONFIGURED', message: 'Add-on chưa có tồn kho được cấu hình.' });
      if (service.kind === 'PURCHASE') { const state = await this.purchaseAvailability(tx, service, selection.quantity); if (!state.available) throw new ConflictException({ code: 'PURCHASE_ITEM_OUT_OF_STOCK', message: 'Sản phẩm mua không đủ tồn kho.', serviceId: service.id, requestedQuantity: selection.quantity, availableQuantity: state.availableQuantity }); }
      else { const state = await this.rentalAvailability(tx, service, selection.quantity, selection.serviceStartDate, selection.serviceEndDate); if (!state.available) throw new ConflictException({ code: 'RENTAL_EQUIPMENT_NOT_AVAILABLE', message: 'Thiết bị thuê không đủ công suất.', serviceId: service.id, requestedQuantity: selection.quantity, availableQuantity: state.availableQuantity }); }
    }
  }

  async reservePurchases(tx: Prisma.TransactionClient, reservationId: string) { await tx.reservationService.updateMany({ where: { reservationId, serviceKindSnapshot: 'PURCHASE', fulfillmentStatus: null }, data: { fulfillmentStatus: 'RESERVED' } }); }
  async releasePurchases(tx: Prisma.TransactionClient, reservationId: string) { await tx.reservationService.updateMany({ where: { reservationId, serviceKindSnapshot: 'PURCHASE', fulfillmentStatus: 'RESERVED' }, data: { fulfillmentStatus: 'RELEASED' } }); }
  async fulfillPurchases(tx: Prisma.TransactionClient, reservationId: string) { const services = await tx.reservationService.findMany({ where: { reservationId, serviceKindSnapshot: 'PURCHASE', fulfillmentStatus: 'RESERVED' } }); for (const service of services) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdditionalServiceInventory" WHERE "additionalServiceId" = ${service.additionalServiceId} FOR UPDATE`); const inventory = await tx.additionalServiceInventory.findUnique({ where: { additionalServiceId: service.additionalServiceId } }); if (!inventory || inventory.stockOnHand === null || inventory.stockOnHand < service.quantity) throw new ConflictException({ code: 'PURCHASE_ITEM_OUT_OF_STOCK', message: 'Tồn kho thực tế không đủ để bàn giao.' }); await tx.additionalServiceInventory.update({ where: { id: inventory.id }, data: { stockOnHand: { decrement: service.quantity } } }); await tx.reservationService.update({ where: { id: service.id }, data: { fulfillmentStatus: 'FULFILLED' } }); } }

  private async managerView(item: any) { if (item.kind === 'PURCHASE') return this.purchaseAvailability(this.prisma, item, 0); return { serviceId: item.id, code: item.code, kind: item.kind, billingUnit: item.billingUnit, rentalCapacity: item.inventory.rentalCapacity }; }
  private async purchaseAvailability(db: Db, service: any, requestedQuantity: number) { const reserved = await db.reservationService.aggregate({ where: { additionalServiceId: service.id, fulfillmentStatus: 'RESERVED', reservation: { status: 'CONFIRMED' } }, _sum: { quantity: true } }); const stockOnHand = service.inventory.stockOnHand ?? 0; const reservedQuantity = reserved._sum.quantity ?? 0; const availableQuantity = stockOnHand - reservedQuantity; return { serviceId: service.id, code: service.code, kind: 'PURCHASE', billingUnit: service.billingUnit, stockOnHand, reservedQuantity, availableQuantity, requestedQuantity, available: requestedQuantity <= availableQuantity }; }
  private async rentalAvailability(db: Db, service: any, requestedQuantity: number, startDate: string, endDate: string) { const committed = await db.reservationService.aggregate({ where: { additionalServiceId: service.id, reservation: { status: 'CONFIRMED' }, serviceStartDate: { lt: this.date(endDate) }, serviceEndDate: { gt: this.date(startDate) } }, _sum: { quantity: true } }); const rentalCapacity = service.inventory.rentalCapacity ?? 0; const committedQuantity = committed._sum.quantity ?? 0; const availableQuantity = rentalCapacity - committedQuantity; return { serviceId: service.id, code: service.code, kind: 'RENTAL', billingUnit: service.billingUnit, rentalCapacity, committedQuantity, availableQuantity, requestedQuantity, available: requestedQuantity <= availableQuantity }; }
  private async peakRental(db: Db, serviceId: string) { const rows = await db.reservationService.findMany({ where: { additionalServiceId: serviceId, reservation: { status: 'CONFIRMED' }, serviceStartDate: { not: null }, serviceEndDate: { not: null } }, select: { quantity: true, serviceStartDate: true, serviceEndDate: true } }); const points = rows.flatMap((row) => [{ date: row.serviceStartDate!, amount: row.quantity }, { date: row.serviceEndDate!, amount: -row.quantity }]).sort((a, b) => a.date.getTime() - b.date.getTime() || a.amount - b.amount); let current = 0, peak = 0; for (const point of points) { current += point.amount; peak = Math.max(peak, current); } return peak; }
  private quantity(value: unknown) { return this.nonNegative(value, 'quantity', 1); }
  private nonNegative(value: unknown, field: string, minimum = 0) { const number = Number(value); if (!Number.isSafeInteger(number) || number < minimum) throw new BadRequestException(`${field} phải là số nguyên >= ${minimum}.`); return number; }
  private interval(input: Record<string, unknown>) { const startDate = typeof input.startDate === 'string' ? input.startDate : '', endDate = typeof input.endDate === 'string' ? input.endDate : ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate <= startDate) throw new BadRequestException('startDate và endDate không hợp lệ.'); return { startDate, endDate }; }
  private date(value: string) { return new Date(`${value}T00:00:00.000Z`); }
}
