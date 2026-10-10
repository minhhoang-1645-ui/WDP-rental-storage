import 'dotenv/config';
import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BillingService } from '../billing/billing.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { ActiveRentalsService } from '../rentals-active/active-rentals.service.js';
import { ReturnsService } from '../returns/returns.service.js';
import { CustomerDepositSettlementsController } from './customer-deposit-settlements.controller.js';
import { DepositSettlementsService } from './deposit-settlements.service.js';
import { ManagerDepositSettlementsController } from './manager-deposit-settlements.controller.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `settlement-facility-${runId}`;
const storageTypeId = `settlement-product-${runId}`;
const customerId = `settlement-customer-${runId}`;
const otherCustomerId = `settlement-other-${runId}`;
const staffId = `settlement-staff-${runId}`;
const managerId = `settlement-manager-${runId}`;
const adminId = `settlement-admin-${runId}`;
const unitCodes = Array.from({ length: 8 }, (_, index) => `SETTLE-${runId}-${index + 1}`);
const day = (offset: number) => { const value = new Date(); value.setUTCHours(0, 0, 0, 0); value.setUTCDate(value.getUTCDate() + offset); return value; };

describe('Return Issue Resolution and Deposit Settlement V1', () => {
  let prisma: PrismaService;
  let returns: ReturnsService;
  let settlements: DepositSettlementsService;
  let billing: BillingService;
  let rentals: ActiveRentalsService;
  let maintenance: MaintenanceService;
  const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Settlement`, email: `${id}@example.test`, phone: '' });
  const customer = actor(customerId, 'CUSTOMER');
  const staff = actor(staffId, 'STAFF');
  const manager = actor(managerId, 'MANAGER');

  beforeAll(async () => {
    prisma = new PrismaService(); await prisma.$connect();
    returns = new ReturnsService(prisma); settlements = new DepositSettlementsService(prisma); billing = new BillingService(prisma); rentals = new ActiveRentalsService(prisma); maintenance = new MaintenanceService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `SETTLE-${runId}`, name: 'Settlement test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `DS-${runId}`, name: 'Settlement product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
      widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
      image: 'https://example.test/settlement.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'S', row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Settlement Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Settlement Staff', role: 'STAFF', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Settlement Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Settlement Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
    ] });
  });

  async function cleanup() {
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
  }

  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } }); await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, staffId, managerId, adminId] } } });
    await prisma.facility.delete({ where: { id: facilityId } }); await prisma.$disconnect();
  });

  async function activeRental(quantity = 1, deposit = 1500000, owner = customerId) {
    const reference = `WDP-SETTLE-${randomUUID().slice(0, 8).toUpperCase()}`; const startDate = day(-40); const endDate = day(-1);
    const quote = { currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 1, quantity, monthlyUnitPrice: 1500000, rentalAmount: 1500000 * quantity, depositAmount: deposit };
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: owner, facilityId, storageTypeId, quantity, startDate, endDate, periodMode: 'DURATION', durationMonths: 1,
      availabilitySnapshot: {}, quoteSnapshot: quote as Prisma.InputJsonValue, status: 'CONFIRMED', confirmedAt: day(-45), idempotencyKey: `settlement-reservation-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId, status: 'AVAILABLE' }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: startDate, plannedEndDate: endDate } });
      await prisma.rentalContract.create({ data: { contractCode: `${reference}-C${index + 1}`, reservationId: reservation.id, reservationUnitId: allocation.id, status: 'ACTIVE', startDate, endDate, activatedAt: startDate } });
      await prisma.storageUnit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
    }
    const initial = await prisma.invoice.create({ data: {
      invoiceCode: `${reference}-I01`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1, billingPeriodStart: startDate, billingPeriodEnd: endDate,
      dueAt: startDate, status: 'PAID', rentalAmount: 1500000n * BigInt(quantity), depositAmount: BigInt(deposit), chargeAmount: 0n,
      totalAmount: 1500000n * BigInt(quantity) + BigInt(deposit), amountPaid: 1500000n * BigInt(quantity) + BigInt(deposit), balanceDue: 0n, paidAt: startDate,
    } });
    const payment = await prisma.payment.create({ data: { paymentCode: `${reference}-I01-P01`, invoiceId: initial.id, amount: initial.totalAmount, method: 'BANK_TRANSFER', reference: 'HISTORICAL', recordedByUserId: managerId, idempotencyKey: `history-${randomUUID()}` } });
    return { reservation, units, quote, initial, payment };
  }

  async function physicalReturn(options: { quantity?: number; deposit?: number; issues?: Array<{ index: number; issueType?: string }> } = {}) {
    const rental = await activeRental(options.quantity ?? 1, options.deposit ?? 1500000);
    const request = await returns.createCustomerReturn(customer, { reservationId: rental.reservation.id, note: 'Ready' }, `return-${randomUUID()}`);
    const started = await returns.startInspection(request.id, staff);
    const issueMap = new Map((options.issues ?? []).map((issue) => [issue.index, issue.issueType ?? 'CUSTOMER_DAMAGE']));
    for (const [index, inspection] of started.inspections.entries()) {
      const issueType = issueMap.get(index);
      await returns.updateInspection(request.id, inspection.id, issueType
        ? { result: 'ISSUE_FOUND', issueType, conditionNote: `Issue ${index}`, issueNote: `Observed issue ${index}` }
        : { result: 'PASS', conditionNote: 'Normal condition' }, staff);
    }
    const finalized = await returns.finalize(request.id, staff);
    const settlement = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: request.id } });
    return { ...rental, request, started, finalized, settlement };
  }

  const review = (settlementId: string, inspectionId: string, issueType: string, amount: number, reason: string | undefined, key = `review-${randomUUID()}`) =>
    settlements.review(settlementId, { issues: [{ inspectionId, issueType, approvedChargeAmount: amount, ...(reason ? { reason } : {}) }], note: 'Manager review' }, key, manager);

  it('keeps financial history and quote snapshot immutable when maintenance completes independently', async () => {
    const result = await physicalReturn({ issues: [{ index: 0, issueType: 'CUSTOMER_DAMAGE' }] });
    const inspection = result.started.inspections[0];
    await review(result.settlement.id, inspection.id, 'CUSTOMER_DAMAGE', 800000, 'Approved repair charge');
    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { returnInspectionId: inspection.id } });
    const before = {
      settlement: await prisma.depositSettlement.findUniqueOrThrow({ where: { id: result.settlement.id } }),
      settlementIssue: await prisma.depositSettlementIssue.findUniqueOrThrow({ where: { returnInspectionId: inspection.id } }),
      invoice: await prisma.invoice.findUniqueOrThrow({ where: { id: result.initial.id } }),
      payment: await prisma.payment.findUniqueOrThrow({ where: { id: result.payment.id } }),
      quote: (await prisma.reservation.findUniqueOrThrow({ where: { id: result.reservation.id } })).quoteSnapshot,
    };
    await maintenance.assign(request.id, { staffUserId: staffId }, `maintenance-assign-${randomUUID()}`, manager);
    await maintenance.start(request.id, `maintenance-start-${randomUUID()}`, staff);
    await maintenance.completeWork(request.id, { workNote: 'Repaired and tested.' }, `maintenance-complete-${randomUUID()}`, staff);
    await maintenance.verify(request.id, { note: 'Operationally verified.' }, `maintenance-verify-${randomUUID()}`, manager);
    expect(await prisma.depositSettlement.findUniqueOrThrow({ where: { id: result.settlement.id } })).toEqual(before.settlement);
    expect(await prisma.depositSettlementIssue.findUniqueOrThrow({ where: { returnInspectionId: inspection.id } })).toEqual(before.settlementIssue);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: result.initial.id } })).toEqual(before.invoice);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: result.payment.id } })).toEqual(before.payment);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: result.reservation.id } })).quoteSnapshot).toEqual(before.quote);
  }, 60000);

  it('auto-approves all-PASS return, preserves history, makes units available, and completes only after idempotent refund', async () => {
    const result = await physicalReturn({ quantity: 2, deposit: 3000000 });
    expect(result.finalized).toMatchObject({ status: 'PENDING_SETTLEMENT', settlementStatus: 'APPROVED' });
    expect(result.settlement).toMatchObject({ status: 'APPROVED', depositAmount: 3000000n, totalApprovedCharges: 0n, deductionAmount: 0n, refundAmount: 3000000n, outstandingAmount: 0n });
    expect(await prisma.rentalContract.count({ where: { reservationId: result.reservation.id, status: 'COMPLETED' } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: result.reservation.id, releasedAt: { not: null }, actualVacatedAt: { not: null } } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { id: { in: result.units.map((unit) => unit.id) }, status: 'AVAILABLE' } })).toBe(2);
    await expect(rentals.getCustomerRental(customerId, result.reservation.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: result.reservation.id } })).quoteSnapshot).toEqual(result.quote);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: result.initial.id } })).toMatchObject({ totalAmount: result.initial.totalAmount, depositAmount: result.initial.depositAmount, status: 'PAID' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: result.payment.id } })).toMatchObject({ amount: result.payment.amount, reference: 'HISTORICAL' });

    const key = `refund-${runId}-pass`;
    const first = await settlements.refund(result.settlement.id, { method: 'BANK_TRANSFER', reference: 'REFUND-PASS', note: 'Refunded' }, key, manager);
    const retry = await settlements.refund(result.settlement.id, { method: 'BANK_TRANSFER', reference: 'REFUND-PASS', note: 'Refunded' }, key, manager);
    expect(retry.id).toBe(first.id); expect(retry.status).toBe('SETTLED');
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: result.request.id } })).status).toBe('COMPLETED');
  });

  it('physically finalizes mixed quantity return and lets Manager approve customer damage with partial refund', async () => {
    const result = await physicalReturn({ quantity: 3, deposit: 1500000, issues: [{ index: 1 }] });
    expect(result.finalized).toMatchObject({ status: 'PENDING_SETTLEMENT', settlementStatus: 'PENDING_REVIEW', inspectionSummary: { passed: 2, issues: 1 } });
    expect(await prisma.storageUnit.findUniqueOrThrow({ where: { id: result.units[0].id } })).toMatchObject({ status: 'AVAILABLE' });
    expect(await prisma.storageUnit.findUniqueOrThrow({ where: { id: result.units[1].id } })).toMatchObject({ status: 'MAINTENANCE' });
    expect(await prisma.storageUnit.findUniqueOrThrow({ where: { id: result.units[2].id } })).toMatchObject({ status: 'AVAILABLE' });
    const issue = result.started.inspections[1];
    const reviewed = await review(result.settlement.id, issue.id, 'CUSTOMER_DAMAGE', 900000, 'Approved repair quotation');
    expect(reviewed).toMatchObject({ status: 'APPROVED', totalApprovedCharges: 900000, deductionAmount: 900000, refundAmount: 600000, outstandingAmount: 0 });
    expect((await prisma.storageUnit.findUniqueOrThrow({ where: { id: result.units[1].id } })).status).toBe('MAINTENANCE');
  });

  it('enforces fair issue charge rules including zero-charge overrides, lost key, OTHER reason and negative rejection', async () => {
    const result = await physicalReturn({ issues: [{ index: 0 }] }); const inspectionId = result.started.inspections[0].id;
    await expect(review(result.settlement.id, inspectionId, 'NORMAL_WEAR', 1, 'Wear')).rejects.toBeInstanceOf(BadRequestException);
    await expect(review(result.settlement.id, inspectionId, 'FACILITY_FAULT', 100, 'Fault')).rejects.toBeInstanceOf(BadRequestException);
    await expect(review(result.settlement.id, inspectionId, 'LOST_KEY_OR_ACCESS_ITEM', 199999, 'Lost key')).rejects.toBeInstanceOf(BadRequestException);
    await expect(review(result.settlement.id, inspectionId, 'OTHER', 0, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(review(result.settlement.id, inspectionId, 'CUSTOMER_DAMAGE', -1, 'Invalid')).rejects.toBeInstanceOf(BadRequestException);
    const reviewed = await review(result.settlement.id, inspectionId, 'FACILITY_FAULT', 0, 'Facility hardware fault');
    expect(reviewed).toMatchObject({ status: 'APPROVED', totalApprovedCharges: 0, deductionAmount: 0, refundAmount: 1500000 });
  });

  it('rejects any Staff attempt to submit a financial decision in inspection payload', async () => {
    const rental = await activeRental(); const request = await returns.createCustomerReturn(customer, { reservationId: rental.reservation.id }, `return-${randomUUID()}`);
    const started = await returns.startInspection(request.id, staff);
    await expect(returns.updateInspection(request.id, started.inspections[0].id, { result: 'ISSUE_FOUND', issueType: 'CUSTOMER_DAMAGE', issueNote: 'Damage', approvedChargeAmount: 100000 }, staff)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies fixed 200000 lost-key charge and auto-settles when charge equals deposit', async () => {
    const result = await physicalReturn({ deposit: 200000, issues: [{ index: 0, issueType: 'LOST_KEY_OR_ACCESS_ITEM' }] });
    const reviewed = await review(result.settlement.id, result.started.inspections[0].id, 'LOST_KEY_OR_ACCESS_ITEM', 200000, 'Fixed WDP V1 lost-key charge');
    expect(reviewed).toMatchObject({ status: 'SETTLED', totalApprovedCharges: 200000, deductionAmount: 200000, refundAmount: 0, outstandingAmount: 0 });
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: result.request.id } })).status).toBe('COMPLETED');
  });

  it('creates exactly one traceable settlement Invoice when charges exceed deposit and reuses partial/full Payment flow', async () => {
    const result = await physicalReturn({ deposit: 500000, issues: [{ index: 0 }] }); const inspectionId = result.started.inspections[0].id;
    const key = `review-outstanding-${runId}`;
    const first = await review(result.settlement.id, inspectionId, 'CLEANING_REQUIRED', 900000, 'Professional cleaning quotation', key);
    const retry = await review(result.settlement.id, inspectionId, 'CLEANING_REQUIRED', 900000, 'Professional cleaning quotation', key);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'AWAITING_OUTSTANDING_PAYMENT', deductionAmount: 500000, refundAmount: 0, outstandingAmount: 400000 });
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { depositSettlementId: result.settlement.id } });
    expect(invoice).toMatchObject({ type: 'SETTLEMENT', rentalAmount: 0n, depositAmount: 0n, chargeAmount: 400000n, totalAmount: 400000n, balanceDue: 400000n });
    expect(await prisma.invoice.count({ where: { depositSettlementId: result.settlement.id } })).toBe(1);
    await billing.recordPayment(invoice.id, { amount: 100000, method: 'BANK_TRANSFER', reference: 'PARTIAL' }, `pay-partial-${runId}`, manager);
    expect((await prisma.depositSettlement.findUniqueOrThrow({ where: { id: result.settlement.id } })).status).toBe('AWAITING_OUTSTANDING_PAYMENT');
    await billing.recordPayment(invoice.id, { amount: 300000, method: 'BANK_TRANSFER', reference: 'FINAL' }, `pay-final-${runId}`, manager);
    expect((await prisma.depositSettlement.findUniqueOrThrow({ where: { id: result.settlement.id } })).status).toBe('SETTLED');
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: result.request.id } })).status).toBe('COMPLETED');
    expect((await prisma.storageUnit.findUniqueOrThrow({ where: { id: result.units[0].id } })).status).toBe('MAINTENANCE');
  });

  it('supports zero-deposit all-PASS auto-settlement without financial action', async () => {
    const result = await physicalReturn({ deposit: 0 });
    expect(result.finalized).toMatchObject({ status: 'COMPLETED', settlementStatus: 'SETTLED' });
    expect(result.settlement).toMatchObject({ status: 'SETTLED', depositAmount: 0n, refundAmount: 0n, outstandingAmount: 0n });
  });

  it('keeps Customer ownership/private fields and enforces Manager-only financial actions', async () => {
    const result = await physicalReturn({ issues: [{ index: 0 }] });
    expect((await settlements.listCustomer(customerId, 1, 20)).total).toBe(1);
    expect((await settlements.listCustomer(otherCustomerId, 1, 20)).total).toBe(0);
    await expect(settlements.getCustomer(otherCustomerId, result.settlement.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(settlements.review(result.settlement.id, {}, 'staff-review-key', staff)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(settlements.refund(result.settlement.id, {}, 'customer-refund-key', customer)).rejects.toBeInstanceOf(ForbiddenException);
    const managerView = await settlements.getManager(result.settlement.id);
    const customerView = await settlements.getCustomer(customerId, result.settlement.id);
    expect(JSON.stringify(managerView)).not.toContain('secret-hash');
    expect(JSON.stringify(customerView)).not.toContain('reviewNote');
    expect(JSON.stringify(customerView)).not.toContain('refundReference');
  });

  it('enforces controller roles for Customer and Manager settlement APIs', () => {
    const guard = new RolesGuard(new Reflector());
    const allowed: Array<[typeof CustomerDepositSettlementsController | typeof ManagerDepositSettlementsController, PublicUser['role'][]]> = [
      [CustomerDepositSettlementsController, ['CUSTOMER']], [ManagerDepositSettlementsController, ['MANAGER', 'ADMIN']],
    ];
    for (const [controller, roles] of allowed) for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] as const) {
      const context = { getHandler: () => function settlementOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) } as unknown as ExecutionContext;
      if (roles.includes(role)) expect(guard.canActivate(context)).toBe(true); else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });

  it('keeps physical finalization and settlement creation atomic when deposit history is inconsistent', async () => {
    const rental = await activeRental(2, 1500000); const request = await returns.createCustomerReturn(customer, { reservationId: rental.reservation.id }, `return-${randomUUID()}`);
    const started = await returns.startInspection(request.id, staff);
    for (const inspection of started.inspections) await returns.updateInspection(request.id, inspection.id, { result: 'PASS' }, staff);
    await prisma.invoice.update({ where: { id: rental.initial.id }, data: { depositAmount: 1400000n, totalAmount: rental.initial.totalAmount - 100000n } });
    await expect(returns.finalize(request.id, staff)).rejects.toMatchObject({ response: { code: 'DEPOSIT_HISTORY_MISMATCH' } });
    expect(await prisma.rentalContract.count({ where: { reservationId: rental.reservation.id, status: 'ACTIVE' } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: rental.reservation.id, releasedAt: null } })).toBe(2);
    expect(await prisma.depositSettlement.count({ where: { returnRequestId: request.id } })).toBe(0);
  });
});
