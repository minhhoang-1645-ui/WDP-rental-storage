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
import { CustomerBillingController } from './customer-billing.controller.js';
import { ManagerBillingController } from './manager-billing.controller.js';
import { ReturnsService } from '../returns/returns.service.js';
import { RenewalsService } from '../renewals/renewals.service.js';
import { BookingService } from '../booking/booking.service.js';

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
    process.env.WDP_BANK_CODE = '970436';
    process.env.WDP_BANK_ACCOUNT_NUMBER = '0123456789';
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
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Billing Customer', role: 'STORAGE_CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'STORAGE_CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Billing Manager', role: 'FACILITY_MANAGER', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Billing Admin', role: 'SYSTEM_ADMINISTRATOR', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Billing Staff', role: 'FACILITY_STAFF', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.paymentSubmission.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 1500000 } });
  });

  afterAll(async () => {
    await prisma.paymentSubmission.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
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
      await prisma.rentalContract.create({ data: { contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: reservation.id, reservationUnitId: allocation.id, startDate: reservation.startDate, endDate: reservation.endDate, termsAcceptedAt: new Date(), termsAcceptedByUserId: customer } });
    }
    return reservation;
  }

  async function ensure(reservationId: string) {
    return prisma.$transaction((tx) => service.ensureInitialInvoice(tx, reservationId));
  }

  async function activate(reservationId: string) {
    await prisma.rentalContract.updateMany({ where: { reservationId }, data: { status: 'ACTIVE', activatedAt: new Date() } });
    await prisma.storageUnit.updateMany({ where: { reservationUnits: { some: { reservationId } } }, data: { status: 'OCCUPIED' } });
    return prisma.$transaction((tx) => service.ensureRecurringInvoices(tx, reservationId), { maxWait: 10000, timeout: 20000 });
  }

  it('creates one reservation-level INITIAL invoice for multiple contracts and is idempotent', async () => {
    const snapshot = quote({ quantity: 3, monthlyUnitPrice: 1000000, rentalAmount: 6000000, depositAmount: 3000000 });
    const reservation = await confirmedReservation(snapshot, 3);
    const first = await ensure(reservation.id);
    const second = await ensure(reservation.id);
    expect(second.id).toBe(first.id);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(1);
    expect(first).toMatchObject({ rentalAmount: 3000000n, depositAmount: 3000000n, totalAmount: 6000000n, balanceDue: 6000000n });
    const view = await service.getCustomerInvoice(customerId, first.id);
    expect(view.breakdown?.units.map(unit => [unit.unitCode, unit.rentalAmount, unit.depositAmount])).toEqual(unitCodes.map(code => [code, 1000000, 1000000]));
    expect((await service.getManagerInvoice(first.id, {id:managerId,role:'FACILITY_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''})).breakdown).toEqual(view.breakdown);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(snapshot);
  });

  it.each([1, 2])('creates one invoice from the real booking flow for %i physical units', async (quantity: any) => {
    const booking = new BookingService(prisma);
    const order = await booking.createReservation(actor(customerId, 'STORAGE_CUSTOMER'), {
      productId: storageTypeId, startDate: '2032-11-01', periodMode: 'duration', durationMonths: 3,
      quantity, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY',
    });
    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: order.id } });
    if (reservation.status === 'PENDING') await booking.updateManagerReservationStatus(order.id, { status: 'CONFIRMED' }, actor(managerId, 'FACILITY_MANAGER'));
    const invoices = await prisma.invoice.findMany({ where: { reservationId: reservation.id, type: 'INITIAL' } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(3000000n * BigInt(quantity));
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id } })).toBe(quantity);
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id } })).toBe(quantity);
    expect((await service.getCustomerInvoice(customerId, invoices[0].id)).breakdown?.units).toHaveLength(quantity);
  });

  it('keeps older invoices as totals and assigns the last dong deterministically for homogeneous units', async () => {
    const reservation = await confirmedReservation(quote({ quantity: 2, billingMode: 'DAILY', monthlyUnitPrice: 1000000, rentalAmount: 66667, depositAmount: 66667 }), 2);
    const invoice = await ensure(reservation.id);
    const detailed = await service.getCustomerInvoice(customerId, invoice.id);
    expect(detailed.breakdown?.units.map(unit => [unit.rentalAmount, unit.depositAmount])).toEqual([[33334, 33334], [33333, 33333]]);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pricingSnapshot: Prisma.DbNull } });
    const legacy = await service.getCustomerInvoice(customerId, invoice.id);
    expect(legacy).toMatchObject({ totalAmount: 133334, breakdown: null });
    expect((await ensure(reservation.id)).pricingSnapshot).toBeNull();
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

  it('bills a missing future cycle only for the contract covering the period, using its effective rate', async () => {
    const reservation = await confirmedReservation(quote({ quantity: 2, monthlyUnitPrice: 1500000, depositAmount: 3000000 }), 2);
    const initial = await ensure(reservation.id);
    await service.recordPayment(initial.id, { amount: 6000000, method: 'CASH' }, `completed-initial-${runId}`, actor(managerId, 'FACILITY_MANAGER'));
    const contracts = await prisma.rentalContract.findMany({ where: { reservationId: reservation.id }, orderBy: { contractCode: 'asc' } });
    const boundary = new Date('2026-12-01');
    await prisma.rentalContract.update({ where: { id: contracts[0].id }, data: { status: 'COMPLETED', endDate: boundary, completedAt: boundary } });
    await prisma.rentalContract.update({ where: { id: contracts[1].id }, data: { status: 'ACTIVE', rateEffectiveFrom: boundary, currentMonthlyRate: 2000000n } });

    const invoices = await prisma.$transaction(tx => service.ensureRecurringInvoices(tx, reservation.id));
    expect(invoices).toHaveLength(5);
    for (const invoice of invoices) {
      expect(invoice.totalAmount).toBe(2000000n);
      const view = await service.getCustomerInvoice(customerId, invoice.id);
      expect(view.breakdown?.units).toEqual([expect.objectContaining({ contractId: contracts[1].id, unitCode: unitCodes[1], rentalAmount: 2000000 })]);
    }
    const retry = await prisma.$transaction(tx => service.ensureRecurringInvoices(tx, reservation.id));
    expect(retry.map(it => it.id)).toEqual(invoices.map(it => it.id));
    expect(await prisma.invoice.findUnique({ where: { id: initial.id } })).toMatchObject({ status: 'PAID', totalAmount: 6000000n, pricingSnapshot: initial.pricingSnapshot });
    expect(await prisma.payment.count({ where: { invoiceId: initial.id } })).toBe(1);
  });

  it('rejects returning or renewing a contract before activation', async () => {
    const reservation = await confirmedReservation(quote({ quantity: 2 }), 2);
    const contract = await prisma.rentalContract.findFirstOrThrow({ where: { reservationId: reservation.id } });
    const invoices = await prisma.invoice.count({ where: { reservationId: reservation.id } });
    const input = { reservationId: reservation.id, rentalContractId: contract.id };
    await expect(new ReturnsService(prisma).createCustomerReturn(actor(customerId, 'STORAGE_CUSTOMER'), input, 'partial-return-test')).rejects.toThrow('hợp đồng đang sử dụng');
    await expect(new RenewalsService(prisma).createCustomerRenewal(customerId, { ...input, termMonths: 2, paymentPlan: 'PREPAID' }, 'partial-renewal-test')).rejects.toThrow('chưa đủ điều kiện gia hạn');
    expect(await prisma.returnRequest.count({ where: { reservationId: reservation.id } })).toBe(0);
    expect(await prisma.renewalRequest.count({ where: { reservationId: reservation.id } })).toBe(0);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(invoices);
  });

  it.each([
    ['PREPAID', quote({ paymentPlan: 'PREPAID' })],
    ['DAILY', quote({ billingMode: 'DAILY' })],
    ['one-month PAY_MONTHLY', quote({ termMonths: 1 })],
  ])('does not create recurring invoices for %s', async (_label: any, snapshot: any) => {
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
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const partial = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: `REC-PART-${runId}` }, `rec-part-${runId}`, manager);
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

    const managerView = await rentals.getManagerRental(reservation.id, {id:managerId,role:'FACILITY_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''});
    expect(managerView.invoices.find((invoice: { billingCycle: number }) => invoice.billingCycle === 2)?.isPastDue).toBe(true);
    await expect(rentals.getStaffRental(actor('unassigned-staff', 'FACILITY_STAFF'), reservation.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(JSON.stringify(managerView)).not.toContain('secret-hash');
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
      [CustomerActiveRentalsController, ['STORAGE_CUSTOMER']],
      [ManagerActiveRentalsController, ['FACILITY_MANAGER']],
      [StaffActiveRentalsController, ['FACILITY_STAFF']],
    ];
    for (const [controller, roles] of allowed) {
      for (const role of ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const) {
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
  ])('uses historical snapshot for %s', async (_label: any, snapshot: any, rental: any, deposit: any, total: any) => {
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
    const reservation = await confirmedReservation(quote({ quantity: 2, monthlyUnitPrice: 1500000, rentalAmount: 18000000, depositAmount: 3000000 }), 2);
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const partial = await service.recordPayment(invoice.id, { amount: 3000000, method: 'BANK_TRANSFER', reference: 'PART-1' }, `partial-${runId}`, manager);
    expect(partial.invoice).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: 3000000, balanceDue: 3000000 });
    expect(partial.contracts.every((contract: any) => contract.status === 'PENDING_PAYMENT')).toBe(true);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAt).toBeNull();

    const final = await service.recordPayment(invoice.id, { amount: 3000000, method: 'CASH' }, `final-${runId}`, manager);
    expect(final.invoice).toMatchObject({ status: 'PAID', amountPaid: 6000000, balanceDue: 0 });
    const replay = await service.recordPayment(invoice.id, { amount: 3000000, method: 'CASH' }, `final-${runId}`, manager);
    expect(replay.payment.id).toBe(final.payment.id);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(2);
    expect(final.contracts).toHaveLength(2);
    expect(final.contracts.every((contract: any) => contract.status === 'READY_FOR_HANDOVER')).toBe(true);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAt).not.toBeNull();
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(0);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'AVAILABLE' } })).toBe(2);
  });

  it('validates payment amount and prevents overpayment', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    await expect(service.recordPayment(invoice.id, { amount: 0, method: 'CASH' }, `zero-${runId}`, manager)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordPayment(invoice.id, { amount: 5800001, method: 'CASH' }, `over-${runId}`, manager)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });

  it('makes payment retries idempotent and audits the authenticated recorder', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const first = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager);
    const retry = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager);
    expect(retry.payment.id).toBe(first.payment.id);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    expect((await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } })).recordedByUserId).toBe(managerId);
    await expect(service.recordPayment(invoice.id, { amount: 2000000, method: 'BANK_TRANSFER', reference: 'IDEM' }, `idem-${runId}`, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks a duplicate reconciled bank transaction with a different Idempotency-Key', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const reference = `BANK-DUP-${runId}`;
    const first = await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference }, `bank-dup-first-${runId}`, manager);
    await expect(service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference }, `bank-dup-second-${runId}`, manager)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ amountPaid: 1000000n, balanceDue: 4800000n });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).toMatchObject({ bankTransactionReference: reference, bankDestinationKey: expect.any(String) });
  });

  it('serializes the same bank transaction across concurrent manual and submission verification paths', async () => {
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const manualReservation = await confirmedReservation(quote());
    const submissionReservation = await confirmedReservation(quote());
    const manualInvoice = await ensure(manualReservation.id);
    const submissionInvoice = await ensure(submissionReservation.id);
    const reference = `BANK-RACE-${runId}`;
    const submission = await service.createCustomerPaymentSubmission(customerId, submissionInvoice.id, { amount: 1000000, transferReference: 'STORAGE_CUSTOMER-CLAIM-ONLY' }, `bank-race-submission-${runId}`);
    const outcomes = await Promise.allSettled([
      service.recordPayment(manualInvoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference }, `bank-race-manual-${runId}`, manager),
      service.verifyPaymentSubmission(submission.id, { reference }, manager),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { bankTransactionReference: reference } })).toBe(1);
    const storedSubmission = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(['PENDING_VERIFICATION', 'VERIFIED']).toContain(storedSubmission.status);
  });

  it('blocks a bank reference shared between manual payment and verified submission in either order', async () => {
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const firstReservation = await confirmedReservation(quote());
    const firstInvoice = await ensure(firstReservation.id);
    const firstSubmission = await service.createCustomerPaymentSubmission(customerId, firstInvoice.id, { amount: 1000000, transferReference: 'STORAGE_CUSTOMER-CLAIM-A' }, `cross-first-submission-${runId}`);
    const firstReference = `BANK-CROSS-MANUAL-FIRST-${runId}`;
    await service.recordPayment(firstInvoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: firstReference }, `cross-first-manual-${runId}`, manager);
    await expect(service.verifyPaymentSubmission(firstSubmission.id, { reference: firstReference }, manager)).rejects.toBeInstanceOf(ConflictException);

    const secondReservation = await confirmedReservation(quote());
    const secondInvoice = await ensure(secondReservation.id);
    const secondReference = `BANK-CROSS-VERIFY-FIRST-${runId}`;
    const secondSubmission = await service.createCustomerPaymentSubmission(customerId, secondInvoice.id, { amount: 1000000, transferReference: 'STORAGE_CUSTOMER-CLAIM-B' }, `cross-second-submission-${runId}`);
    await service.verifyPaymentSubmission(secondSubmission.id, { reference: secondReference }, manager);
    await expect(service.recordPayment(secondInvoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: secondReference }, `cross-second-manual-${runId}`, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps partial bank payments and cash receipts valid with the authenticated recorder', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    await service.recordPayment(invoice.id, { amount: 1000000, method: 'BANK_TRANSFER', reference: `BANK-PARTIAL-${runId}` }, `bank-partial-${runId}`, manager);
    const cash = await service.recordPayment(invoice.id, { amount: 1000000, method: 'CASH' }, `cash-receipt-${runId}`, manager);
    expect(cash.payment).toMatchObject({ method: 'CASH', paymentCode: expect.any(String), reference: null, recordedBy: { id: managerId } });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: 2000000n, balanceDue: 3800000n });
  });

  it('creates an idempotent customer transfer notice without creating a Payment or changing the Invoice', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const payload = { amount: 3000000, method: 'BANK_TRANSFER', transferReference: 'CUST-TRANSFER-01', customerNote: 'Đã chuyển khoản.' };
    const first = await service.createCustomerPaymentSubmission(customerId, invoice.id, payload, `customer-submit-${runId}`);
    const retry = await service.createCustomerPaymentSubmission(customerId, invoice.id, payload, `customer-submit-${runId}`);
    expect(first).toMatchObject({ status: 'PENDING_VERIFICATION', amount: 3000000, method: 'BANK_TRANSFER', invoice: { status: 'OPEN', amountPaid: 0, balanceDue: 5800000 } });
    expect(retry.id).toBe(first.id);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'OPEN', amountPaid: 0n, balanceDue: 5800000n });
    await expect(service.createCustomerPaymentSubmission(otherCustomerId, invoice.id, payload, `other-submit-${runId}`)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createCustomerPaymentSubmission(customerId, invoice.id, { ...payload, amount: 5800001 }, `over-submit-${runId}`)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createCustomerPaymentSubmission(customerId, invoice.id, { ...payload, method: 'CASH' }, `cash-submit-${runId}`)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createCustomerPaymentSubmission(customerId, invoice.id, { ...payload, amount: 2000000 }, `customer-submit-${runId}`)).rejects.toBeInstanceOf(ConflictException);
  });

  it('verifies partial and final submissions through existing payment logic exactly once', async () => {
    const reservation = await confirmedReservation(quote({ quantity: 2, monthlyUnitPrice: 1450000, rentalAmount: 17400000, depositAmount: 2900000 }), 2);
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    const firstNotice = await service.createCustomerPaymentSubmission(customerId, invoice.id, { amount: 3000000 }, `partial-notice-${runId}`);
    const [verified, retry] = await Promise.all([
      service.verifyPaymentSubmission(firstNotice.id, { reference: 'BANK-TXN-PART-01', note: 'Đã đối chiếu.' }, manager),
      service.verifyPaymentSubmission(firstNotice.id, { reference: 'BANK-TXN-PART-01', note: 'Đã đối chiếu.' }, manager),
    ]);
    expect(verified).toMatchObject({ status: 'VERIFIED', verifiedPayment: { paymentCode: expect.any(String) }, invoice: { status: 'PARTIALLY_PAID', amountPaid: 3000000, balanceDue: 2800000 } });
    expect(retry.id).toBe(verified.id);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
    const finalNotice = await service.createCustomerPaymentSubmission(customerId, invoice.id, { amount: 2800000 }, `final-notice-${runId}`);
    const final = await service.verifyPaymentSubmission(finalNotice.id, { reference: 'BANK-TXN-FINAL-01' }, manager);
    expect(final).toMatchObject({ status: 'VERIFIED', invoice: { status: 'PAID', amountPaid: 5800000, balanceDue: 0 }, contracts: [{ status: 'READY_FOR_HANDOVER' }, { status: 'READY_FOR_HANDOVER' }] });
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(2);
  });

  it('rejects a notice without recording Payment or changing invoice finance and allows safe status retry', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const notice = await service.createCustomerPaymentSubmission(customerId, invoice.id, { amount: 1000000 }, `reject-notice-${runId}`);
    await expect(service.rejectPaymentSubmission(notice.id, { reason: 'Không tìm thấy giao dịch tương ứng.' }, actor(managerId, 'FACILITY_MANAGER'))).resolves.toMatchObject({ status: 'REJECTED', rejectionReason: 'Không tìm thấy giao dịch tương ứng.' });
    await expect(service.rejectPaymentSubmission(notice.id, { reason: 'Không tìm thấy giao dịch tương ứng.' }, actor(managerId, 'FACILITY_MANAGER'))).resolves.toMatchObject({ status: 'REJECTED' });
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'OPEN', amountPaid: 0n, balanceDue: 5800000n });
    await expect(service.verifyPaymentSubmission(notice.id, { reference: 'BANK-TXN' }, actor(managerId, 'FACILITY_MANAGER'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.rejectPaymentSubmission(notice.id, { reason: '' }, actor(managerId, 'FACILITY_MANAGER'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks payment notices on paid invoices and restricts verification to managers and admins', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const manager = actor(managerId, 'FACILITY_MANAGER');
    await service.recordPayment(invoice.id, { amount: 5800000, method: 'BANK_TRANSFER', reference: `PAID-BEFORE-NOTICE-${runId}` }, `paid-before-notice-${runId}`, manager);
    await expect(service.createCustomerPaymentSubmission(customerId, invoice.id, { amount: 1 }, `paid-notice-${runId}`)).rejects.toBeInstanceOf(ConflictException);
    const otherReservation = await confirmedReservation(quote(), 1);
    const otherInvoice = await ensure(otherReservation.id);
    const notice = await service.createCustomerPaymentSubmission(customerId, otherInvoice.id, { amount: 1 }, `role-notice-${runId}`);
    await expect(service.verifyPaymentSubmission(notice.id, { reference: 'BANK' }, actor(customerId, 'STORAGE_CUSTOMER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.verifyPaymentSubmission(notice.id, { reference: 'BANK' }, actor(staffId, 'FACILITY_STAFF'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts Customer and Manager payment-submission endpoints by controller role', () => {
    const guard = new RolesGuard(new Reflector());
    const controllers: Array<[typeof CustomerBillingController | typeof ManagerBillingController, PublicUser['role'][]]> = [
      [CustomerBillingController, ['STORAGE_CUSTOMER']],
      [ManagerBillingController, ['FACILITY_MANAGER']],
    ];
    for (const [controller, allowedRoles] of controllers) {
      for (const role of ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const) {
        const context = { getHandler: () => function paymentSubmissionOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) } as unknown as ExecutionContext;
        if (allowedRoles.includes(role)) expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });

  it('enforces payment mutation roles while allowing SYSTEM_ADMINISTRATOR', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    await expect(service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `customer-${runId}`, actor(customerId, 'STORAGE_CUSTOMER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `staff-${runId}`, actor(staffId, 'FACILITY_STAFF'))).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `admin-${runId}`, actor(adminId, 'SYSTEM_ADMINISTRATOR'))).payment.recordedBy.role).toBe('SYSTEM_ADMINISTRATOR');
  });

  it('keeps customer invoice and payment reads private and never exposes passwordHash', async () => {
    const reservation = await confirmedReservation(quote());
    const invoice = await ensure(reservation.id);
    const payment = await service.recordPayment(invoice.id, { amount: 1, method: 'CASH' }, `privacy-${runId}`, actor(managerId, 'FACILITY_MANAGER'));
    expect((await service.listCustomerInvoices(customerId, 1, 20)).total).toBe(1);
    expect((await service.listCustomerPayments(customerId, 1, 20)).total).toBe(1);
    await expect(service.getCustomerInvoice(otherCustomerId, invoice.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getCustomerPayment(otherCustomerId, payment.payment.id)).rejects.toBeInstanceOf(NotFoundException);
    const managerDetail = await service.getManagerInvoice(invoice.id, {id:managerId,role:'FACILITY_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''});
    expect(JSON.stringify(managerDetail)).not.toContain('secret-hash');
    expect((await service.listManagerInvoices({ page: 1, limit: 20, search: 'Billing Customer' }, {id:managerId,role:'FACILITY_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''})).total).toBe(1);
    expect((await service.listManagerPayments({ page: 1, limit: 20, method: 'CASH' }, {id:managerId,role:'FACILITY_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''})).total).toBe(1);
  });
});
