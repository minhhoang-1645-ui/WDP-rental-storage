import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { AdminUsersController } from '../auth/admin-users.controller.js';
import type { PublicUser } from '../auth/auth.types.js';
import { MemoryUserRepository } from '../users/user.repository.js';
import { ManagerService } from '../manager/manager.service.js';
import { TransfersService } from './transfers.service.js';

describe('Demo Completion Pack smoke', () => {
  const prisma = new PrismaService();
  const transfers = new TransfersService(prisma);
  const managerService = new ManagerService(prisma);
  const runId = randomUUID().slice(0, 8);
  const prefix = `DEMO-${runId}`;
  const manager = { id: '', role: 'MANAGER', fullName: 'Demo Manager', email: `${prefix}-manager@example.test`, phone: '' } satisfies PublicUser;
  const staff = { id: '', role: 'STAFF', fullName: 'Demo Staff', email: `${prefix}-staff@example.test`, phone: '' } satisfies PublicUser;
  let storageTypeId: string;
  let otherStorageTypeId: string;
  let sequence = 0;

  beforeAll(async () => {
    await prisma.$connect();
    const types = await prisma.storageType.findMany({ take: 2, orderBy: { id: 'asc' } });
    if (types.length < 2) throw new Error('Demo smoke tests require at least two seeded StorageTypes.');
    storageTypeId = types[0].id; otherStorageTypeId = types[1].id;
    const users = await Promise.all([
      prisma.user.create({ data: { email: manager.email, fullName: manager.fullName, role: 'MANAGER', passwordHash: 'test-only' } }),
      prisma.user.create({ data: { email: staff.email, fullName: staff.fullName, role: 'STAFF', passwordHash: 'test-only' } }),
    ]);
    manager.id = users[0].id; staff.id = users[1].id;
  });

  afterAll(async () => {
    const reservations = await prisma.reservation.findMany({ where: { reservationCode: { startsWith: prefix } }, select: { id: true } });
    const ids = reservations.map((item) => item.id);
    await prisma.transferRequest.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.rentalContract.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.reservationUnit.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.reservation.deleteMany({ where: { id: { in: ids } } });
    await prisma.storageUnit.deleteMany({ where: { unitNumber: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix.toLowerCase() } } });
    await prisma.$disconnect();
  });

  async function activeRental(options: { contractStatus?: 'ACTIVE' | 'READY_FOR_HANDOVER'; destinationTypeId?: string } = {}) {
    sequence += 1; const marker = `${prefix}-${sequence}`;
    const customer = await prisma.user.create({ data: { email: `${marker.toLowerCase()}@example.test`, fullName: marker, role: 'CUSTOMER', passwordHash: 'test-only' } });
    const startDate = new Date('2026-10-01T00:00:00.000Z'); const endDate = new Date('2027-10-01T00:00:00.000Z');
    const reservation = await prisma.reservation.create({ data: { reservationCode: marker, customerId: customer.id, facilityId: (await prisma.storageType.findUniqueOrThrow({ where: { id: storageTypeId } })).facilityId, storageTypeId, quantity: 1, startDate, endDate, periodMode: 'DURATION', durationMonths: 12, availabilitySnapshot: {}, quoteSnapshot: { historicalAmount: 1234567 }, status: 'CONFIRMED', idempotencyKey: `${marker}-reservation` } });
    const source = await prisma.storageUnit.create({ data: { storageTypeId, unitNumber: `${marker}-SRC`, status: 'OCCUPIED' } });
    const destination = await prisma.storageUnit.create({ data: { storageTypeId: options.destinationTypeId ?? storageTypeId, unitNumber: `${marker}-DST`, status: 'AVAILABLE' } });
    const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: source.id, plannedStartDate: startDate, plannedEndDate: endDate } });
    const contract = await prisma.rentalContract.create({ data: { contractCode: `${marker}-C01`, reservationId: reservation.id, reservationUnitId: allocation.id, status: options.contractStatus ?? 'ACTIVE', startDate, endDate, activatedAt: options.contractStatus === 'READY_FOR_HANDOVER' ? null : new Date() } });
    const invoice = await prisma.invoice.create({ data: { invoiceCode: `${marker}-I01`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1, rentalAmount: 1000000n, depositAmount: 500000n, totalAmount: 1500000n, balanceDue: 1500000n } });
    return { customer, reservation, source, destination, allocation, contract, invoice };
  }

  async function requested(fixture: Awaited<ReturnType<typeof activeRental>>) {
    return transfers.create({ rentalContractId: fixture.contract.id, reason: 'UNIT_ISSUE' }, `${prefix}-transfer-${fixture.contract.id}`, manager);
  }

  it('requires an ACTIVE rental', async () => {
    const fixture = await activeRental({ contractStatus: 'READY_FOR_HANDOVER' });
    await expect(requested(fixture)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a destination with another StorageType', async () => {
    const fixture = await activeRental({ destinationTypeId: otherStorageTypeId }); const transfer = await requested(fixture);
    await expect(transfers.approve(transfer.id, { toStorageUnitId: fixture.destination.id }, manager)).rejects.toThrow('cùng StorageType');
  });

  it('rejects a destination with a future confirmed allocation', async () => {
    const fixture = await activeRental(); const transfer = await requested(fixture);
    const blocker = await activeRental();
    await prisma.reservationUnit.create({ data: { reservationId: blocker.reservation.id, storageUnitId: fixture.destination.id, plannedStartDate: new Date('2027-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-02-01T00:00:00.000Z') } });
    await expect(transfers.approve(transfer.id, { toStorageUnitId: fixture.destination.id }, manager)).rejects.toThrow('trùng khoảng thuê');
  });

  it('atomically moves OCCUPIED to AVAILABLE destination while preserving financial history', async () => {
    const fixture = await activeRental(); const beforeReservation = await prisma.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } }); const beforeInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: fixture.invoice.id } });
    const transfer = await requested(fixture); await transfers.approve(transfer.id, { toStorageUnitId: fixture.destination.id }, manager); const completed = await transfers.complete(transfer.id, staff);
    const [source, destination, oldAllocation, contract, afterReservation, afterInvoice] = await Promise.all([
      prisma.storageUnit.findUniqueOrThrow({ where: { id: fixture.source.id } }), prisma.storageUnit.findUniqueOrThrow({ where: { id: fixture.destination.id } }), prisma.reservationUnit.findUniqueOrThrow({ where: { id: fixture.allocation.id } }), prisma.rentalContract.findUniqueOrThrow({ where: { id: fixture.contract.id } }), prisma.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } }), prisma.invoice.findUniqueOrThrow({ where: { id: fixture.invoice.id } }),
    ]);
    expect(completed.status).toBe('COMPLETED'); expect(source.status).toBe('MAINTENANCE'); expect(destination.status).toBe('OCCUPIED'); expect(oldAllocation.releasedAt).not.toBeNull(); expect(contract.reservationUnitId).not.toBe(fixture.allocation.id);
    expect(afterReservation.quoteSnapshot).toEqual(beforeReservation.quoteSnapshot); expect(afterReservation.startDate).toEqual(beforeReservation.startDate); expect(afterReservation.endDate).toEqual(beforeReservation.endDate); expect(afterInvoice).toMatchObject({ rentalAmount: beforeInvoice.rentalAmount, depositAmount: beforeInvoice.depositAmount, totalAmount: beforeInvoice.totalAmount, status: beforeInvoice.status });
  });

  it('creates STAFF through Admin service and never returns passwordHash', async () => {
    const repository = new MemoryUserRepository(); const auth = new AuthService(repository);
    const user = await auth.createInternalUser({ fullName: 'Demo Staff', email: 'internal@example.test', phone: '0900000011', password: 'strong-password', role: 'STAFF' });
    expect(user).toMatchObject({ role: 'STAFF', email: 'internal@example.test' }); expect(user).not.toHaveProperty('passwordHash');
  });

  it('marks Admin controller as ADMIN-only', () => {
    expect(Reflect.getMetadata('allowedRoles', AdminUsersController)).toEqual(['ADMIN']);
  });

  it('prevents a disabled user from authenticating', async () => {
    const repository = new MemoryUserRepository(); const auth = new AuthService(repository);
    const created = await auth.createInternalUser({ fullName: 'Demo Staff', email: 'disabled@example.test', phone: '0900000012', password: 'strong-password', role: 'STAFF' });
    await repository.updateStatus(created.id, 'DISABLED');
    await expect(auth.login({ email: 'disabled@example.test', password: 'strong-password' })).rejects.toThrow('vô hiệu hóa');
  });

  it('returns numeric dashboard counts', async () => {
    const summary = await managerService.dashboardSummary();
    expect(Object.values(summary)).toHaveLength(10); expect(Object.values(summary).every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
  });
});
