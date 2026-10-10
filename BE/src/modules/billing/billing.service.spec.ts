import 'dotenv/config';
import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ActiveRentalsService } from '../rentals-active/active-rentals.service.js';
import { CustomerActiveRentalsController } from '../rentals-active/customer-active-rentals.controller.js';
import { ManagerActiveRentalsController } from '../rentals-active/manager-active-rentals.controller.js';
import { StaffActiveRentalsController } from '../rentals-active/staff-active-rentals.controller.js';
import { BillingService } from './billing.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `billing-facility-${runId}`;
const storageTypeId = `billing-product-${runId}`;
const customerId = `billing-customer-${runId}`;
const otherCustomerId = `billing-other-${runId}`;
const managerId = `billing-manager-${runId}`;
const adminId = `billing-admin-${runId}`;
const staffId = `billing-staff-${runId}`;
const unitCodes = [1, 2, 3].map((index) => `BILL-${runId}-${index}`);

describe('Invoice and Payment V1', () => {
  let prisma: PrismaService;
  let service: BillingService;
  let rentals: ActiveRentalsService;
  const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BillingService(prisma);
    rentals = new ActiveRentalsService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `BILL-${runId}`, name: 'Billing test', address: 'Test only' } });
    await prisma.storageType.create({
      data: {
        id: storageTypeId, facilityId, code: `BP-${runId}`, name: 'Billing product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
        widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
        image: 'https://example.test/billing.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
      },
    });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Billing Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Billing Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Billing Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Billing Staff', role: 'STAFF', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 1500000 } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, managerId, adminId, staffId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  const quote = (overrides: Record<string, unknown> = {}) => ({
    currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', quantity: 1,
    termMonths: 6, monthlyUnitPrice: 2900000, rentalAmount: 17400000, depositAmount: 2900000, quotedTotalAmount: 20300000,
    ...overrides,
  });

  async function confirmedReservation(snapshot: Record<string, unknown>, quantity = Number(snapshot.quantity ?? 1), customer = customerId) {
    const reference = `WDP-2026-${randomUUID().slice(0, 8).toUpperCase()}`;
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: customer, facilityId, storageTypeId, quantity,
      startDate: new Date('2026-11-01T00:00:00.000Z'), endDate: new Date('2027-05-01T00:00:00.000Z'),
      periodMode: 'DURATION', durationMonths: 6, availabilitySnapshot: {}, quoteSnapshot: snapshot as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `billing-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: reservation.startDate, plannedEndDate: reservation.endDate } });
      await prisma.rentalContract.create({ data: { contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: reservation.id, reservationUnitId: allocation.id, startDate: reservation.startDate, endDate: reservation.endDate } });
    }
    return reservation;
  }

  async function ensure(reservationId: string) {
    return prisma.$transaction((tx) => service.ensureInitialInvoice(tx, reservationId));
  }

  async function activate(reservationId: string) {
    await prisma.rentalContract.updateMany({ where: { reservationId }, data: { status: 'ACTIVE', activatedAt: new Date() } });
    await prisma.storageUnit.updateMany({ where: { reservationUnits: { some: { reservationId } } }, data: { status: 'OCCUPIED' } });
    return prisma.$transaction((tx) => service.ensureRecurringInvoices(tx, reservationId));
  }

  it('creates one reservation-level INITIAL invoice for multiple contracts and is idempotent', async () => {
    const snapshot = quote({ quantity: 3, monthlyUnitPrice: 1000000, rentalAmount: 6000000, depositAmount: 3000000 });
    const reservation = await confirmedReservation(snapshot, 3);
    const first = await ensure(reservation.id);
    const second = await ensure(reservation.id);
    expect(second.id).toBe(first.id);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(1);
    expect(first).toMatchObject({ rentalAmount: 3000000n, depositAmount: 3000000n, totalAmount: 6000000n, balanceDue: 6000000n });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(snapshot);
  });

  it('creates cycles 2-6 once for a six-month PAY_MONTHLY rental and protects historical quantity pricing', async () => {
    const snapshot = quote({ quantity: 3, monthlyUnitPrice: 1500000, rentalAmount: 27000000, depositAmount: 4500000 });
    const reservation = await confirmedReservation(snapshot, 3);
    await ensure(reservation.id);
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 9999999 } });

    const first = await activate(reservation.id);
    const retry = await prisma.$transaction((tx) => service.ensureRecurringInvoices(tx, reservation.id));
    expect(first).toHaveLength(5);
    expect(retry).toHaveLength(5);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id, type: 'RECURRING' } })).toBe(5);
    expect(first.map((invoice) => invoice.billingCycle)).toEqual([2, 3, 4, 5, 6]);
    expect(first.every((invoice) => invoice.rentalAmount === 4500000n && invoice.depositAmount === 0n && invoice.totalAmount === 4500000n)).toBe(true);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id, billingCycle: { gt: 6 } } })).toBe(0);
  });

  it.each([
    ['PREPAID', quote({ paymentPlan: 'PREPAID' })],
    ['DAILY', quote({ billingMode: 'DAILY' })],
    ['one-month PAY_MONTHLY', quote({ termMonths: 1 })],
  ])('does not create recurring invoices for %s', async (_label, snapshot) => {
    const reservation = await confirmedReservation(snapshot);
    expect(await activate(reservation.id)).toHaveLength(0);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id, type: 'RECURRING' } })).toBe(0);
  });

  it('derives every month-end boundary from the original date without drift and sets dueAt to period start', async () => {
    const reservation = await confirmedReservation(quote());
    const startDate = new Date('2027-01-31T00:00:00.000Z');
    const endDate = new Date('2027-07-31T00:00:00.000Z');
    await prisma.reservation.update({ where: { id: reservation.id }, data: { startDate, endDate } });
    await prisma.reservationUnit.updateMany({ where: { reservationId: reservation.id }, data: { plannedStartDate: startDate, plannedEndDate: endDate } });
    await prisma.rentalContract.updateMany({ where: { reservationId: reservation.id }, data: { startDate, endDate } });

    const recurring = await activate(reservation.id);
    expect(recurring.map((invoice) => [invoice.billingPeriodStart?.toISOString().slice(0, 10), invoice.billingPeriodEnd?.toISOString().slice(0, 10), invoice.dueAt?.toISOString().slice(0, 10)])).toEqual([
      ['2027-02-28', '2027-03-31', '2027-02-28'],
      ['2027-03-31', '2027-04-30', '2027-03-31'],
      ['2027-04-30', '2027-05-31', '2027-04-30'],
      ['2027-05-31', '2027-06-30', '2027-05-31'],
      ['2027-06-30', '2027-07-31', '2027-06-30'],
    ]);
  });

  it('supports early partial and full recurring payment while keeping contracts ACTIVE and units OCCUPIED', async () => {
    const reservation = await confirmedReservation(quote());
    const [invoice] = await activate(reservation.id);
    const manager = actor(managerId, 'MANAGER');
    const partial = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER' }, `rec-part-${runId}`, manager);
    expect(partial.invoice).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: 1000000, balanceDue: 1900000 });
    const full = await service.recordPayment(invoice.id, { amount: 1900000, method: 'CASH' }, `rec-full-${runId}`, manager);
    expect(full.invoice).toMatchObject({ status: 'PAID', balanceDue: 0 });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'OCCUPIED' } })).toBe(1);
  });

  it('exposes past-due as read-only and groups active contracts by Reservation with role-safe views', async () => {
    const snapshot = quote({ quantity: 2, monthlyUnitPrice: 1450000 });
    const reservation = await confirmedReservation(snapshot, 2);
    const recurring = await activate(reservation.id);
    await prisma.invoice.update({ where: { id: recurring[0].id }, data: { dueAt: new Date('2025-01-01T00:00:00.000Z') } });

    const customerList = await rentals.listCustomerRentals(customerId, { page: 1, limit: 20 });
    expect(customerList.total).toBe(1);
    expect(customerList.items[0]).toMatchObject({ reservationId: reservation.id, contractCount: 2, unitCount: 2, paymentPlan: 'PAY_MONTHLY' });
    expect((await rentals.listCustomerRentals(otherCustomerId, { page: 1, limit: 20 })).total).toBe(0);
    await expect(rentals.getCustomerRental(otherCustomerId, reservation.id)).rejects.toBeInstanceOf(NotFoundException);

    const managerView = await rentals.getManagerRental(reservation.id);
    expect(managerView.invoices.find((invoice: { billingCycle: number }) => invoice.billingCycle === 2)?.isPastDue).toBe(true);
    const staffView = await rentals.getStaffRental(reservation.id);
    expect(staffView).toMatchObject({ reservationId: reservation.id, contractCount: 2, billingReadiness: { hasUnpaidInvoices: true } });
    expect(staffView).not.toHaveProperty('paymentPlan');
    expect(staffView).not.toHaveProperty('historicalPricing');
    expect(staffView).not.toHaveProperty('invoices');
    expect(JSON.stringify({ managerView, staffView })).not.toContain('secret-hash');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'OCCUPIED' } })).toBe(2);
  });

  it('keeps recurring backfill idempotent and enforces Active Rental controller roles', async () => {
    const reservation = await confirmedReservation(quote());
    await prisma.rentalContract.updateMany({ where: { reservationId: reservation.id }, data: { status: 'ACTIVE', activatedAt: new Date() } });
    await prisma.storageUnit.updateMany({ where: { reservationUnits: { some: { reservationId: reservation.id } } }, data: { status: 'OCCUPIED' } });
    const first = await service.backfillRecurringInvoices();
    const second = await service.backfillRecurringInvoices();
    expect(first.skipped).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id, type: 'RECURRING' } })).toBe(5);

    const guard = new RolesGuard(new Reflector());
    const allowed: Array<[typeof CustomerActiveRentalsController | typeof ManagerActiveRentalsController | typeof StaffActiveRentalsController, PublicUser['role'][]]> = [
      [CustomerActiveRentalsController, ['CUSTOMER']],
      [ManagerActiveRentalsController, ['MANAGER', 'ADMIN']],
      [StaffActiveRentalsController, ['STAFF', 'MANAGER', 'ADMIN']],
    ];
    for (const [controller, roles] of allowed) {
      for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] as const) {
        const context = { getHandler: () => function activeRentalOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) } as unknown as ExecutionContext;
        if (roles.includes(role)) expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });

  it.each([
    ['daily Small', quote({ billingMode: 'DAILY', paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 1500000, rentalAmount: 350000, depositAmount: 350000 }), 350000n, 350000n, 700000n],
    ['daily Locker deposit zero', quote({ billingMode: 'DAILY', paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 750000, rentalAmount: 175000, depositAmount: 0 }), 175000n, 0n, 175000n],
    ['monthly PREPAID historical discount', quote({ paymentPlan: 'PREPAID', monthlyUnitPrice: 1500000, rentalAmount: 8100000, depositAmount: 1500000 }), 8100000n, 1500000n, 9600000n],
    ['monthly PAY_MONTHLY first month only', quote(), 2900000n, 2900000n, 5800000n],
  ])('uses historical snapshot for %s', async (_label, snapshot, rental, deposit, total) => {
    const reservation = await confirmedReservation(snapshot);
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 9999999 } });
    const invoice = await ensure(reservation.id);
    expect(invoice).toMatchObject({ rentalAmount: rental, depositAmount: deposit, totalAmount: total });
    expect(invoice.rentalAmount).not.toBe(BigInt(Number(snapshot.rentalAmount)) * 2n);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(snapshot);
  });

  it('does not invoice PENDING or REJECTED reservations and rejects malformed historical pricing', async () => {
    const pending = await confirmedReservation(quote());
    await prisma.reservation.update({ where: { id: pending.id }, data: { status: 'PENDING' } });
    await expect(ensure(pending.id)).rejects.toBeInstanceOf(ConflictException);
    const rejected = await confirmedReservation(quote());
    await prisma.reservation.update({ where: { id: rejected.id }, data: { status: 'REJECTED' } });
    await expect(ensure(rejected.id)).rejects.toBeInstanceOf(ConflictException);
    const malformed = await confirmedReservation({ currency: 'VND' });
    await expect(ensure(malformed.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.invoice.count({ where: { reservation: { storageTypeId } } })).toBe(0);
  });

  it('supports partial then final payment and transitions all contracts only to READY_FOR_HANDOVER', async () => {
    const reservation = await confirmedReservation(quote({ quantity: 2, monthlyUnitPrice: 1450000, rentalAmount: 17400000, depositAmount: 2900000 }), 2);
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'MANAGER');
    const partial = await service.recordPayment(invoice.id, { amount: 3000000, method: 'BANK_TRANSFER', reference: 'PART-1' }, `partial-${runId}`, manager);
    expect(partial.invoice).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: 3000000, balanceDue: 2800000 });
    expect(partial.contracts.every((contract) => contract.status === 'PENDING_PAYMENT')).toBe(true);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAt).toBeNull();

    const final = await service.recordPayment(invoice.id, { amount: 2800000, method: 'CASH' }, `final-${runId}`, manager);
    expect(final.invoice).toMatchObject({ status: 'PAID', amountPaid: 5800000, balanceDue: 0 });
    expect(final.contracts).toHaveLength(2);
    expect(final.contracts.every((contract) => contract.status === 'READY_FOR_HANDOVER')).toBe(true);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAt).not.toBeNull();
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(0);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'AVAILABLE' } })).toBe(2);
  });

  it('validates payment amount and prevents overpayment', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'MANAGER');
    await expect(service.recordPayment(invoice.id, { amount: 0, method: 'CASH' }, `zero-${runId}`, manager)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordPayment(invoice.id, { amount: 5800001, method: 'CASH' }, `over-${runId}`, manager)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });

  it('makes payment retries idempotent and audits the authenticated recorder', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'MANAGER');
    const first = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager);
    const retry = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager);
    expect(retry.payment.id).toBe(first.payment.id);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    expect((await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } })).recordedByUserId).toBe(managerId);
    await expect(service.recordPayment(invoice.id, { amount: 2000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces payment mutation roles while allowing ADMIN', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    await expect(service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `customer-${runId}`, actor(customerId, 'CUSTOMER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `staff-${runId}`, actor(staffId, 'STAFF'))).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `admin-${runId}`, actor(adminId, 'ADMIN'))).payment.recordedBy.role).toBe('ADMIN');
  });

  it('keeps customer invoice and payment reads private and never exposes passwordHash', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const payment = await service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `privacy-${runId}`, actor(managerId, 'MANAGER'));
    expect((await service.listCustomerInvoices(customerId, 1, 20)).total).toBe(1);
    expect((await service.listCustomerPayments(customerId, 1, 20)).total).toBe(1);
    await expect(service.getCustomerInvoice(otherCustomerId, invoice.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getCustomerPayment(otherCustomerId, payment.payment.id)).rejects.toBeInstanceOf(NotFoundException);
    const managerDetail = await service.getManagerInvoice(invoice.id);
    expect(JSON.stringify(managerDetail)).not.toContain('secret-hash');
    expect((await service.listManagerInvoices({ page: 1, limit: 20, search: 'Billing Customer' })).total).toBe(1);
    expect((await service.listManagerPayments({ page: 1, limit: 20, method: 'CASH' })).total).toBe(1);
  });
});
