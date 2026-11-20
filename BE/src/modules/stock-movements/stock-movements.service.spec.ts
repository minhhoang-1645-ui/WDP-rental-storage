import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { StockMovementsService } from './stock-movements.service.js';

const runId = randomUUID().slice(0, 8);
const ids = { facility: `stock-facility-${runId}`, type: `stock-type-${runId}`, unit: `stock-unit-${runId}`, customer: `stock-customer-${runId}`, other: `stock-other-${runId}`, staff: `stock-staff-${runId}`, manager: `stock-manager-${runId}` };
const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });

describe('Customer stock movements V1', () => {
  let prisma: PrismaService;
  let service: StockMovementsService;
  let contractId: string;
  const customer = actor(ids.customer, 'CUSTOMER');
  const other = actor(ids.other, 'CUSTOMER');
  const staff = actor(ids.staff, 'STAFF');
  const manager = actor(ids.manager, 'MANAGER');

  beforeAll(async () => {
    prisma = new PrismaService(); await prisma.$connect(); service = new StockMovementsService(prisma);
    await prisma.user.createMany({ data: [customer, other, staff, manager].map((user) => ({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, passwordHash: 'test-only-hash' })) });
    await prisma.facility.create({ data: { id: ids.facility, code: `STOCK-${runId}`, name: 'Stock movement test', address: 'Test' } });
    await prisma.storageType.create({ data: { id: ids.type, facilityId: ids.facility, code: `ST-${runId}`, name: 'Stock test', sizeId: 'small', sizeName: 'Small', kicker: 'Test', condition: 'STANDARD', widthCm: 100, lengthCm: 100, heightCm: 200, roomEquivalent: 'Test', capacity: 'Test', boxCount: '1', suitableItems: ['Test'], image: 'https://example.test/a.jpg', imageAlt: 'Test', floor: 'G', access: 'Test', features: ['Test'], monthlyRate: 1000000 } });
    const unit = await prisma.storageUnit.create({ data: { id: ids.unit, storageTypeId: ids.type, unitNumber: `ST-${runId}-01`, status: 'OCCUPIED' } });
    const start = new Date('2026-10-01T00:00:00.000Z'), end = new Date('2027-10-01T00:00:00.000Z');
    const reservation = await prisma.reservation.create({ data: { reservationCode: `WDP-STOCK-${runId}`, customerId: ids.customer, facilityId: ids.facility, storageTypeId: ids.type, quantity: 1, startDate: start, endDate: end, periodMode: 'DURATION', durationMonths: 12, availabilitySnapshot: {}, quoteSnapshot: {} as Prisma.InputJsonValue, status: 'CONFIRMED', idempotencyKey: `stock-reservation-${runId}` } });
    const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: start, plannedEndDate: end } });
    const contract = await prisma.rentalContract.create({ data: { contractCode: `${reservation.reservationCode}-C01`, reservationId: reservation.id, reservationUnitId: allocation.id, status: 'ACTIVE', startDate: start, endDate: end, activatedAt: start } });
    contractId = contract.id;
  });

  afterEach(async () => { await prisma.stockMovementLine.deleteMany({ where: { stockMovement: { rentalContractId: contractId } } }); await prisma.stockMovement.deleteMany({ where: { rentalContractId: contractId } }); await prisma.storedItem.deleteMany({ where: { rentalContractId: contractId } }); });
  afterAll(async () => { await prisma.rentalContract.deleteMany({ where: { id: contractId } }); await prisma.reservationUnit.deleteMany({ where: { storageUnitId: ids.unit } }); await prisma.reservation.deleteMany({ where: { storageTypeId: ids.type } }); await prisma.storageUnit.delete({ where: { id: ids.unit } }); await prisma.storageType.delete({ where: { id: ids.type } }); await prisma.facility.delete({ where: { id: ids.facility } }); await prisma.user.deleteMany({ where: { id: { in: Object.values(ids).filter((id) => id.includes('customer') || id.includes('other') || id.includes('staff') || id.includes('manager')) } } }); await prisma.$disconnect(); });

  it('keeps REQUESTED movement non-mutating, then assigned Staff completes IN atomically', async () => {
    const requested = await service.create(customer, { rentalContractId: contractId, type: 'IN', lines: [{ name: 'Thùng hồ sơ', unit: 'thùng', quantity: 4 }] }, `stock-in-${runId}`);
    expect(requested.status).toBe('REQUESTED'); expect(requested.lines[0].storedItem.balance).toBe(0);
    const assigned = await service.assign(requested.id, staff.id, manager); expect(assigned.status).toBe('ASSIGNED');
    await expect(service.complete(requested.id, {}, actor('wrong-staff', 'STAFF'))).rejects.toBeInstanceOf(ForbiddenException);
    const completed = await service.complete(requested.id, { note: 'Đã kiểm đếm', lines: requested.lines.map(line => ({ lineId: line.id, actualQty: line.requestedQty })) }, staff);
    expect(completed.status).toBe('COMPLETED'); expect(completed.lines[0].actualQty).toBe(4);
    expect((await prisma.storedItem.findUniqueOrThrow({ where: { id: completed.lines[0].storedItem.id } })).balance).toBe(4);
  });

  it('preserves ownership and applies OUT against completed balance', async () => {
    const inbound = await service.create(customer, { rentalContractId: contractId, type: 'IN', lines: [{ name: 'Ghế gấp', unit: 'cái', quantity: 3 }] }, `stock-in2-${runId}`);
    await service.assign(inbound.id, staff.id, manager); const received = await service.complete(inbound.id, { lines: inbound.lines.map(line => ({ lineId: line.id, actualQty: line.requestedQty })) }, staff);
    await expect(service.getCustomer(other.id, inbound.id)).rejects.toThrow();
    const outbound = await service.create(customer, { rentalContractId: contractId, type: 'OUT', lines: [{ storedItemId: received.lines[0].storedItem.id, quantity: 2 }] }, `stock-out-${runId}`);
    await service.assign(outbound.id, staff.id, manager); await service.complete(outbound.id, { lines: outbound.lines.map(line => ({ lineId: line.id, actualQty: line.requestedQty })) }, staff);
    expect((await prisma.storedItem.findUniqueOrThrow({ where: { id: received.lines[0].storedItem.id } })).balance).toBe(1);
  });

  it('keeps scheduled and actual time separate and reconciles repeated movements without changing rental state', async () => {
    vi.setSystemTime(new Date('2026-11-14T03:00:00.000Z'));
    try {
      const scheduledAt = '2026-12-14T05:12:00.000Z';
      const inbound = await service.create(customer, {
        rentalContractId: contractId, type: 'IN', scheduledAt,
        lines: [{ name: 'Hồ sơ', unit: 'thùng', quantity: 4 }, { name: 'Ghế', unit: 'cái', quantity: 2 }],
      }, `stock-schedule-in-${runId}`);
      await service.assign(inbound.id, staff.id, manager);
      const inboundCounts = inbound.lines.map(line => ({ lineId: line.id, actualQty: line.storedItem.name === 'Hồ sơ' ? 3 : 2 }));
      await expect(service.complete(inbound.id, { lines: inboundCounts }, staff)).rejects.toThrow('lý do chênh lệch');
      const received = await service.complete(inbound.id, { lines: inboundCounts, note: 'Khách mang thiếu một thùng.' }, staff);
      const receivedItem = received.lines.find(line => line.storedItem.name === 'Hồ sơ')!;
      expect(received).toMatchObject({ scheduledAt, completedAt: '2026-11-14T03:00:00.000Z' });
      expect(receivedItem).toMatchObject({ requestedQty: 4, actualQty: 3, storedItem: { balance: 3, unit: 'thùng' } });
      const itemId = receivedItem.storedItem.id;
      const otherStaff = actor('wrong-staff', 'STAFF');
      const itemPage = { page: 1, limit: 5, search: receivedItem.storedItem.itemCode, storageUnitId: ids.unit };
      await expect(service.listOperationalStoredItems(staff, itemPage)).resolves.toMatchObject({
        total: 1, selectedStorageUnit: { id: ids.unit }, items: [{ id: itemId, balance: 3, currentStorageUnit: { id: ids.unit } }],
      });
      await expect(service.listOperationalStoredItems(otherStaff, itemPage)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listOperationalStoredItems(otherStaff, { page: 1, limit: 5 })).resolves.toMatchObject({ total: 0, items: [] });
      await expect(service.listStaffStoredItemHistory(otherStaff, itemId, itemPage)).rejects.toThrow('Không tìm thấy mặt hàng');

      const outgoingTime = '2026-12-16T03:01:00.000Z';
      const outbound = await service.create(customer, {
        rentalContractId: contractId, type: 'OUT', scheduledAt: outgoingTime,
        lines: [{ storedItemId: receivedItem.storedItem.id, quantity: 2 }],
      }, `stock-schedule-out-${runId}`);
      await service.assign(outbound.id, staff.id, manager);
      await expect(service.getStaff(actor('wrong-staff', 'STAFF'), outbound.id)).rejects.toThrow('Không tìm thấy');
      const counts = [{ lineId: outbound.lines[0].id, actualQty: 3 }];
      await expect(service.complete(outbound.id, { lines: counts }, staff)).rejects.toThrow('lý do chênh lệch');
      await expect(service.complete(outbound.id, { lines: [{ ...counts[0], actualQty: 4 }], note: 'Khách yêu cầu thêm.' }, staff)).rejects.toThrow('Không đủ tồn');
      vi.setSystemTime(new Date(outgoingTime));
      const delivered = await service.complete(outbound.id, { lines: counts, note: 'Đã giao thêm một thùng.' }, staff);
      expect(delivered).toMatchObject({ scheduledAt: outgoingTime, completedAt: outgoingTime, status: 'COMPLETED' });
      expect(delivered.lines[0]).toMatchObject({ requestedQty: 2, actualQty: 3, storedItem: { balance: 0 } });
      const reread = await service.getStaff(staff, inbound.id);
      expect(reread.rentalContract).not.toHaveProperty('reservation');
      expect(reread.lines.find(line => line.id === receivedItem.id)).toMatchObject({ requestedQty: 4, actualQty: 3, storedItem: { balance: 0 } });
      expect(reread.history).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Tạo phiếu', actor: customer.fullName }),
        expect.objectContaining({ label: 'Phân công', actor: manager.fullName }),
        expect.objectContaining({ label: 'Hoàn tất giao nhận', actor: staff.fullName, at: received.completedAt }),
      ]));
      await expect(service.listOperationalStoredItems(staff, itemPage)).resolves.toMatchObject({ total: 0, items: [] });
      await expect(service.listStaffStoredItemHistory(staff, itemId, { page: 1, limit: 1 })).resolves.toMatchObject({
        total: 2, items: [{ type: 'OUT', movementId: outbound.id, completedAt: outgoingTime, actualQty: 3 }],
      });
      await expect(service.listStaffStoredItemHistory(staff, itemId, { page: 2, limit: 1 })).resolves.toMatchObject({
        total: 2, items: [{ type: 'IN', movementId: inbound.id, completedAt: received.completedAt, actualQty: 3 }],
      });
      const destination = await prisma.storageUnit.create({
        data: { storageTypeId: ids.type, unitNumber: `ST-${runId}-02`, status: 'AVAILABLE' },
      });
      const contract = await prisma.rentalContract.findUniqueOrThrow({ where: { id: contractId } });
      try {
        await prisma.reservationUnit.update({ where: { id: contract.reservationUnitId }, data: { storageUnitId: destination.id } });
        await expect(service.getStaff(staff, inbound.id)).resolves.toMatchObject({
          currentStorageUnit: null, storageUnitAtCompletion: { id: ids.unit },
          lines: expect.arrayContaining([expect.objectContaining({ storedItem: expect.objectContaining({ id: itemId, balance: null }) })]),
        });
        await expect(service.listStaffStoredItemHistory(staff, itemId, { page: 1, limit: 5 })).rejects.toThrow('Không tìm thấy mặt hàng');
      } finally {
        await prisma.reservationUnit.update({ where: { id: contract.reservationUnitId }, data: { storageUnitId: ids.unit } });
        await prisma.storageUnit.delete({ where: { id: destination.id } });
      }
      await expect(service.listStaff(staff, { page: 1, limit: 5, status: 'ASSIGNED' })).resolves.toMatchObject({ total: 0, items: [] });
      expect((await prisma.rentalContract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe('ACTIVE');
      expect((await prisma.storageUnit.findUniqueOrThrow({ where: { id: ids.unit } })).status).toBe('OCCUPIED');
    } finally {
      vi.useRealTimers();
    }
  });
});
