import 'dotenv/config';
import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CustomerAppointmentsController } from './customer-appointments.controller.js';
import { ManagerAppointmentsController } from './manager-appointments.controller.js';
import { StaffAppointmentsController } from './staff-appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `appointment-facility-${runId}`;
const storageTypeId = `appointment-product-${runId}`;
const customerId = `appointment-customer-${runId}`;
const otherCustomerId = `appointment-other-${runId}`;
const managerId = `appointment-manager-${runId}`;
const staffId = `appointment-staff-${runId}`;
const adminId = `appointment-admin-${runId}`;
const unitCodes = [1, 2, 3].map((index) => `APPT-${runId}-${index}`);
const dayAfter = (days: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const appointmentAt = (days = 6) => `${dayAfter(days)}T09:30:00+07:00`;

describe('Appointment and Staff Handover V1', () => {
  let prisma: PrismaService;
  let service: AppointmentsService;
  const user = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });
  const customer = user(customerId, 'CUSTOMER');
  const manager = user(managerId, 'MANAGER');
  const staff = user(staffId, 'STAFF');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AppointmentsService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `APPT-${runId}`, name: 'Appointment test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `AP-${runId}`, name: 'Appointment product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
      widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
      image: 'https://example.test/appointment.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'A', row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Appointment Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Appointment Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Appointment Staff', role: 'STAFF', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Appointment Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.handoverAppointment.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
    await prisma.handoverAppointment.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, managerId, staffId, adminId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  async function reservation(options: { quantity?: number; customerId?: string; invoiceStatus?: 'OPEN' | 'PARTIALLY_PAID' | 'PAID'; contractStatus?: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' } = {}) {
    const quantity = options.quantity ?? 1;
    const reference = `WDP-2026-${randomUUID().slice(0, 8).toUpperCase()}`;
    const snapshot = { currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 6, quantity, monthlyUnitPrice: 1500000, rentalAmount: 9000000 * quantity, depositAmount: 1500000 * quantity };
    const created = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: options.customerId ?? customerId, facilityId, storageTypeId, quantity,
      startDate: new Date(`${dayAfter(5)}T00:00:00.000Z`), endDate: new Date(`${dayAfter(185)}T00:00:00.000Z`),
      periodMode: 'DURATION', durationMonths: 6, availabilitySnapshot: {}, quoteSnapshot: snapshot as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `appointment-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: created.id, storageUnitId: unit.id, plannedStartDate: created.startDate, plannedEndDate: created.endDate } });
      await prisma.rentalContract.create({ data: {
        contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: created.id, reservationUnitId: allocation.id,
        status: options.contractStatus ?? 'READY_FOR_HANDOVER', startDate: created.startDate, endDate: created.endDate,
      } });
    }
    const invoiceStatus = options.invoiceStatus ?? 'PAID';
    await prisma.invoice.create({ data: {
      invoiceCode: `${reference}-I01`, reservationId: created.id, type: 'INITIAL', status: invoiceStatus,
      rentalAmount: 1500000n * BigInt(quantity), depositAmount: 1500000n * BigInt(quantity), totalAmount: 3000000n * BigInt(quantity),
      amountPaid: invoiceStatus === 'PAID' ? 3000000n * BigInt(quantity) : invoiceStatus === 'PARTIALLY_PAID' ? 1000000n : 0n,
      balanceDue: invoiceStatus === 'PAID' ? 0n : invoiceStatus === 'PARTIALLY_PAID' ? 3000000n * BigInt(quantity) - 1000000n : 3000000n * BigInt(quantity),
      paidAt: invoiceStatus === 'PAID' ? new Date() : null,
    } });
    return { created, snapshot };
  }

  async function requestAppointment(reservationId: string, key = `appointment-key-${randomUUID()}`) {
    return service.createCustomerAppointment(customer, { reservationId, scheduledAt: appointmentAt(), note: 'Morning preferred' }, key);
  }

  it('lets Customer request one idempotent appointment for their eligible Reservation without changing units or contracts', async () => {
    const { created } = await reservation({ quantity: 2 });
    const key = `create-${runId}-eligible`;
    const first = await requestAppointment(created.id, key);
    const retry = await requestAppointment(created.id, key);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'REQUESTED', reservation: { reference: created.reservationCode, contractCount: 2 } });
    expect(await prisma.handoverAppointment.count({ where: { reservationId: created.id } })).toBe(1);
    expect(await prisma.rentalContract.count({ where: { reservationId: created.id, status: 'READY_FOR_HANDOVER' } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: created.id } }, status: 'AVAILABLE' } })).toBe(2);
    await expect(requestAppointment(created.id, `create-${runId}-second`)).rejects.toBeInstanceOf(ConflictException);
  });

  it('protects ownership and rejects unpaid or partially paid reservations', async () => {
    const other = await reservation({ customerId: otherCustomerId });
    await expect(requestAppointment(other.created.id)).rejects.toBeInstanceOf(NotFoundException);
    const open = await reservation({ invoiceStatus: 'OPEN', contractStatus: 'PENDING_PAYMENT' });
    await expect(requestAppointment(open.created.id)).rejects.toBeInstanceOf(ConflictException);
    const partial = await reservation({ invoiceStatus: 'PARTIALLY_PAID', contractStatus: 'PENDING_PAYMENT' });
    await expect(requestAppointment(partial.created.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects past appointments and appointments before Contract startDate', async () => {
    const { created } = await reservation();
    await expect(service.createCustomerAppointment(customer, { reservationId: created.id, scheduledAt: '2025-01-01T09:30:00+07:00' }, `past-${runId}`)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createCustomerAppointment(customer, { reservationId: created.id, scheduledAt: `${dayAfter(4)}T09:30:00+07:00` }, `early-${runId}`)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows Manager confirmation, records audit identity, and blocks Customer or Staff', async () => {
    const { created } = await reservation();
    const requested = await requestAppointment(created.id);
    await expect(service.confirmAppointment(requested.id, customer)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.confirmAppointment(requested.id, staff)).rejects.toBeInstanceOf(ForbiddenException);
    const confirmed = await service.confirmAppointment(requested.id, manager);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedBy).toMatchObject({ id: managerId, role: 'MANAGER' });
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it('rejects handover for REQUESTED appointment and blocks Customer actor', async () => {
    const { created } = await reservation();
    const requested = await requestAppointment(created.id);
    await expect(service.completeHandover(requested.id, {}, staff)).rejects.toBeInstanceOf(ConflictException);
    await service.confirmAppointment(requested.id, manager);
    await expect(service.completeHandover(requested.id, {}, customer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('atomically completes quantity two handover, activates contracts and occupies units without changing historical data', async () => {
    const { created, snapshot } = await reservation({ quantity: 2 });
    const requested = await requestAppointment(created.id);
    await service.confirmAppointment(requested.id, manager);
    const completed = await service.completeHandover(requested.id, { note: 'Units handed over successfully' }, staff);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
    expect(completed.completedBy).toMatchObject({ id: staffId, role: 'STAFF' });
    expect(completed.allocatedUnits).toHaveLength(2);
    expect(completed.allocatedUnits.every((unit) => unit.contractStatus === 'ACTIVE' && unit.activatedAt !== null && unit.unitStatus === 'OCCUPIED')).toBe(true);
    expect(await prisma.rentalContract.count({ where: { reservationId: created.id, status: 'ACTIVE', activatedAt: { not: null } } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: created.id } }, status: 'OCCUPIED' } })).toBe(2);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } })).quoteSnapshot).toEqual(snapshot);
    expect((await prisma.invoice.findFirstOrThrow({ where: { reservationId: created.id, type: 'INITIAL' } })).status).toBe('PAID');
    const recurring = await prisma.invoice.findMany({ where: { reservationId: created.id, type: 'RECURRING' }, orderBy: { billingCycle: 'asc' } });
    expect(recurring).toHaveLength(5);
    expect(recurring.map((invoice) => invoice.billingCycle)).toEqual([2, 3, 4, 5, 6]);
    expect(recurring.every((invoice) => invoice.rentalAmount === 3000000n && invoice.depositAmount === 0n && invoice.totalAmount === 3000000n)).toBe(true);
  });

  it('rolls back every transition when one unit is invalid', async () => {
    const { created } = await reservation({ quantity: 2 });
    const requested = await requestAppointment(created.id);
    await service.confirmAppointment(requested.id, manager);
    const allocation = await prisma.reservationUnit.findFirstOrThrow({ where: { reservationId: created.id } });
    await prisma.storageUnit.update({ where: { id: allocation.storageUnitId }, data: { status: 'MAINTENANCE' } });
    await expect(service.completeHandover(requested.id, {}, staff)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.rentalContract.count({ where: { reservationId: created.id, status: 'ACTIVE' } })).toBe(0);
    expect((await prisma.handoverAppointment.findUniqueOrThrow({ where: { id: requested.id } })).status).toBe('CONFIRMED');
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: created.id } }, status: 'OCCUPIED' } })).toBe(0);
  });

  it('rolls back when one contract is invalid', async () => {
    const { created } = await reservation({ quantity: 2 });
    const requested = await requestAppointment(created.id);
    await service.confirmAppointment(requested.id, manager);
    const contract = await prisma.rentalContract.findFirstOrThrow({ where: { reservationId: created.id } });
    await prisma.rentalContract.update({ where: { id: contract.id }, data: { status: 'PENDING_PAYMENT' } });
    await expect(service.completeHandover(requested.id, {}, staff)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.rentalContract.count({ where: { reservationId: created.id, status: 'ACTIVE' } })).toBe(0);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: created.id } }, status: 'OCCUPIED' } })).toBe(0);
  });

  it('makes completed handover retries idempotent and concurrent attempts safe', async () => {
    const { created } = await reservation();
    const requested = await requestAppointment(created.id);
    await service.confirmAppointment(requested.id, manager);
    const attempts = await Promise.allSettled([
      service.completeHandover(requested.id, { note: 'Done' }, staff),
      service.completeHandover(requested.id, { note: 'Done' }, user(adminId, 'ADMIN')),
    ]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const retry = await service.completeHandover(requested.id, { note: 'Ignored retry note' }, staff);
    expect(retry.status).toBe('COMPLETED');
    expect(await prisma.rentalContract.count({ where: { reservationId: created.id, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: created.id } }, status: 'OCCUPIED' } })).toBe(1);
    expect(await prisma.invoice.count({ where: { reservationId: created.id, type: 'RECURRING' } })).toBe(5);
  });

  it('keeps Customer reads private and exposes safe operational list/detail data', async () => {
    const { created } = await reservation();
    const requested = await requestAppointment(created.id);
    expect((await service.listCustomerAppointments(customerId, { page: 1, limit: 20 })).total).toBe(1);
    expect((await service.listCustomerAppointments(otherCustomerId, { page: 1, limit: 20 })).total).toBe(0);
    await expect(service.getCustomerAppointment(otherCustomerId, requested.id)).rejects.toBeInstanceOf(NotFoundException);
    const operational = await service.listOperationalAppointments({ page: 1, limit: 20, search: 'Appointment Customer', status: 'REQUESTED', date: dayAfter(6) });
    expect(operational.total).toBe(1);
    expect(JSON.stringify(operational.items[0])).not.toContain('secret-hash');
  });

  it('enforces unauthenticated, Customer, Manager and Staff controller access rules', async () => {
    const authGuard = new AuthGuard({ getUserByToken: async () => { throw new Error('not called'); } } as never);
    const unauthenticated = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as unknown as ExecutionContext;
    await expect(authGuard.canActivate(unauthenticated)).rejects.toBeInstanceOf(UnauthorizedException);

    const rolesGuard = new RolesGuard(new Reflector());
    const allowed: Array<[typeof CustomerAppointmentsController | typeof ManagerAppointmentsController | typeof StaffAppointmentsController, PublicUser['role'][]]> = [
      [CustomerAppointmentsController, ['CUSTOMER']],
      [ManagerAppointmentsController, ['MANAGER', 'ADMIN']],
      [StaffAppointmentsController, ['STAFF', 'MANAGER', 'ADMIN']],
    ];
    for (const [controller, roles] of allowed) {
      for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] as const) {
        const context = {
          getHandler: () => function appointmentOperation() {},
          getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        } as unknown as ExecutionContext;
        if (roles.includes(role)) expect(rolesGuard.canActivate(context)).toBe(true);
        else expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });
});
