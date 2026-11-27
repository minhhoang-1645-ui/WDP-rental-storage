import 'dotenv/config';
import { businessDate } from '../../business-date.js';
import { SupportService } from '../support/support.service.js';
import { EARLY_RETURN_SUBJECT } from './early-return-classification.js';
import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BookingService } from '../booking/booking.service.js';
import { BillingService } from '../billing/billing.service.js';
import { invoiceBreakdown, invoiceContractInclude, invoiceUnit } from '../billing/invoice-breakdown.js';
import { DepositSettlementsService } from '../deposit-settlements/deposit-settlements.service.js';
import { OverstayController } from '../manager/overstay.controller.js';
import { ActiveRentalsService } from '../rentals-active/active-rentals.service.js';
import { CustomerReturnsController } from './customer-returns.controller.js';
import { ManagerReturnsController } from './manager-returns.controller.js';
import { ReturnsService } from './returns.service.js';
import { StaffReturnsController } from './staff-returns.controller.js';
import { monthlyBoundary } from './return-period-closeout.js';
import { pricingPolicyDefaults } from '../policies/pricing-policy.js';
import { depositRefundDebtClause } from '../documents/document-policy.js';

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
  const value = new Date(businessDate() + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
};
const dateText = (value: Date) => value.toISOString().slice(0, 10);
describe.skipIf(process.env.NESTBOX_ISOLATED_TEST !== '1' || !/^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):55439\//.test(process.env.DATABASE_URL ?? ''))('Return and Inspection V1', () => {
  let prisma: PrismaService;
  let returns: ReturnsService;
  let support: SupportService;
  let rentals: ActiveRentalsService;
  let booking: BookingService;
  const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });
  const customer = actor(customerId, 'STORAGE_CUSTOMER');
  const staff = actor(staffId, 'FACILITY_STAFF');
  const manager = actor(managerId, 'FACILITY_MANAGER');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    returns = new ReturnsService(prisma);
    support = new SupportService(prisma);
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
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Return Customer', role: 'STORAGE_CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'STORAGE_CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Return Manager', role: 'FACILITY_MANAGER', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Return Staff', role: 'FACILITY_STAFF', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Return Admin', role: 'SYSTEM_ADMINISTRATOR', passwordHash: 'secret-hash' },
    ] });
  await prisma.facilityAccess.createMany({data:[managerId,staffId].map(userId=>({userId,facilityId,grantedById:adminId}))});
  await prisma.businessRule.create({ data: { id: randomUUID(), key: 'monthlyPriceRange:small', facilityId,
    version: 1, value: { min: 1000000, max: 2000000 }, effectiveFrom: day(-1), createdById: adminId } });
});

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { rentalContract: { reservation: { storageTypeId } } } });
    await prisma.storedItem.deleteMany({ where: { rentalContract: { reservation: { storageTypeId } } } });
    await prisma.transferRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.depositSettlement.deleteMany({ where: { returnRequest: { reservation: { storageTypeId } } } });
    await prisma.maintenanceRequest.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.returnRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.supportRequest.deleteMany({ where: { reservation: { storageTypeId } } });

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
    await prisma.supportRequest.deleteMany({ where: { reservation: { storageTypeId } } });

    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
