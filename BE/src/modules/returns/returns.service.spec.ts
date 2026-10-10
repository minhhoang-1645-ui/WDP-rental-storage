import 'dotenv/config';
import { ConflictException, ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BookingService } from '../booking/booking.service.js';
import { ActiveRentalsService } from '../rentals-active/active-rentals.service.js';
import { CustomerReturnsController } from './customer-returns.controller.js';
import { ManagerReturnsController } from './manager-returns.controller.js';
import { ReturnsService } from './returns.service.js';
import { StaffReturnsController } from './staff-returns.controller.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `return-facility-${runId}`;
const storageTypeId = `return-product-${runId}`;
const customerId = `return-customer-${runId}`;
const otherCustomerId = `return-other-${runId}`;
const managerId = `return-manager-${runId}`;
const staffId = `return-staff-${runId}`;
const adminId = `return-admin-${runId}`;
const unitCodes = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `RETURN-${runId}-${index}`);
const day = (offset: number) => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
};
const dateText = (value: Date) => value.toISOString().slice(0, 10);

describe('Return and Inspection V1', () => {
  let prisma: PrismaService;
  let returns: ReturnsService;
  let rentals: ActiveRentalsService;
  let booking: BookingService;
  const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });
  const customer = actor(customerId, 'CUSTOMER');
  const staff = actor(staffId, 'STAFF');
  const manager = actor(managerId, 'MANAGER');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    returns = new ReturnsService(prisma);
    rentals = new ActiveRentalsService(prisma);
    booking = new BookingService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `RETURN-${runId}`, name: 'Return test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `RT-${runId}`, name: 'Return product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
      widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
      image: 'https://example.test/return.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'R', row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Return Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Return Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Return Staff', role: 'STAFF', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Return Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.depositSettlement.deleteMany({ where: { returnRequest: { reservation: { storageTypeId } } } });
    await prisma.maintenanceRequest.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.returnRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.depositSettlement.deleteMany({ where: { returnRequest: { reservation: { storageTypeId } } } });
    await prisma.maintenanceRequest.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.returnRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, managerId, staffId, adminId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  async function activeRental(options: { quantity?: number; customer?: string; end?: Date; inconsistent?: boolean } = {}) {
    const quantity = options.quantity ?? 1;
    const startDate = day(-40);
    const endDate = options.end ?? day(-1);
    const reference = `WDP-RETURN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const quote = { currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 1, quantity, monthlyUnitPrice: 1500000, rentalAmount: 1500000 * quantity, depositAmount: 1500000 * quantity };
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: options.customer ?? customerId, facilityId, storageTypeId, quantity, startDate, endDate,
      periodMode: 'DURATION', durationMonths: 1, availabilitySnapshot: {}, quoteSnapshot: quote as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: day(-45), idempotencyKey: `return-reservation-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId, status: 'AVAILABLE' }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: startDate, plannedEndDate: endDate } });
      await prisma.rentalContract.create({ data: {
        contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: reservation.id, reservationUnitId: allocation.id,
        status: 'ACTIVE', startDate, endDate: options.inconsistent && index === quantity - 1 ? day(1) : endDate, activatedAt: day(-40),
      } });
      await prisma.storageUnit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
    }
    await prisma.invoice.create({ data: {
      invoiceCode: `${reference}-I01`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1, billingPeriodStart: startDate, billingPeriodEnd: endDate,
      dueAt: startDate, status: 'PAID', rentalAmount: 1500000n * BigInt(quantity), depositAmount: 1500000n * BigInt(quantity),
      totalAmount: 3000000n * BigInt(quantity), amountPaid: 3000000n * BigInt(quantity), balanceDue: 0n, paidAt: day(-40),
    } });
    return { reservation, units, quote };
  }

  const requestReturn = (reservationId: string, key = `return-key-${randomUUID()}`) =>
    returns.createCustomerReturn(customer, { reservationId, note: 'Ready to inspect' }, key);

  async function passAll(returnId: string) {
    await returns.startInspection(returnId, staff);
    const detail = await returns.getStaffReturn(returnId);
    for (const inspection of detail.inspections) await returns.updateInspection(returnId, inspection.id, { result: 'PASS', conditionNote: 'Good condition' }, staff);
    return returns.getStaffReturn(returnId);
  }

  it('creates one idempotent reservation-level return with one PENDING inspection per contract and no physical mutation', async () => {
    const { reservation, quote } = await activeRental({ quantity: 2 });
    const key = `return-idempotent-${runId}`;
    const first = await requestReturn(reservation.id, key);
    const retry = await requestReturn(reservation.id, key);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'REQUESTED', inspectionSummary: { total: 2, pending: 2, passed: 0, issues: 0 } });
    expect(await prisma.returnRequest.count({ where: { reservationId: reservation.id } })).toBe(1);
    expect(await prisma.returnInspection.count({ where: { returnRequestId: first.id, result: 'PENDING' } })).toBe(2);
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'OCCUPIED' } })).toBe(2);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(quote);
    await expect(requestReturn(reservation.id)).rejects.toMatchObject({ response: { code: 'ACTIVE_RETURN_EXISTS' } });
  });

  it('enforces ownership, end-date boundary, consistent contracts and unresolved renewal rules', async () => {
    const foreign = await activeRental({ customer: otherCustomerId });
    await expect(requestReturn(foreign.reservation.id)).rejects.toBeInstanceOf(NotFoundException);
    const early = await activeRental({ end: day(2) });
    await expect(requestReturn(early.reservation.id)).rejects.toMatchObject({ response: { code: 'RETURN_BEFORE_END_DATE_NOT_SUPPORTED' } });
    const inconsistent = await activeRental({ quantity: 2, inconsistent: true });
    await expect(requestReturn(inconsistent.reservation.id)).rejects.toMatchObject({ response: { code: 'RETURN_END_DATE_MISMATCH' } });
    const renewal = await activeRental();
    await prisma.renewalRequest.create({ data: {
      renewalCode: `WDPR-${randomUUID().slice(0, 8)}`, reservationId: renewal.reservation.id, previousEndDate: renewal.reservation.endDate,
      requestedEndDate: day(30), termMonths: 1, paymentPlan: 'PAY_MONTHLY', quoteSnapshot: {}, requestedByUserId: customerId,
      activeKey: renewal.reservation.id, idempotencyKey: `return-renewal-${randomUUID()}`,
    } });
    await expect(requestReturn(renewal.reservation.id)).rejects.toMatchObject({ response: { code: 'UNRESOLVED_RENEWAL_EXISTS' } });
  });

  it('creates exactly one maintenance case per ISSUE_FOUND unit in a quantity-three return', async () => {
    const { reservation } = await activeRental({ quantity: 3 });
    const requested = await requestReturn(reservation.id);
    const started = await returns.startInspection(requested.id, staff);
    expect(started).toMatchObject({ status: 'INSPECTION_IN_PROGRESS', inspectionStartedBy: { id: staffId, role: 'STAFF' } });
    const issue = await returns.updateInspection(requested.id, started.inspections[0].id, { result: 'ISSUE_FOUND', issueType: 'CUSTOMER_DAMAGE', conditionNote: 'Door dented', issueNote: 'Manager review required' }, staff);
    expect(issue).toMatchObject({ status: 'ISSUE_FOUND', inspectionSummary: { issues: 1 } });
    expect(issue.inspections.find((inspection) => inspection.id === started.inspections[0].id)).toMatchObject({ result: 'ISSUE_FOUND', inspectedBy: { id: staffId } });
    const customerView = await returns.getCustomerReturn(customerId, requested.id);
    expect(JSON.stringify(customerView)).not.toContain('Manager review required');
    expect(JSON.stringify(customerView)).not.toContain('Door dented');
    expect(JSON.stringify(customerView)).not.toContain('Return Staff');
    await expect(returns.updateInspection(requested.id, started.inspections[0].id, { result: 'PASS' }, staff)).rejects.toBeInstanceOf(ConflictException);
    await returns.updateInspection(requested.id, started.inspections[1].id, { result: 'ISSUE_FOUND', issueType: 'CLEANING_REQUIRED', conditionNote: 'Cleaning required', issueNote: 'Deep cleaning required' }, staff);
    await returns.updateInspection(requested.id, started.inspections[2].id, { result: 'PASS', conditionNote: 'Good condition' }, staff);
    const finalized = await returns.finalize(requested.id, staff);
    expect(finalized).toMatchObject({ status: 'PENDING_SETTLEMENT', settlementStatus: 'PENDING_REVIEW', inspectionSummary: { issues: 2, passed: 1 } });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } })).toBe(3);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null } } })).toBe(3);
    expect(await prisma.storageUnit.count({ where: { id: started.inspections[0].unit.id, status: 'MAINTENANCE' } })).toBe(1);
    expect(await prisma.storageUnit.count({ where: { id: started.inspections[1].unit.id, status: 'MAINTENANCE' } })).toBe(1);
    expect(await prisma.storageUnit.count({ where: { id: started.inspections[2].unit.id, status: 'AVAILABLE' } })).toBe(1);
    expect(await prisma.maintenanceRequest.findUnique({ where: { returnInspectionId: started.inspections[0].id } })).toMatchObject({
      source: 'RETURN_INSPECTION', category: 'UNIT_DAMAGE', status: 'OPEN', storageUnitId: started.inspections[0].unit.id,
    });
    expect(await prisma.maintenanceRequest.findUnique({ where: { returnInspectionId: started.inspections[1].id } })).toMatchObject({ category: 'CLEANING', status: 'OPEN' });
    expect(await prisma.maintenanceRequest.count({ where: { storageUnitId: started.inspections[2].unit.id } })).toBe(0);
    expect(await prisma.maintenanceRequest.count({ where: { returnInspection: { returnRequestId: requested.id } } })).toBe(2);
    await returns.finalize(requested.id, manager);
    expect(await prisma.maintenanceRequest.count({ where: { returnInspection: { returnRequestId: requested.id } } })).toBe(2);
  }, 60000);

  it('rejects finalization while any inspection remains PENDING', async () => {
    const { reservation } = await activeRental({ quantity: 2 });
    const requested = await requestReturn(reservation.id);
    const started = await returns.startInspection(requested.id, staff);
    await returns.updateInspection(requested.id, started.inspections[0].id, { result: 'PASS' }, staff);
    await expect(returns.finalize(requested.id, staff)).rejects.toMatchObject({ response: { code: 'RETURN_INSPECTIONS_INCOMPLETE' } });
  });

  it('atomically finalizes quantity two, retains allocation history and removes the Active Rental read model', async () => {
    const { reservation, quote } = await activeRental({ quantity: 2 });
    const requested = await requestReturn(reservation.id);
    await passAll(requested.id);
    const completed = await returns.finalize(requested.id, staff);
    expect(completed).toMatchObject({ status: 'PENDING_SETTLEMENT', physicallyReturnedBy: { id: staffId, role: 'STAFF' }, settlementStatus: 'APPROVED', inspectionSummary: { passed: 2 } });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED', completedAt: { not: null } } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null }, actualVacatedAt: { not: null } } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'AVAILABLE' } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id } })).toBe(2);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(quote);
    expect(await prisma.depositSettlement.findUnique({ where: { returnRequestId: requested.id } })).toMatchObject({ status: 'APPROVED', depositAmount: 3000000n, totalApprovedCharges: 0n, deductionAmount: 0n, refundAmount: 3000000n, outstandingAmount: 0n });
    await expect(rentals.getCustomerRental(customerId, reservation.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back every transition when one physical unit is invalid', async () => {
    const { reservation } = await activeRental({ quantity: 2 });
    const requested = await requestReturn(reservation.id);
    const passed = await passAll(requested.id);
    await prisma.storageUnit.update({ where: { id: passed.inspections[0].unit.id }, data: { status: 'MAINTENANCE' } });
    await expect(returns.finalize(requested.id, staff)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: requested.id } })).status).toBe('INSPECTION_IN_PROGRESS');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } })).toBe(0);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null } } })).toBe(0);
  });

  it('makes finalize retry idempotent and concurrent attempts safe', async () => {
    const { reservation } = await activeRental();
    const requested = await requestReturn(reservation.id);
    await passAll(requested.id);
    const attempts = await Promise.allSettled([
      returns.finalize(requested.id, staff),
      returns.finalize(requested.id, actor(adminId, 'ADMIN')),
    ]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const retry = await returns.finalize(requested.id, manager);
    expect(retry.status).toBe('PENDING_SETTLEMENT');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null } } })).toBe(1);
    expect(await prisma.depositSettlement.count({ where: { returnRequestId: requested.id } })).toBe(1);
    expect(await prisma.maintenanceRequest.count({ where: { returnInspection: { returnRequestId: requested.id } } })).toBe(0);
  });

  it('keeps future confirmed allocation unchanged and availability-aware after the current return', async () => {
    const { reservation, units } = await activeRental();
    const futureStart = day(5);
    const futureEnd = day(35);
    const future = await prisma.reservation.create({ data: {
      reservationCode: `WDP-FUTURE-${randomUUID().slice(0, 8)}`, customerId: otherCustomerId, facilityId, storageTypeId, quantity: 1,
      startDate: futureStart, endDate: futureEnd, periodMode: 'DURATION', durationMonths: 1, availabilitySnapshot: {},
      quoteSnapshot: { paymentPlan: 'PAY_MONTHLY' } as Prisma.InputJsonValue, status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `return-future-${randomUUID()}`,
    } });
    const futureAllocation = await prisma.reservationUnit.create({ data: { reservationId: future.id, storageUnitId: units[0].id, plannedStartDate: futureStart, plannedEndDate: futureEnd } });
    const requested = await requestReturn(reservation.id);
    await passAll(requested.id);
    await returns.finalize(requested.id, staff);
    expect(await prisma.reservationUnit.findUniqueOrThrow({ where: { id: futureAllocation.id } })).toMatchObject({ releasedAt: null });
    await prisma.storageUnit.updateMany({ where: { storageTypeId, id: { not: units[0].id } }, data: { status: 'MAINTENANCE' } });
    const availability = await booking.checkAvailability({
      productId: storageTypeId, startDate: dateText(futureStart), periodMode: 'duration', durationMonths: 1, quantity: 1,
      adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY',
    });
    expect(availability).toMatchObject({ available: false, reasonCode: 'CONFLICT' });
  });

  it('preserves customer privacy and provides filtered Manager/Staff read models without password hashes', async () => {
    const { reservation } = await activeRental();
    const requested = await requestReturn(reservation.id);
    expect((await returns.listCustomerReturns(customerId, { page: 1, limit: 20 })).total).toBe(1);
    expect((await returns.listCustomerReturns(otherCustomerId, { page: 1, limit: 20 })).total).toBe(0);
    await expect(returns.getCustomerReturn(otherCustomerId, requested.id)).rejects.toBeInstanceOf(NotFoundException);
    const managerList = await returns.listManagerReturns({ page: 1, limit: 20, search: customerId, status: 'REQUESTED', date: dateText(new Date()) });
    const staffList = await returns.listStaffReturns({ page: 1, limit: 20, search: unitCodes[0] });
    expect(managerList.total).toBe(1);
    expect(staffList.total).toBe(1);
    expect(JSON.stringify(await returns.getManagerReturn(requested.id))).not.toContain('secret-hash');
    expect(JSON.stringify(await returns.getStaffReturn(requested.id))).not.toContain('billingSummary');
  });

  it('persists across service reinitialization and enforces endpoint role boundaries', async () => {
    const { reservation } = await activeRental();
    const requested = await requestReturn(reservation.id);
    const reinitialized = new ReturnsService(prisma);
    expect((await reinitialized.getCustomerReturn(customerId, requested.id)).returnCode).toBe(requested.returnCode);
    await expect(returns.startInspection(requested.id, customer)).rejects.toBeInstanceOf(ForbiddenException);

    const authGuard = new AuthGuard({ getUserByToken: async () => { throw new Error('not called'); } } as never);
    const unauthenticated = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as unknown as ExecutionContext;
    await expect(authGuard.canActivate(unauthenticated)).rejects.toBeInstanceOf(UnauthorizedException);
    const rolesGuard = new RolesGuard(new Reflector());
    const allowed: Array<[typeof CustomerReturnsController | typeof ManagerReturnsController | typeof StaffReturnsController, PublicUser['role'][]]> = [
      [CustomerReturnsController, ['CUSTOMER']],
      [ManagerReturnsController, ['MANAGER', 'ADMIN']],
      [StaffReturnsController, ['STAFF', 'MANAGER', 'ADMIN']],
    ];
    for (const [controller, roles] of allowed) {
      for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] as const) {
        const context = { getHandler: () => function returnOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) } as unknown as ExecutionContext;
        if (roles.includes(role)) expect(rolesGuard.canActivate(context)).toBe(true);
        else expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });
});