await prisma.businessRule.deleteMany({where:{createdById:adminId}});
await prisma.facilityAccess.deleteMany({where:{facilityId}});
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
    const contracts = await prisma.rentalContract.findMany({ where: { reservationId: reservation.id }, include: invoiceContractInclude, orderBy: { contractCode: 'asc' } });
    const rentalAmount = 1500000n * BigInt(quantity);
    const depositAmount = 1500000n * BigInt(quantity);
    const lines = contracts.map((contract, index) => invoiceUnit(contract, 1500000n, 1500000n, quantity === 2 ? index === 0 ? 1250000n : 1750000n : 1500000n));
    const breakdown = invoiceBreakdown(startDate, endDate, lines, [], { rentalAmount, depositAmount, totalAmount: rentalAmount + depositAmount, serviceAmount: 0n });
    const initial = await prisma.invoice.create({ data: {
      invoiceCode: `${reference}-I01`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1, billingPeriodStart: startDate, billingPeriodEnd: endDate,
      dueAt: startDate, status: 'PAID', rentalAmount: 1500000n * BigInt(quantity), depositAmount: 1500000n * BigInt(quantity),
      totalAmount: 3000000n * BigInt(quantity), amountPaid: 3000000n * BigInt(quantity), balanceDue: 0n, paidAt: day(-40),
      pricingSnapshot: { ...quote, breakdown },
    } });
    return { reservation, units, quote, contracts, initial };
  }

  const requestReturn = async (reservationId: string, key = `return-key-${randomUUID()}`) => {
 const row=await returns.createCustomerReturn(customer,{reservationId,note:'Ready to inspect'},key);
 return returns.assign(row.id,{staffUserId:staff.id},manager);
};
  const requestContract = async (reservationId: string, rentalContractId: string, key = `return-key-${randomUUID()}`) => {
 const row=await returns.createCustomerReturn(customer,{reservationId,rentalContractId},key);
 const existing = await returns.getManagerReturn(row.id, manager);
 return returns.assign(row.id,{staffUserId:staff.id,expectedAssignedStaffUserId:existing.assignedStaff?.id ?? null},manager);
};

  async function historicalReturn(rental: Awaited<ReturnType<typeof activeRental>>) {
    const { reservation, contracts, initial } = rental;
    await prisma.invoice.update({ where: { id: initial.id }, data: { pricingSnapshot: Prisma.DbNull } });
    return prisma.returnRequest.create({ data: {
      reservationId: reservation.id, returnCode: `${reservation.reservationCode}-RT01`, activeKey: `RETURN:${reservation.id}`,
      idempotencyKey: `historical-return-${randomUUID()}`, requestedByUserId: customerId, assignedStaffUserId: staffId, note: 'Ready to inspect',
      inspections: { create: contracts.map(contract => ({ rentalContractId: contract.id, storageUnitId: contract.reservationUnit.storageUnit.id })) },
    } });
  }

  async function passAll(returnId: string) {
    await returns.startInspection(returnId, staff);
    const detail = await returns.getStaffReturn(returnId, staff);
    for (const inspection of detail.inspections) await returns.updateInspection(returnId, inspection.id, { result: 'PASS', conditionNote: 'Good condition' }, staff);
    return returns.getStaffReturn(returnId, staff);
  }

  it.each(['APPROVED', 'REJECTED'] as const)('keeps the early return %s decision with Manager and assigns eligible physical intake to the unit owner', async (decision: any) => {
    const { reservation } = await activeRental({ end: day(2) });
    const proposal = await support.createCustomer(customer, {
      reservationId: reservation.id, category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: 'Tôi muốn trả kho trước hạn.',
    }, `return-proposal-${randomUUID()}`);
    await expect(support.getStaff(proposal.id, staff)).rejects.toBeInstanceOf(NotFoundException);
    await expect(requestReturn(reservation.id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    const pending = (await returns.listEarlyReturnRequests(1, 20,manager)).items.find(item => item.id === proposal.id)!;
    expect(pending.decision).toBeNull();
    await expect(returns.decideEarlyReturn(proposal.id, {
      decision, note: 'Đã đối chiếu hợp đồng và tiền cọc.', financialReviewConfirmed: true,
      reviewedEndDate: pending.reservation.effectiveEndDate, reviewedPaidAmount: pending.financialSummary.paidAmount,
      reviewedOutstandingAmount: pending.financialSummary.outstandingAmount,
    }, manager)).resolves.toMatchObject({ decision });
    expect(await prisma.returnRequest.count({ where: { reservationId: reservation.id } })).toBe(0);
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(1);
    expect((await support.getCustomer(customer.id, proposal.id)).earlyReturnDecision).toBe(decision);
    if (decision === 'REJECTED') {
      await expect(requestReturn(reservation.id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
      return;
    }
    const physical = await requestReturn(reservation.id);
    await expect(returns.getStaffReturn(physical.id, staff)).resolves.toMatchObject({ status: 'REQUESTED', assignedStaff: { id: staff.id } });
    expect(await prisma.depositSettlement.count({ where: { returnRequestId: physical.id } })).toBe(0);
  });

  it('requires an explicit contract and supports simultaneous returns for distinct contracts with idempotent retries', async () => {
    const { reservation, quote, contracts: [a, b] } = await activeRental({ quantity: 2 });
    await expect(requestReturn(reservation.id)).rejects.toMatchObject({ status: 400 });
    const key = `return-idempotent-${runId}`;
    const [first, second] = await Promise.all([requestContract(reservation.id, a.id, key), requestContract(reservation.id, b.id)]);
    const retry = await requestContract(reservation.id, a.contractCode, key);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'REQUESTED', rentalContractId: a.id, inspectionSummary: { total: 1, pending: 1, passed: 0, issues: 0 } });
    expect(second).toMatchObject({ rentalContractId: b.id });
    expect(first.id).not.toBe(second.id);
    expect(await prisma.returnRequest.count({ where: { reservationId: reservation.id } })).toBe(2);
    expect(await prisma.returnInspection.count({ where: { returnRequestId: first.id, result: 'PENDING' } })).toBe(1);
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'OCCUPIED' } })).toBe(2);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(quote);
    await expect(requestContract(reservation.id, b.id, key)).rejects.toMatchObject({ status: 409 });
    await expect(requestContract(reservation.id, a.id)).rejects.toMatchObject({ response: { code: 'ACTIVE_RETURN_EXISTS' } });
  });

  it('enforces ownership, end-date boundary, consistent contracts and unresolved renewal rules', async () => {
    const foreign = await activeRental({ customer: otherCustomerId });
    await expect(requestReturn(foreign.reservation.id)).rejects.toBeInstanceOf(NotFoundException);
    const early = await activeRental({ end: day(2) });
    await expect(requestReturn(early.reservation.id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    const inconsistent = await activeRental({ quantity: 2, inconsistent: true });
    await expect(requestContract(inconsistent.reservation.id, inconsistent.contracts[1].id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    await expect(requestContract(inconsistent.reservation.id, inconsistent.contracts[0].id)).resolves.toMatchObject({ rentalContractId: inconsistent.contracts[0].id });
    await expect(requestContract(inconsistent.reservation.id, foreign.contracts[0].id)).rejects.toBeInstanceOf(NotFoundException);
    const renewal = await activeRental();
    await prisma.renewalRequest.create({ data: {
      renewalCode: `WDPR-${randomUUID().slice(0, 8)}`, reservationId: renewal.reservation.id, previousEndDate: renewal.reservation.endDate,
      requestedEndDate: day(30), termMonths: 1, paymentPlan: 'PAY_MONTHLY', quoteSnapshot: {}, requestedByUserId: customerId,
      activeKey: renewal.reservation.id, idempotencyKey: `return-renewal-${randomUUID()}`,
    } });
    await expect(requestReturn(renewal.reservation.id)).rejects.toMatchObject({ response: { code: 'UNRESOLVED_RENEWAL_EXISTS' } });
  });

  it('accepts advance notice for the contract end, independently of the inspection appointment', async () => {
    const { reservation, contracts: [contract] } = await activeRental({ end: day(7) });
    const input = { reservationId: reservation.id, rentalContractId: contract.id, expectedReturnDate: dateText(contract.endDate) };
    const key = 'planned-return-' + reservation.id;
    const request = await returns.createCustomerReturn(customer, input, key);
    expect(request).toMatchObject({ expectedReturnDate: input.expectedReturnDate, timing: 'ON_OR_AFTER_END', inspectionScheduledAt: null,
      actualReturnDate: null, overdueDays: 0 });
    await expect(returns.createCustomerReturn(customer, input, key)).resolves.toMatchObject({ id: request.id });
    await expect(returns.createCustomerReturn(customer, { ...input, expectedReturnDate: dateText(day(8)) }, key)).rejects.toMatchObject({ status: 409 });
    await expect(returns.createCustomerReturn(customer, { ...input, expectedReturnDate: dateText(day(6)) }, key + '-early'))
      .rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    await returns.assign(request.id, { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager);
    await expect(returns.getStaffReturn(request.id, staff)).resolves.toMatchObject({
      inspectionStartBlock: expect.stringContaining('Chưa đến hạn thuê'),
    });
    await expect(returns.startInspection(request.id, staff)).rejects.toMatchObject({
      response: { code: 'RETURN_INSPECTION_WINDOW_NOT_OPEN' },
    });
    await expect(prisma.returnRequest.findUnique({ where: { id: request.id } })).resolves.toMatchObject({
      status: 'REQUESTED', inspectionStartedAt: null, physicallyReturnedAt: null,
    });
  });

  it('waits for the planned return day and the inspection appointment before starting', async () => {
    const { reservation, contracts: [contract] } = await activeRental({ end: day(0) });
    const request = await returns.createCustomerReturn(customer, {
      reservationId: reservation.id, rentalContractId: contract.id, expectedReturnDate: dateText(day(1)),
    }, 'return-window-' + reservation.id);
    await returns.assign(request.id, { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager);
    await expect(returns.startInspection(request.id, staff)).rejects.toThrow('Chưa đến ngày dự kiến trả kho');
    await prisma.returnRequest.update({ where: { id: request.id }, data: {
      expectedReturnDate: day(0), inspectionScheduledAt: new Date(Date.now() + 15 * 60_000),
    } });
    await expect(returns.getStaffReturn(request.id, staff)).resolves.toMatchObject({
      inspectionStartBlock: 'Chưa đến giờ hẹn kiểm tra trả kho.',
    });
    await expect(returns.startInspection(request.id, staff)).rejects.toThrow('Chưa đến giờ hẹn');
    await prisma.returnRequest.update({ where: { id: request.id }, data: {
      inspectionScheduledAt: new Date(Date.now() - 60_000),
    } });
    await expect(returns.startInspection(request.id, staff)).resolves.toMatchObject({
      status: 'INSPECTION_IN_PROGRESS', inspectionStartBlock: null,
    });
  });

  it('counts the end date as zero overdue days for Manager and Staff', async () => {
    const { reservation, contracts: [contract] } = await activeRental({ end: day(0) });
    const request = await requestContract(reservation.id, contract.id);
    const managerRows = await new OverstayController(prisma).list({ headers: {}, user: manager });
    expect(managerRows.items.find(row => row.id === contract.id)?.overdueDays).toBe(0);
    await expect(returns.getStaffReturn(request.id, staff)).resolves.toMatchObject({ overdueDays: 0 });
    await expect(returns.getCustomerReturn(customerId, request.id)).resolves.toMatchObject({ overdueDays: 0 });
  });

  it('releases the physically returned unit while a separate open invoice remains payable', async () => {
    const { reservation, contracts: [contract] } = await activeRental({ end: day(0) });
    const invoice = await prisma.invoice.create({ data: {
      invoiceCode: reservation.reservationCode + '-DUE', reservationId: reservation.id, type: 'RECURRING',
      status: 'OPEN', billingCycle: 2, rentalAmount: 300000n, depositAmount: 0n, balanceDue: 300000n, totalAmount: 300000n,
    } });
    const request = await requestContract(reservation.id, contract.id);
    await passAll(request.id);
    await returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true });
    await expect(prisma.storageUnit.findUnique({ where: { id: contract.reservationUnit.storageUnit.id } }))
      .resolves.toMatchObject({ status: 'AVAILABLE' });
    await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({ status: 'OPEN', balanceDue: 300000n });
    await expect(returns.getManagerReturn(request.id, manager)).resolves.toMatchObject({
      physicallyReturnedAt: expect.any(String), settlementStatus: 'APPROVED', debtStatus: 'OUTSTANDING', outstandingBalance: 300000,
    });
  });

  it.each(['new-with-deposit', 'old-with-deposit', 'new-without-deposit'] as const)(
    'applies the signed deposit refund condition only where agreed (%s)', async scenario => {
      const { reservation, contracts: [contract], initial, quote } = await activeRental({ end: day(0) });
      const signedClause = scenario !== 'old-with-deposit';
      const hasDeposit = scenario !== 'new-without-deposit';
      await prisma.rentalContract.update({ where: { id: contract.id }, data: {
        termsAcceptedAt: day(-30),
        signedSnapshot: { envelopeVersion: 1, document: { clauses: signedClause ? [depositRefundDebtClause] : [{ title: '6. Trả kho', text: 'Quyết toán cọc sau khi nhận kho.' }] } },
      } });
      if (!hasDeposit) {
        await prisma.reservation.update({ where: { id: reservation.id }, data: { quoteSnapshot: { ...quote, depositAmount: 0 } } });
        await prisma.invoice.update({ where: { id: initial.id }, data: { pricingSnapshot: Prisma.DbNull,
          depositAmount: 0n, totalAmount: initial.rentalAmount, amountPaid: initial.rentalAmount } });
      }
      const invoice = await prisma.invoice.create({ data: {
        invoiceCode: reservation.reservationCode + '-DUE', reservationId: reservation.id, type: 'RECURRING', billingCycle: 2,
        status: 'OPEN', rentalAmount: 300000n, depositAmount: 0n, balanceDue: 300000n, totalAmount: 300000n,
      } });
      const request = await requestContract(reservation.id, contract.id);
      await passAll(request.id);
      await returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true });
      await expect(prisma.storageUnit.findUnique({ where: { id: contract.reservationUnit.storageUnit.id } }))
        .resolves.toMatchObject({ status: 'AVAILABLE' });
      const settlement = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: request.id } });
      const deposits = new DepositSettlementsService(prisma);
      const refund = { method: 'BANK_TRANSFER', reference: 'DEPOSIT-REFUND-' + settlement.id, refundConfirmed: true };
      const key = 'refund-' + settlement.id;
      const details = await deposits.getManager(settlement.id, manager);
      expect(details).toMatchObject({ contractOutstandingBalance: 300000, refundRequiresDebtClearance: signedClause });
      if (!hasDeposit) {
        expect(details).toMatchObject({ status: 'SETTLED', refundAmount: 0, refundDueOn: null, refundBlockReason: null });
        expect((await returns.getCustomerReturn(customerId, request.id)).status).toBe('COMPLETED');
        return;
      }
      if (signedClause) {
        expect(details).toMatchObject({ refundDueOn: null, refundBlockReason: expect.stringContaining('công nợ') });
        await expect(deposits.refund(settlement.id, refund, key, manager)).rejects.toMatchObject({
          response: { code: 'DEPOSIT_REFUND_CONTRACT_DEBT', outstandingBalance: 300000 },
        });
        await expect(prisma.depositSettlement.findUnique({ where: { id: settlement.id } })).resolves.toMatchObject({ refundedAt: null });
        // Model a customer clearing the remaining debt a day after the physical return.
        await prisma.returnRequest.update({ where: { id: request.id }, data: { physicallyReturnedAt: day(-1) } });
        const billing = new BillingService(prisma);
        await billing.recordPayment(invoice.id, { amount: 100000, method: 'CASH' }, 'partial-' + invoice.id, manager);
        await expect(deposits.refund(settlement.id, refund, key, manager)).rejects.toMatchObject({
          response: { code: 'DEPOSIT_REFUND_CONTRACT_DEBT', outstandingBalance: 200000 },
        });
        await billing.recordPayment(invoice.id, { amount: 200000, method: 'CASH' }, 'clear-' + invoice.id, manager);
        await expect(deposits.getManager(settlement.id, manager)).resolves.toMatchObject({
          contractOutstandingBalance: 0, refundBlockReason: null, refundDueOn: dateText(day(7)),
        });
      } else {
        expect(details).toMatchObject({ refundBlockReason: null, refundDueOn: dateText(day(7)) });
      }
      await expect(deposits.refund(settlement.id, refund, key, manager)).resolves.toMatchObject({ status: 'SETTLED', deductionAmount: 0 });
      await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({
        balanceDue: signedClause ? 0n : 300000n,
      });
    });

  it.each(['earlyReturn', 'returnOverdue', 'paymentOverdue', 'cancellation'] as const)(
    'rejects a stale booking quote after publishing a %s version', async policy => {
      const draft = { productId: storageTypeId, startDate: dateText(day(2)), periodMode: 'duration', durationMonths: 1, quantity: 1,
        adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' };
      const shown = await booking.checkAvailability(draft);
      expect(shown.available).toBe(true);
      const id = randomUUID();
      await prisma.businessRule.create({ data: { id, key: policy, version: 1, value: pricingPolicyDefaults[policy],
        effectiveFrom: new Date(), createdById: adminId } });
      try {
        await expect(booking.createReservation(customer, { ...draft, expectedServiceQuoteVersion: shown.serviceQuoteVersion }))
          .rejects.toMatchObject({ response: { code: 'SERVICE_QUOTE_CHANGED' } });
      } finally {
        await prisma.businessRule.delete({ where: { id } });
      }
    });

  it('creates exactly one maintenance case per ISSUE_FOUND unit in a quantity-three return', async () => {
    const rental = await activeRental({ quantity: 3 });
    const { reservation } = rental;
    const requested = await historicalReturn(rental);
    const started = await returns.startInspection(requested.id, staff);
    expect(started).toMatchObject({ status: 'INSPECTION_IN_PROGRESS', inspectionStartedBy: { id: staffId, role: 'FACILITY_STAFF' } });
    const issue = await returns.updateInspection(requested.id, started.inspections[0].id, { result: 'ISSUE_FOUND', issueType: 'CUSTOMER_DAMAGE', conditionNote: 'Door dented', issueNote: 'Manager review required' }, staff);
    expect(issue).toMatchObject({ status: 'ISSUE_FOUND', inspectionSummary: { issues: 1 } });
    expect(issue.inspections.find((inspection: any) => inspection.id === started.inspections[0].id)).toMatchObject({ result: 'ISSUE_FOUND', inspectedBy: { id: staffId } });
    const customerView = await returns.getCustomerReturn(customerId, requested.id);
    expect(JSON.stringify(customerView)).not.toContain('Manager review required');
    expect(JSON.stringify(customerView)).not.toContain('Door dented');
    expect(JSON.stringify(customerView)).not.toContain('Return Staff');
    await expect(returns.updateInspection(requested.id, started.inspections[0].id, { result: 'PASS' }, staff)).rejects.toBeInstanceOf(ConflictException);
    await returns.updateInspection(requested.id, started.inspections[1].id, { result: 'ISSUE_FOUND', issueType: 'CLEANING_REQUIRED', conditionNote: 'Cleaning required', issueNote: 'Deep cleaning required' }, staff);
    await returns.updateInspection(requested.id, started.inspections[2].id, { result: 'PASS', conditionNote: 'Good condition' }, staff);
    const finalized = await returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
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
    await expect(returns.finalize(requested.id, manager)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.maintenanceRequest.count({ where: { returnInspection: { returnRequestId: requested.id } } })).toBe(2);
  }, 60000);

  it('stores inspection photos per unit and exposes them only in operational details', async () => {
    const request = await historicalReturn(await activeRental({ quantity: 2 }));
    const [first, second] = (await returns.startInspection(request.id, staff)).inspections;
    const photos = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLZkAAAAASUVORK5CYII='];
    const result = { result: 'PASS', conditionNote: 'Kho sạch' };
    await returns.updateInspection(request.id, first.id, result, staff);
    await expect(returns.updateInspection(request.id, first.id, { ...result, inspectionPhotos: ['data:image/png;base64,AAAA'] }, staff)).rejects.toBeInstanceOf(BadRequestException);
    const evidenceLink = 'https://example.test/return.jpg';
    await returns.updateInspection(request.id, first.id, { ...result, inspectionPhotos: photos, evidenceLink }, staff);
    await returns.updateInspection(request.id, first.id, { ...result, conditionNote: 'Kho sạch, cửa đã đóng' }, staff);
    const managerDetail = await returns.getManagerReturn(request.id, manager);
    const recorded = expect.objectContaining({ staffUserId: staff.id, photos, note: expect.stringContaining(evidenceLink) });
    expect(managerDetail.inspections).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, inspectionPhotos: photos, evidenceSubmissions: [recorded] })]));
    await expect(returns.getManagerReturn(request.id, actor('no-facility-grant', 'FACILITY_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(managerDetail.inspections.find((item: { id: string }) => item.id === second.id)).not.toHaveProperty('inspectionPhotos');
    const customerDetail = await returns.getCustomerReturn(customerId, request.id);
    expect(customerDetail.inspections.find((item: { id: string }) => item.id === first.id)).not.toHaveProperty('inspectionPhotos');
    await returns.updateInspection(request.id, first.id, { ...result, inspectionPhotos: [] }, staff);
    expect((await returns.getStaffReturn(request.id, staff)).inspections).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id, inspectionPhotos: [], evidenceSubmissions: [recorded] })]),
    );
    await prisma.returnRequest.update({ where: { id: request.id }, data: { assignedStaffUserId: null } });
    expect((await returns.getStaffReturn(request.id, staff)).inspections).toEqual([
      expect.objectContaining({ id: first.id, evidenceSubmissions: [recorded] }),
    ]);
    expect((await returns.listStaffReturns({ page: 1, limit: 20 }, staff)).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: request.id })]),
    );
  });

  it('rejects finalization while any inspection remains PENDING', async () => {
    const requested = await historicalReturn(await activeRental({ quantity: 2 }));
    const started = await returns.startInspection(requested.id, staff);
    await returns.updateInspection(requested.id, started.inspections[0].id, { result: 'PASS' }, staff);
    await expect(returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true })).rejects.toMatchObject({ response: { code: 'RETURN_INSPECTIONS_INCOMPLETE' } });
  });

  it('atomically finalizes quantity two, retains allocation history and removes the Active Rental read model', async () => {
    const historical = await activeRental({ quantity: 2 });
    const { reservation, quote, contracts: [a] } = historical;
    const requested = await historicalReturn(historical);
    await expect(requestContract(reservation.id, a.id)).rejects.toMatchObject({ status: 409 });
    await passAll(requested.id);
    const completed = await returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
    expect(completed).toMatchObject({ status: 'PENDING_SETTLEMENT', physicallyReturnedBy: { id: staffId, role: 'FACILITY_STAFF' }, settlementStatus: 'APPROVED', inspectionSummary: { passed: 2 } });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED', completedAt: { not: null } } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null }, actualVacatedAt: { not: null } } })).toBe(2);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'AVAILABLE' } })).toBe(2);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id } })).toBe(2);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(quote);
    expect(await prisma.depositSettlement.findUnique({ where: { returnRequestId: requested.id } })).toMatchObject({ status: 'APPROVED', depositAmount: 3000000n, totalApprovedCharges: 0n, deductionAmount: 0n, refundAmount: 3000000n, outstandingAmount: 0n });
    const settlement = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: requested.id } });
    await expect(new DepositSettlementsService(prisma).getCustomer(customerId, settlement.id)).resolves.toMatchObject({ depositAmount: 3000000, returnedUnits: [{ unitCode: historical.units[0].unitNumber }, { unitCode: historical.units[1].unitNumber }] });
    await expect(rentals.getCustomerRental(customerId, reservation.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back every transition when one physical unit is invalid', async () => {
    const { reservation, contracts: [a] } = await activeRental({ quantity: 2 });
    const requested = await requestContract(reservation.id, a.id);
    const passed = await passAll(requested.id);
    await prisma.storageUnit.update({ where: { id: passed.inspections[0].unit.id }, data: { status: 'MAINTENANCE' } });
    await expect(returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true })).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: requested.id } })).status).toBe('INSPECTION_IN_PROGRESS');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } })).toBe(0);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null } } })).toBe(0);
  });

  it('makes finalize retry idempotent and concurrent attempts safe', async () => {
    const { reservation } = await activeRental();
    const requested = await requestReturn(reservation.id);
    await passAll(requested.id);
    const attempts = await Promise.allSettled([
      returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true }),
      returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true }),
    ]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const retry = await returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
    expect(retry.status).toBe('PENDING_SETTLEMENT');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: { not: null } } })).toBe(1);
    expect(await prisma.depositSettlement.count({ where: { returnRequestId: requested.id } })).toBe(1);
    expect(await prisma.maintenanceRequest.count({ where: { returnInspection: { returnRequestId: requested.id } } })).toBe(0);
  });

  it('allows only one concurrent request for the same contract', async () => {
    const { reservation, contracts: [a] } = await activeRental({ quantity: 2 });
    const attempted = await Promise.allSettled([requestContract(reservation.id, a.id), requestContract(reservation.id, a.id)]);
    expect(attempted.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempted.find(item => item.status === 'rejected')).toMatchObject({ reason: { status: 409, response: { code: 'ACTIVE_RETURN_EXISTS' } } });
    expect(await prisma.returnRequest.count({ where: { reservationId: reservation.id } })).toBe(1);
  });

  it('blocks a contract with a pending transfer while allowing the other warehouse to be returned', async () => {
    const { reservation, contracts: [a, b] } = await activeRental({ quantity: 2 });
    await prisma.transferRequest.create({ data: {
      transferCode: 'TEST-TRANSFER-' + runId, idempotencyKey: 'test-transfer-' + runId, reservationId: reservation.id,
      rentalContractId: b.id, fromStorageUnitId: b.reservationUnit.storageUnit.id, fromReservationUnitId: b.reservationUnit.id,
      reason: 'UNIT_ISSUE', status: 'REQUESTED', requestedByUserId: staff.id,
    } });
    await expect(requestContract(reservation.id, b.id)).rejects.toMatchObject({ response: { code: 'RETURN_PENDING_TRANSFER' } });
    const request = await requestContract(reservation.id, a.id);
    await passAll(request.id);
    await expect(returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true })).resolves.toMatchObject({ status: 'PENDING_SETTLEMENT' });
    await expect(prisma.transferRequest.findFirst({ where: { rentalContractId: b.id } })).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('returns and settles two contracts sequentially using the actual unequal deposit lines', async () => {
    const { reservation, units, contracts: [a, b], initial } = await activeRental({ quantity: 2 });
    const deposits = new DepositSettlementsService(prisma);
    const boxA = await prisma.storedItem.create({ data: { rentalContractId: a.id, itemCode: 'BOX-A-' + runId, name: 'A', unit: 'thùng', customerUserId: customerId, balance: 2 } });
    const boxB = await prisma.storedItem.create({ data: { rentalContractId: b.id, itemCode: 'BOX-B-' + runId, name: 'B', unit: 'thùng', customerUserId: customerId, balance: 3 } });
    const outbound = await prisma.stockMovement.create({ data: { rentalContractId: a.id, movementCode: 'OUT-' + runId, customerUserId: customerId, type: 'OUT', idempotencyKey: 'stock-return-' + runId } });
    const first = await requestContract(reservation.id, a.id);
    const overdue = new OverstayController(prisma);
    for (const user of [manager, staff]) {
      const list = await overdue.list({ headers: {}, user });
      expect(list.items.find(item => item.id === a.id)?.returnRequest?.id).toBe(first.id);
      expect(list.items.find(item => item.id === b.id)?.returnRequest).toBe(user === manager ? null : undefined);
    }
    await passAll(first.id);
    await expect(returns.finalize(first.id, staff, { unitsEmpty: true, accessRevoked: true })).resolves.toMatchObject({ status: 'PENDING_SETTLEMENT' });
    await expect(prisma.storedItem.findUnique({ where: { id: boxA.id } })).resolves.toMatchObject({ balance: 2 });
    await expect(prisma.stockMovement.findUnique({ where: { id: outbound.id } })).resolves.toMatchObject({ status: 'REQUESTED' });
    await expect(returns.getManagerReturn(first.id,manager)).resolves.toMatchObject({ remainingUnitCount: 1, settlement: { depositAmount: 1250000 } });
    const firstDeposit = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: first.id } });
    await expect(deposits.refund(firstDeposit.id, { method: 'CASH', reference: 'receipt-a' }, 'refund-a-' + runId, staff)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(deposits.refund(firstDeposit.id, { method: 'CASH', refundConfirmed: true }, 'refund-a-' + runId, manager)).rejects.toThrow('mã chứng từ');
    await expect(deposits.refund(firstDeposit.id, { method: 'BANK_TRANSFER', refundConfirmed: true }, 'refund-a-' + runId, manager)).rejects.toThrow('mã giao dịch');
    await deposits.refund(firstDeposit.id, { method: 'CASH', reference: 'receipt-a' }, 'refund-a-' + runId, manager);
    await expect(returns.getCustomerReturn(customerId, first.id)).resolves.toMatchObject({ status: 'COMPLETED' });

    await expect(prisma.storageUnit.findUnique({ where: { id: units[0].id } })).resolves.toMatchObject({ status: 'AVAILABLE' });
    await expect(prisma.storageUnit.findUnique({ where: { id: units[1].id } })).resolves.toMatchObject({ status: 'OCCUPIED' });
    await expect(prisma.reservationUnit.findUnique({ where: { id: b.reservationUnit.id } })).resolves.toMatchObject({ releasedAt: null });
    await expect(prisma.storedItem.findUnique({ where: { id: boxB.id } })).resolves.toMatchObject({ balance: 3 });
    await expect(rentals.getCustomerRental(customerId, reservation.id)).resolves.toMatchObject({ unitCount: 1, quantity: 1, contracts: [{ id: b.id, status: 'ACTIVE' }] });
    await expect(rentals.listManagerRentals({ page: 1, limit: 5, unitCode: units[0].unitNumber }, manager)).resolves.toMatchObject({ total: 0 });
    await expect(rentals.listManagerRentals({ page: 1, limit: 5, unitCode: units[1].unitNumber }, manager)).resolves.toMatchObject({ total: 1, items: [{ unitCount: 1 }] });
    await expect(prisma.reservation.findUnique({ where: { id: reservation.id } })).resolves.toMatchObject({ status: 'CONFIRMED' });

    const second = await requestContract(reservation.id, b.id);
    await passAll(second.id);
    await returns.finalize(second.id, staff, { unitsEmpty: true, accessRevoked: true });
    const secondDeposit = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: second.id } });
    expect(secondDeposit.depositAmount).toBe(1750000n);
    await deposits.refund(secondDeposit.id, { method: 'CASH', reference: 'receipt-b' }, 'refund-b-' + runId, manager);
    await deposits.refund(secondDeposit.id, { method: 'CASH', reference: 'receipt-b' }, 'refund-b-' + runId, manager);
    await expect(rentals.getCustomerRental(customerId, reservation.id)).rejects.toBeInstanceOf(NotFoundException);
    const ledger = await prisma.depositSettlement.aggregate({ where: { returnRequest: { reservationId: reservation.id } }, _count: true, _sum: { refundAmount: true } });
    expect(ledger).toMatchObject({ _count: 2, _sum: { refundAmount: initial.depositAmount } });
    await expect(prisma.invoice.findUnique({ where: { id: initial.id } })).resolves.toEqual(initial);
  });

  it('rolls back actual database writes when the physical unit update fails', async () => {
    const { reservation, contracts: [a] } = await activeRental({ quantity: 2 });
    const request = await requestContract(reservation.id, a.id);
    await passAll(request.id);
    const failingClient = new Proxy(prisma, {
      get(target, key, receiver) {
        if (key !== '$transaction') return Reflect.get(target, key, receiver);
        return (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => operation(new Proxy(tx, {
          get(transaction, property, context) {
            if (property !== 'storageUnit') return Reflect.get(transaction, property, context);
            return { updateMany: async () => {
              expect(await tx.rentalContract.findUnique({ where: { id: a.id } })).toMatchObject({ status: 'COMPLETED' });
              throw new Error('Forced storage update failure');
            } };
          },
        })));
      },
    });
    await expect(new ReturnsService(failingClient).finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true })).rejects.toThrow('Forced storage update failure');
    await expect(prisma.rentalContract.findUnique({ where: { id: a.id } })).resolves.toMatchObject({ status: 'ACTIVE', completedAt: null });
    await expect(prisma.reservationUnit.findUnique({ where: { id: a.reservationUnit.id } })).resolves.toMatchObject({ releasedAt: null });
    await expect(prisma.storageUnit.findUnique({ where: { id: a.reservationUnit.storageUnit.id } })).resolves.toMatchObject({ status: 'OCCUPIED' });
    await expect(prisma.depositSettlement.count({ where: { returnRequestId: request.id } })).resolves.toBe(0);
  });

  it('applies early approval to one contract only and invoices future periods for the remaining unit', async () => {
    const { reservation, contracts: [a, b], initial, quote } = await activeRental({ quantity: 2, end: day(16) });
    const monthStart = new Date(businessDate().slice(0, 7) + '-01T00:00:00Z');
    const endDate = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 3, 1));
    await prisma.reservation.update({ where: { id: reservation.id }, data: { startDate: monthStart, endDate, durationMonths: 3, quoteSnapshot: { ...quote, termMonths: 3 } } });
    await prisma.rentalContract.updateMany({ where: { reservationId: reservation.id }, data: { startDate: monthStart, endDate } });
    await prisma.reservationUnit.updateMany({ where: { reservationId: reservation.id }, data: { plannedStartDate: monthStart, plannedEndDate: endDate } });
    await expect(requestContract(reservation.id, a.id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    const proposal = await support.createCustomer(customer, { reservationId: reservation.id, rentalContractId: a.id, category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: 'Trả sớm một kho.' }, 'early-unit-' + runId);
    await expect(returns.decideEarlyReturn(proposal.id, { decision: 'APPROVED', note: 'Đã kiểm tra.', financialReviewConfirmed: true, reviewedEndDate: dateText(endDate), reviewedPaidAmount: Number(initial.amountPaid), reviewedOutstandingAmount: 0 }, manager)).resolves.toMatchObject({ rentalContractId: a.id, contracts: [{ id: a.id }] });
    await expect(requestContract(reservation.id, b.id)).rejects.toMatchObject({ response: { code: 'EARLY_RETURN_APPROVAL_REQUIRED' } });
    const request = await requestContract(reservation.id, a.id);
    await expect(returns.getStaffReturn(request.id, staff)).resolves.toMatchObject({ assignedStaff: { id: staff.id } });
    await passAll(request.id);
    await returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true });
    const billing = new BillingService(prisma);
    const recurring = await prisma.$transaction(tx => billing.ensureRecurringInvoices(tx, reservation.id));
    expect(recurring).toHaveLength(2);
    for (const invoice of recurring) expect(invoice).toMatchObject({ rentalAmount: 1500000n, pricingSnapshot: { breakdown: { units: [{ contractId: b.id }] } } });
    await expect(prisma.invoice.findUnique({ where: { id: initial.id } })).resolves.toEqual(initial);
  });

  it.each(['future-unpaid', 'prepaid', 'prepaid-combined', 'prepaid-combined-with-debt', 'used-debt'] as const)('closes earlier rental with %s and keeps financial and physical records consistent', async (scenario: any) => {
    const start = day(-40);
    const end = monthlyBoundary(start, 6);
    const { reservation, contracts: [contract], initial, quote } = await activeRental({ end });
    const isPrepaid = scenario.startsWith('prepaid');
    const billing = new BillingService(prisma);
    const service = new ReturnsService(prisma, undefined, billing);
    const terms = { ...quote, termMonths: 6, paymentPlan: isPrepaid ? 'PREPAID' : 'PAY_MONTHLY' };
    await prisma.reservation.update({ where: { id: reservation.id }, data: { quoteSnapshot: terms } });
    const initialTotal = isPrepaid ? 10500000n : 3000000n;
    const initialRent = initialTotal - 1500000n;
    const initialEnd = isPrepaid ? end : monthlyBoundary(start, 1);
    const breakdown = invoiceBreakdown(start, initialEnd, [invoiceUnit(contract, 1500000n, initialRent, 1500000n)], [], {
      rentalAmount: initialRent, depositAmount: 1500000n, serviceAmount: 0n, totalAmount: initialTotal,
    });
    const paidInitial = await prisma.invoice.update({ where: { id: initial.id }, data: {
      billingPeriodEnd: initialEnd, totalAmount: initialTotal, amountPaid: initialTotal, rentalAmount: initialRent, pricingSnapshot: { ...terms, breakdown },
    } });
    const payment = await prisma.payment.create({ data: { idempotencyKey: 'prepaid-' + initial.id, paymentCode: initial.invoiceCode + '-P',
      invoiceId: initial.id, amount: initialTotal, method: 'BANK_TRANSFER' } });
    await prisma.$transaction(tx => billing.ensureRecurringInvoices(tx, reservation.id));
    if (scenario === 'future-unpaid') {
      const second = await prisma.invoice.update({ where: { reservationId_billingCycle: { reservationId: reservation.id, billingCycle: 2 } }, data: { status: 'PAID', amountPaid: 1500000n, balanceDue: 0n } });
      await prisma.payment.create({ data: { idempotencyKey: 'second-' + initial.id, paymentCode: second.invoiceCode + '-P', invoiceId: second.id, amount: 1500000n, method: 'CASH' } });
    }
    const proposal = await support.createCustomer(customer, { reservationId: reservation.id, rentalContractId: contract.id,
      category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: 'Không còn nhu cầu.', earlyReturnRequestedDate: businessDate(), earlyReturnReason: 'NO_LONGER_NEEDED',
    }, 'period-closeout-' + initial.id);
    const ledger = await prisma.invoice.findMany({ where: { reservationId: reservation.id } });
    await service.decideEarlyReturn(proposal.id, { decision: 'APPROVED', note: 'Đã kiểm tra.', financialReviewConfirmed: true,
      reviewedEndDate: dateText(end), reviewedPaidAmount: ledger.reduce((sum, item) => sum + Number(item.amountPaid), 0),
      reviewedOutstandingAmount: ledger.reduce((sum, item) => sum + Number(item.balanceDue), 0),
    }, manager);
    if (scenario === 'future-unpaid') {
      await prisma.supportRequest.update({ where: { id: proposal.id }, data: { earlyReturnFinancialReview: Prisma.DbNull } });
      expect(await rentals.getCustomerRental(customerId, reservation.id)).toMatchObject({ contracts: [{ returnReadiness: {
        canReturn: true, requiresFullSettlement: false, totalOutstanding: 6000000,
      } }] });
    }
    expect(await prisma.invoice.findMany({ where: { reservationId: reservation.id, status: 'VOID' } })).toHaveLength(0);
    expect(await prisma.rentalContract.findUnique({ where: { id: contract.id } })).toMatchObject({ status: 'ACTIVE' });
    const requested = await service.createCustomerReturn(customer, { reservationId: reservation.id, rentalContractId: contract.id }, 'handover-' + initial.id);
    await service.assign(requested.id, { staffUserId: staff.id }, manager);
    await passAll(requested.id);
    await expect(service.finalize(requested.id, staff)).rejects.toThrow('thu hồi');
    await service.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
    await service.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
    const refundAmount = isPrepaid ? 6000000 : 0;
    expect(await service.getCustomerReturn(customerId, requested.id)).toMatchObject({ status: 'PENDING_SETTLEMENT', earlyReturnCloseout: {
      rentalAmount: 3000000, outstandingAmount: scenario === 'used-debt' ? 1500000 : 0, refundAmount,
      waivedAmount: isPrepaid ? 0 : 6000000, penaltyAmount: 0,
    }, rentRefund: { approvedAt: null, refundedAt: null } });
    expect(await prisma.rentalContract.findUnique({ where: { id: contract.id } })).toMatchObject({ status: 'COMPLETED' });
    expect(await prisma.storageUnit.findUnique({ where: { id: contract.reservationUnit.storageUnit.id } })).toMatchObject({ status: 'AVAILABLE' });
    expect(await prisma.invoice.findUnique({ where: { id: initial.id } })).toEqual(paidInitial);
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toEqual(payment);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id, status: 'VOID' } })).toBe(isPrepaid ? 0 : 4);
    await expect(prisma.$transaction(tx => billing.ensureRecurringInvoices(tx, reservation.id))).rejects.toThrow('đã được bàn giao');
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(isPrepaid ? 1 : 6);
    const deposit = await prisma.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: requested.id } });
    expect(deposit).toMatchObject({ refundAmount: 1500000n, status: 'APPROVED' });
    const settlements = new DepositSettlementsService(prisma);
    expect(await settlements.getManager(deposit.id, manager)).toMatchObject({ refundAmount: 1500000, earlyReturnSettlement: {
      returnId: requested.id, closeout: { appliedAt: expect.any(String), refundAmount }, rentRefund: { approvedAt: null, refundedAt: null },
    } });
    expect(await settlements.getCustomer(customerId, deposit.id)).not.toHaveProperty('earlyReturnSettlement');
    if (scenario === 'prepaid-combined' || scenario === 'prepaid-combined-with-debt') {
      const key = 'combined-' + initial.id;
      const body = { depositAmount: 1500000, rentAmount: refundAmount, refundConfirmed: true };
      await expect(settlements.confirmReturnRefund(deposit.id, { ...body, refundConfirmed: false }, key, manager)).rejects.toThrow('xác nhận');
      const reference = 'combined-transfer-' + initial.id;
      await expect(settlements.confirmReturnRefund(deposit.id, { ...body, rentAmount: 1, reference }, key, manager)).rejects.toThrow('Số tiền cần hoàn vừa thay đổi');
      await expect(settlements.confirmReturnRefund(deposit.id, body, key, manager)).rejects.toThrow('mã giao dịch');
      if (scenario === 'prepaid-combined-with-debt') {
        await prisma.rentalContract.update({ where: { id: contract.id }, data: {
          termsAcceptedAt: start, signedSnapshot: { clauses: [depositRefundDebtClause] },
        } });
        const late = await prisma.invoice.create({ data: {
          invoiceCode: initial.invoiceCode + '-LATE', reservationId: reservation.id, type: 'SETTLEMENT', status: 'OPEN',
          billingCycle: null, rentalAmount: 0n, serviceAmount: 0n, depositAmount: 0n, chargeAmount: 50000n, totalAmount: 50000n, balanceDue: 50000n,
          pricingSnapshot: { adjustment: 'PAYMENT_OVERDUE', sourceInvoiceId: initial.id },
        } });
        await expect(settlements.confirmReturnRefund(deposit.id, { ...body, reference }, key, manager)).rejects.toMatchObject({
          response: { code: 'DEPOSIT_REFUND_CONTRACT_DEBT', outstandingBalance: 50000 },
        });
        await billing.recordPayment(late.id, { amount: 50000, method: 'CASH' }, 'late-' + late.id, manager);
      }
      const confirmed = await settlements.confirmReturnRefund(deposit.id, { ...body, reference }, key, manager);
      expect(confirmed).toMatchObject({ status: 'SETTLED', refundReference: reference, refundedAt: expect.any(String),
        earlyReturnSettlement: { rentRefund: { approvedAt: confirmed.refundedAt, refundedAt: confirmed.refundedAt, reference } } });
      expect(await settlements.confirmReturnRefund(deposit.id, { ...body, reference }, key, manager)).toEqual(confirmed);
      await expect(settlements.confirmReturnRefund(deposit.id, { ...body, reference: 'different-reference' }, key, manager))
        .rejects.toMatchObject({ status: 409 });
      expect(await prisma.returnRequest.findUnique({ where: { id: requested.id } })).toMatchObject({ status: 'COMPLETED', rentRefundedById: manager.id });
      return;
    }
    await settlements.refund(deposit.id, { method: 'BANK_TRANSFER', reference: 'deposit-' + initial.id }, 'deposit-' + initial.id, manager);
    expect(await prisma.returnRequest.findUnique({ where: { id: requested.id } })).toMatchObject({ status: 'PENDING_SETTLEMENT' });
    const approved = await service.settleEarlyReturn(requested.id, { amount: refundAmount }, manager);
    expect(approved).toMatchObject({ approvedAt: expect.any(String), refundedAt: null });
    if (isPrepaid) {
      const transfer = { amount: refundAmount, reference: 'rent-' + initial.id, transferredAt: new Date().toISOString() };
      expect(await prisma.returnRequest.findUnique({ where: { id: requested.id } })).toMatchObject({ status: 'PENDING_SETTLEMENT' });
      const confirmed = await service.settleEarlyReturn(requested.id, transfer, manager, true);
      expect(await settlements.getManager(deposit.id, manager)).toMatchObject({ status: 'SETTLED', earlyReturnSettlement: { rentRefund: confirmed } });
      expect(await service.settleEarlyReturn(requested.id, transfer, manager, true)).toEqual(confirmed);
      await expect(service.settleEarlyReturn(requested.id, { ...transfer, reference: 'another' }, manager, true)).rejects.toThrow('đã được ghi nhận');
    }
    expect(await prisma.returnRequest.findUnique({ where: { id: requested.id } })).toMatchObject({ status: 'COMPLETED' });
    if (scenario === 'used-debt') {
      await expect(service.getCustomerReturn(customerId, requested.id)).resolves.toMatchObject({
        physicallyReturnedAt: expect.any(String), settlementStatus: 'SETTLED', debtStatus: 'OUTSTANDING', outstandingBalance: 1500000,
      });
    }
  });

  it('allows an early return approval for a previously signed contract using the standard decision', async () => {
    const { reservation, contracts: [contract], initial } = await activeRental({ end: day(10) });
    await prisma.rentalContract.update({ where: { id: contract.id }, data: { termsAcceptedAt: day(-39) } });
    const request = await support.createCustomer(customer, { reservationId: reservation.id, rentalContractId: contract.id,
      category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: 'Trả kho trước hạn theo thỏa thuận.' }, 'old-terms-' + initial.id);
    const decision = { decision: 'APPROVED', note: 'Hai bên đồng ý trả sớm', financialReviewConfirmed: true,
      reviewedEndDate: dateText(contract.endDate), reviewedPaidAmount: Number(initial.amountPaid), reviewedOutstandingAmount: 0 };
    await expect(returns.decideEarlyReturn(request.id, decision, manager)).resolves.toMatchObject({
      decision: 'APPROVED', financialReview: { policy: 'PERIOD_CLOSEOUT_V1' },
    });
  });

  it.each([true, false])('applies facility relief only with evidence and review (%s)', async (verified: any) => {
    const { reservation, contracts: [contract], initial } = await activeRental({ end: day(10) });
    await prisma.payment.create({ data: { idempotencyKey: 'fault-' + initial.id, paymentCode: initial.invoiceCode + '-P', invoiceId: initial.id,
      amount: initial.totalAmount, method: 'CASH' } });
    const proposal = await support.createCustomer(customer, { reservationId: reservation.id, rentalContractId: contract.id,
      category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: 'Kho có sự cố.', earlyReturnReason: 'FACILITY_ISSUE',
    }, 'proposal-fault-' + initial.id);
    await returns.decideEarlyReturn(proposal.id, { decision: 'APPROVED', note: 'Cho phép trả sớm', financialReviewConfirmed: true,
      reviewedEndDate: dateText(contract.endDate), reviewedPaidAmount: Number(initial.amountPaid), reviewedOutstandingAmount: 0,
    }, manager);
    const request = await requestContract(reservation.id, contract.id);
    const inspection = (await returns.startInspection(request.id, staff)).inspections[0];
    const evidence = { approved: true, reference: 'INCIDENT-01' };
    await expect(returns.reviewEarlyReturnFault(request.id, evidence, manager)).rejects.toThrow('Cần kết quả kiểm tra');
    if (verified) {
      await returns.updateInspection(request.id, inspection.id, { result: 'ISSUE_FOUND', issueType: 'FACILITY_FAULT', issueNote: 'Rò nước từ hệ thống kho.' }, staff);
      await expect(returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true })).rejects.toThrow('quản lý xác minh');
      await expect(returns.reviewEarlyReturnFault(request.id, evidence, staff)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(returns.reviewEarlyReturnFault(request.id, evidence, manager)).resolves.toEqual({ decision: 'APPROVED' });
    } else {
      await returns.updateInspection(request.id, inspection.id, { result: 'PASS' }, staff);
    }
    await returns.finalize(request.id, staff, { unitsEmpty: true, accessRevoked: true });
    expect(await returns.getCustomerReturn(customerId, request.id)).toMatchObject({ earlyReturnCloseout: {
      facilityFaultCredit: verified ? 300000 : 0, refundAmount: verified ? 300000 : 0,
    } });
    expect(await prisma.storageUnit.findUnique({ where: { id: contract.reservationUnit.storageUnit.id } })).toMatchObject({ status: verified ? 'MAINTENANCE' : 'AVAILABLE' });
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
    await returns.finalize(requested.id, staff, { unitsEmpty: true, accessRevoked: true });
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
    const managerList = await returns.listManagerReturns({ page: 1, limit: 20, search: customerId, status: 'REQUESTED', date: businessDate() },manager);
    const staffList = await returns.listStaffReturns({ page: 1, limit: 20, search: unitCodes[0] }, staff);
    expect(managerList.total).toBe(1);
    expect(staffList.total).toBe(1);
    expect(JSON.stringify(await returns.getManagerReturn(requested.id,manager))).not.toContain('secret-hash');
    expect(JSON.stringify(await returns.getStaffReturn(requested.id, staff))).not.toContain('billingSummary');
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
      [CustomerReturnsController, ['STORAGE_CUSTOMER']],
      [ManagerReturnsController, ['FACILITY_MANAGER']],
      [StaffReturnsController, ['FACILITY_STAFF']],
    ];
    for (const [controller, roles] of allowed) {
      for (const role of ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const) {
        const context = { getHandler: () => function returnOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role }, method: 'GET' }) }) } as unknown as ExecutionContext;
        if (roles.includes(role)) expect(rolesGuard.canActivate(context)).toBe(true);
        else expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });
});
