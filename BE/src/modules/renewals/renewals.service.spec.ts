import 'dotenv/config';
import { ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BillingService } from '../billing/billing.service.js';
import { homogeneousInvoiceUnits, invoiceBreakdown, invoiceContractInclude } from '../billing/invoice-breakdown.js';
import { OnlinePaymentService } from '../billing/online-payment.service.js';
import type { VnpayService } from '../billing/vnpay.service.js';
import { ReturnsService } from '../returns/returns.service.js';
import { BookingService } from '../booking/booking.service.js';
import { ActiveRentalsService } from '../rentals-active/active-rentals.service.js';
import { CustomerRenewalsController } from './customer-renewals.controller.js';
import { ManagerRenewalsController } from './manager-renewals.controller.js';
import { RenewalsService } from './renewals.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `renew-facility-${runId}`;
const storageTypeId = `renew-product-${runId}`;
const customerId = `renew-customer-${runId}`;
const otherCustomerId = `renew-other-${runId}`;
const managerId = `renew-manager-${runId}`;
const adminId = `renew-admin-${runId}`;
const staffId = `renew-staff-${runId}`;
const unitCodes = [1, 2, 3, 4].map((value) => `RENEW-${runId}-${value}`);

describe('Renewal V1', () => {
  let prisma: PrismaService;
  let renewals: RenewalsService;
  let billing: BillingService;
  let booking: BookingService;
  let activeRentals: ActiveRentalsService;
  const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Test`, email: `${id}@example.test`, phone: '' });
  const manager = actor(managerId, 'MANAGER');
  const staff = actor(staffId, 'STAFF');

  beforeAll(async () => {
    process.env.WDP_BANK_CODE = '970436';
    process.env.WDP_BANK_ACCOUNT_NUMBER = '0123456789';
    prisma = new PrismaService();
    await prisma.$connect();
    renewals = new RenewalsService(prisma);
    billing = new BillingService(prisma, renewals);
    booking = new BookingService(prisma);
    activeRentals = new ActiveRentalsService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `RENEW-${runId}`, name: 'Renewal test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `RN-${runId}`, name: 'Renewal product', sizeId: 'medium', sizeName: 'Kho vừa', kicker: 'Test', condition: 'STANDARD',
      widthCm: 200, lengthCm: 300, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '40', suitableItems: ['Boxes'],
      image: 'https://example.test/renewal.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 3100000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'R', row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Renewal Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Other Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Renewal Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Renewal Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Renewal Staff', role: 'STAFF', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    const invoice = { reservation: { storageTypeId } };
    await prisma.onlinePaymentReconciliation.deleteMany({ where: { onlinePaymentTransaction: { invoice } } });
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.onlinePaymentTransaction.deleteMany({ where: { invoice } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.depositSettlement.deleteMany({ where: { returnRequest: { reservation: { storageTypeId } } } });
    await prisma.returnRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 3100000 } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, managerId, adminId, staffId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  const originalQuote = (quantity: number) => ({ currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 6, quantity, monthlyUnitPrice: 2900000, rentalAmount: 17400000 * quantity, depositAmount: 2900000 * quantity });

  async function activeRental(options: { quantity?: number; customer?: string; contractStatus?: 'ACTIVE' | 'READY_FOR_HANDOVER'; endDate?: string } = {}) {
    const quantity = options.quantity ?? 1;
    const customer = options.customer ?? customerId;
    const startDate = new Date('2026-11-10T00:00:00.000Z');
    const endDate = new Date(`${options.endDate ?? '2027-05-10'}T00:00:00.000Z`);
    const reference = `WDP-2027-${randomUUID().slice(0, 8).toUpperCase()}`;
    const quote = originalQuote(quantity);
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: customer, facilityId, storageTypeId, quantity, startDate, endDate,
      periodMode: 'DURATION', durationMonths: 6, availabilitySnapshot: {}, quoteSnapshot: quote as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `renew-reservation-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: startDate, plannedEndDate: endDate } });
      await prisma.rentalContract.create({ data: {
        contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: reservation.id, reservationUnitId: allocation.id,
        status: options.contractStatus ?? 'ACTIVE', startDate, endDate, activatedAt: options.contractStatus === 'READY_FOR_HANDOVER' ? null : new Date(),
      } });
      await prisma.storageUnit.update({ where: { id: unit.id }, data: { status: options.contractStatus === 'READY_FOR_HANDOVER' ? 'AVAILABLE' : 'OCCUPIED' } });
    }
    const contracts = await prisma.rentalContract.findMany({ where: { reservationId: reservation.id }, include: invoiceContractInclude, orderBy: { contractCode: 'asc' } });
    const perUnit = 2900000n;
    const total = perUnit * BigInt(quantity);
    const breakdown = invoiceBreakdown(startDate, new Date('2026-12-10T00:00:00Z'), homogeneousInvoiceUnits(contracts, perUnit, total, total), [],
      { rentalAmount: total, depositAmount: total, totalAmount: total * 2n, serviceAmount: 0n });
    const invoice = await prisma.invoice.create({ data: {
      invoiceCode: `${reference}-I01`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1,
      billingPeriodStart: startDate, billingPeriodEnd: new Date('2026-12-10T00:00:00.000Z'), dueAt: startDate, status: 'PAID',
      rentalAmount: 2900000n * BigInt(quantity), depositAmount: 2900000n * BigInt(quantity), totalAmount: 5800000n * BigInt(quantity),
      amountPaid: 5800000n * BigInt(quantity), balanceDue: 0n, paidAt: new Date(),
      pricingSnapshot: { ...quote, breakdown },
    } });
    await prisma.payment.create({ data: { paymentCode: `${reference}-I01-P01`, invoiceId: invoice.id, amount: invoice.totalAmount, method: 'BANK_TRANSFER', reference: 'ORIGINAL', recordedByUserId: managerId, idempotencyKey: `renew-original-${randomUUID()}` } });
    return { reservation, units, quote, invoice, contracts };
  }

  const request = (reservationId: string, termMonths = 3, paymentPlan: 'PAY_MONTHLY' | 'PREPAID' = 'PREPAID', key = `renew-key-${randomUUID()}`, rentalContractId?: string) =>
    renewals.createCustomerRenewal(customerId, { reservationId, rentalContractId, termMonths, paymentPlan }, key);

  async function acceptAndPay(renewal: Awaited<ReturnType<typeof request>>, key = `scoped-paid-${randomUUID()}`) {
    await prisma.renewalRequest.update({ where: { id: renewal.id }, data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customerId } });
    const invoice = renewal.invoices[0];
    return billing.recordPayment(invoice.id, { amount: invoice.balanceDue, method: 'CASH' }, key, manager);
  }

  async function resetRenewalToPending(id: string) {
    await prisma.invoice.deleteMany({ where: { renewalRequestId: id } });
    await prisma.renewalRequest.update({ where: { id }, data: { status: 'PENDING', reviewedByUserId: null, reviewedAt: null, approvedAt: null } });
  }

  async function addFutureConflict(reservationId: string, storageUnitId: string) {
    const future = await prisma.reservation.create({ data: {
      reservationCode: `WDP-FUTURE-${randomUUID().slice(0, 8)}`, customerId: otherCustomerId, facilityId, storageTypeId, quantity: 1,
      startDate: new Date('2027-05-10T00:00:00.000Z'), endDate: new Date('2027-06-10T00:00:00.000Z'), periodMode: 'DURATION', durationMonths: 1,
      availabilitySnapshot: {}, quoteSnapshot: originalQuote(1) as Prisma.InputJsonValue, status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `future-${randomUUID()}`,
    } });
    await prisma.reservationUnit.create({ data: { reservationId: future.id, storageUnitId, plannedStartDate: future.startDate, plannedEndDate: future.endDate } });
    return future;
  }

  it('quotes only the selected unit at the calendar boundary and freezes the effective price', async () => {
    const { reservation, quote, invoice, contracts: [a, b] } = await activeRental({ quantity: 2, endDate: '2027-01-31' });
    await prisma.rentalContract.update({ where: { id: a.id }, data: { currentMonthlyRate: 1200000n, rateEffectiveFrom: reservation.startDate } });
    const originalPayment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    const key = `renew-idempotent-${runId}`;
    await expect(request(reservation.id)).rejects.toMatchObject({ status: 400 });
    const preview = await renewals.quoteCustomerRenewal(customerId, { reservationId: reservation.id, rentalContractId: a.id, termMonths: 3, paymentPlan: 'PREPAID' });
    expect(preview.totalAmount).toBe(3420000);
    const first = await request(reservation.id, 3, 'PREPAID', key, a.id);
    const retry = await request(reservation.id, 3, 'PREPAID', key, a.contractCode);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'APPROVED_PENDING_PAYMENT', previousEndDate: '2027-01-31', requestedEndDate: '2027-04-30', termMonths: 3, paymentPlan: 'PREPAID' });
    expect(first.invoices).toHaveLength(1);
    expect(first.quoteSnapshot).toMatchObject({ monthlyUnitPrice: 1200000, quantity: 1, discountPercent: 5, baseRentalAmount: 3600000, discountAmount: 180000, rentalAmount: 3420000, depositAmount: 0, totalAmount: 3420000 });
    expect(first.appendix?.snapshot).toMatchObject({ contracts: [{ contractCode: a.contractCode, unitCode: a.reservationUnit.storageUnit.unitNumber }] });
    await expect(request(reservation.id, 3, 'PREPAID', key, b.id)).rejects.toBeInstanceOf(ConflictException);
    await prisma.storageType.update({ where: { id: storageTypeId }, data: { monthlyRate: 3300000 } });
    expect((await renewals.getCustomerRenewal(customerId, first.id)).quoteSnapshot).toEqual(first.quoteSnapshot);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).quoteSnapshot).toEqual(quote);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ totalAmount: invoice.totalAmount, status: 'PAID' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: originalPayment.id } })).toMatchObject({ amount: originalPayment.amount, reference: 'ORIGINAL' });
    await expect(renewals.getCustomerRenewal(otherCustomerId, first.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-active rentals and foreign contracts while supporting separate end dates', async () => {
    const inactive = await activeRental({ contractStatus: 'READY_FOR_HANDOVER' });
    await expect(request(inactive.reservation.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(renewals.createCustomerRenewal(otherCustomerId, { reservationId: inactive.reservation.id, termMonths: 3, paymentPlan: 'PREPAID' }, `foreign-${runId}`)).rejects.toBeInstanceOf(NotFoundException);

    await prisma.payment.deleteMany({ where: { invoice: { reservationId: inactive.reservation.id } } });
    await prisma.invoice.deleteMany({ where: { reservationId: inactive.reservation.id } });
    await prisma.rentalContract.deleteMany({ where: { reservationId: inactive.reservation.id } });
    await prisma.reservationUnit.deleteMany({ where: { reservationId: inactive.reservation.id } });
    await prisma.reservation.delete({ where: { id: inactive.reservation.id } });
    const inconsistent = await activeRental({ quantity: 2 });
    const [contract] = inconsistent.contracts;
    await prisma.rentalContract.update({ where: { id: contract.id }, data: { endDate: new Date('2027-05-11T00:00:00.000Z') } });
    await prisma.reservationUnit.update({ where: { id: contract.reservationUnitId }, data: { plannedEndDate: new Date('2027-05-11T00:00:00.000Z') } });
    await expect(request(inconsistent.reservation.id, 3, 'PREPAID', undefined, contract.id)).resolves.toMatchObject({ previousEndDate: '2027-05-11' });
    const foreign = await activeRental({ customer: otherCustomerId });
    await expect(request(inconsistent.reservation.id, 3, 'PREPAID', undefined, foreign.contracts[0].id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [3, 'PREPAID', 5], [6, 'PREPAID', 10], [12, 'PREPAID', 15], [4, 'PREPAID', 0], [3, 'PAY_MONTHLY', 0],
  ] as const)('applies centralized renewal discount for %s months %s', async (months, plan, percent) => {
    const { reservation } = await activeRental();
    const created = await request(reservation.id, months, plan);
    expect(created.quoteSnapshot).toMatchObject({ termMonths: months, paymentPlan: plan, discountPercent: percent, depositAmount: 0 });
  });

  it('detects future allocations both at request time and again at approval time', async () => {
    const first = await activeRental();
    await addFutureConflict(first.reservation.id, first.units[0].id);
    await expect(request(first.reservation.id)).rejects.toMatchObject({ response: { code: 'RENEWAL_ALLOCATION_CONFLICT' } });

    await prisma.rentalContract.deleteMany({ where: { reservationId: { not: first.reservation.id }, reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservationId: { not: first.reservation.id }, reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId, id: { not: first.reservation.id } } });
    const pending = await request(first.reservation.id);
    await resetRenewalToPending(pending.id);
    await addFutureConflict(first.reservation.id, first.units[0].id);
    await expect(renewals.approve(pending.id, manager)).rejects.toMatchObject({ response: { code: 'RENEWAL_ALLOCATION_CONFLICT' } });
    expect((await prisma.renewalRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING');
  });

  it('processes a confirmed VNPay renewal once and reconciles a conflicting unit without changing either ledger', async () => {
    const { reservation, units, contracts: [a, b] } = await activeRental({ quantity: 2 });
    const first = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    const second = await request(reservation.id, 3, 'PREPAID', undefined, b.id);
    await prisma.renewalRequest.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customerId },
    });
    await addFutureConflict(reservation.id, units[0].id);
    const payments = new OnlinePaymentService(prisma, billing, {
      verify: (query: { orderRef: string; amountMinor: bigint }) => ({
        ...query, responseCode: '00', transactionStatus: '00', providerTransactionId: query.orderRef, bankCode: 'VNPAYQR',
      }),
    } as unknown as VnpayService);
    async function createCallback(renewal: typeof first) {
      const invoice = renewal.invoices[0];
      const transaction = await prisma.onlinePaymentTransaction.create({ data: {
        invoiceId: invoice.id, customerUserId: customerId, amount: BigInt(invoice.balanceDue),
        merchantOrderRef: randomUUID(), idempotencyKey: randomUUID(),
      } });
      return { invoice, transaction, payload: { orderRef: transaction.merchantOrderRef, amountMinor: transaction.amount * 100n } };
    }
    const successful = await createCallback(second);
    await expect(payments.processIpn(successful.payload)).resolves.toMatchObject({ RspCode: '00' });
    await expect(payments.processIpn(successful.payload)).resolves.toMatchObject({ RspCode: '00' });
    expect(await prisma.payment.count({ where: { invoiceId: successful.invoice.id } })).toBe(1);

    const conflicted = await createCallback(first);
    await expect(payments.processIpn(conflicted.payload)).resolves.toEqual({ RspCode: '00', Message: 'Confirm Success - reconciliation required' });
    await expect(payments.processIpn(conflicted.payload)).resolves.toMatchObject({ RspCode: '02' });
    expect(await prisma.onlinePaymentReconciliation.count({ where: { onlinePaymentTransactionId: conflicted.transaction.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { invoiceId: conflicted.invoice.id } })).toBe(0);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: conflicted.invoice.id } })).toMatchObject({ status: 'OPEN', amountPaid: 0n });
    expect((await prisma.rentalContract.findUniqueOrThrow({ where: { id: a.id } })).endDate).toEqual(a.endDate);
    expect((await prisma.rentalContract.findUniqueOrThrow({ where: { id: b.id } })).endDate.toISOString().slice(0, 10)).toBe(second.requestedEndDate);
  });

  it('makes PENDING non-blocking, APPROVED_PENDING_PAYMENT blocking, and REJECTED non-blocking', async () => {
    const { reservation, units } = await activeRental();
    const pending = await request(reservation.id);
    await resetRenewalToPending(pending.id);
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'MAINTENANCE' } });
    await prisma.storageUnit.update({ where: { id: units[0].id }, data: { status: 'AVAILABLE' } });
    const draft = { productId: storageTypeId, startDate: '2027-05-10', periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' };
    expect((await booking.checkAvailability(draft)).available).toBe(true);
    await prisma.storageUnit.update({ where: { id: units[0].id }, data: { status: 'OCCUPIED' } });
    await renewals.approve(pending.id, manager);
    await prisma.storageUnit.update({ where: { id: units[0].id }, data: { status: 'AVAILABLE' } });
    expect((await booking.checkAvailability(draft)).available).toBe(false);

    await prisma.invoice.deleteMany({ where: { renewalRequestId: pending.id } });
    await prisma.renewalRequest.update({ where: { id: pending.id }, data: { status: 'REJECTED', activeKey: null } });
    expect((await booking.checkAvailability(draft)).available).toBe(true);
  });

  it('approves PREPAID idempotently and creates one discounted invoice without deposit', async () => {
    const { reservation, units, contracts: [a, b] } = await activeRental({ quantity: 2 });
    const pending = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    await resetRenewalToPending(pending.id);
    const approved = await renewals.approve(pending.id, manager);
    const retry = await renewals.approve(pending.id, manager);
    expect(approved.status).toBe('APPROVED_PENDING_PAYMENT');
    expect(retry.invoices).toHaveLength(1);
    expect(retry.invoices[0]).toMatchObject({ type: 'RENEWAL', renewalCycle: 1, rentalAmount: 8835000, depositAmount: 0, totalAmount: 8835000, status: 'OPEN' });
    expect(approved.contracts.map(contract => contract.id)).toEqual([a.id]);
    expect((await renewals.listManagerRenewals({ page: 1, limit: 5, search: units[0].unitNumber })).total).toBe(1);
    expect((await renewals.listManagerRenewals({ page: 1, limit: 5, search: units[1].unitNumber })).total).toBe(0);
    expect((await renewals.listManagerRenewals({ page: 1, limit: 5, search: b.contractCode })).total).toBe(0);
    expect(await prisma.invoice.count({ where: { renewalRequestId: pending.id } })).toBe(1);
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, endDate: new Date('2027-05-10T00:00:00.000Z') } })).toBe(2);
  });

  it('creates PAY_MONTHLY calendar periods and completes extension after the first renewal invoice is paid', async () => {
    const { reservation, units, contracts: [a, b] } = await activeRental({ quantity: 2 });
    const pending = await request(reservation.id, 3, 'PAY_MONTHLY', undefined, a.id);
    const approved = await renewals.approve(pending.id, manager);
    expect(approved.invoices.map((invoice: any) => [invoice.renewalCycle, invoice.billingPeriodStart, invoice.billingPeriodEnd, invoice.dueAt, invoice.totalAmount, invoice.depositAmount])).toEqual([
      [1, '2027-05-10', '2027-06-10', '2027-05-10', 3100000, 0],
    ]);
    const contractCount = await prisma.rentalContract.count({ where: { reservationId: reservation.id } });
    const allocationCount = await prisma.reservationUnit.count({ where: { reservationId: reservation.id } });
    const firstInvoice = approved.invoices[0];
    await prisma.renewalRequest.update({ where: { id: pending.id }, data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customerId } });
    await billing.recordPayment(firstInvoice.id, { amount: 2000000, method: 'BANK_TRANSFER', reference: `renew-partial-ref-${runId}` }, `renew-partial-${runId}`, manager);
    expect((await prisma.renewalRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('APPROVED_PENDING_PAYMENT');
    await expect(prisma.rentalContract.findUnique({ where: { id: a.id } })).resolves.toMatchObject({ endDate: a.endDate });
    await billing.recordPayment(firstInvoice.id, { amount: 1100000, method: 'BANK_TRANSFER', reference: `renew-final-ref-${runId}` }, `renew-final-${runId}`, manager);
    expect((await prisma.renewalRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('COMPLETED');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE', endDate: new Date('2027-08-10T00:00:00.000Z') } })).toBe(1);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id, plannedEndDate: new Date('2027-08-10T00:00:00.000Z') } })).toBe(1);
    await expect(prisma.rentalContract.findUnique({ where: { id: b.id } })).resolves.toMatchObject({ endDate: b.endDate });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).endDate.toISOString().slice(0, 10)).toBe('2027-08-10');
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id } })).toBe(contractCount);
    expect(await prisma.reservationUnit.count({ where: { reservationId: reservation.id } })).toBe(allocationCount);
    expect(await prisma.storageUnit.count({ where: { id: { in: units.map((unit) => unit.id) }, status: 'OCCUPIED' } })).toBe(2);
    const view = await activeRentals.getCustomerRental(customerId, reservation.id);
    expect(view.endDate).toBe('2027-08-10');
    expect(view.renewalHistory[0]).toMatchObject({ status: 'COMPLETED', requestedEndDate: '2027-08-10' });
    const invoices = () => prisma.invoice.findMany({ where: { renewalRequestId: pending.id }, orderBy: { renewalCycle: 'asc' } });
    await renewals.issueDueInvoices(new Date('2027-06-09T16:59:59.000Z'), pending.id);
    expect(await invoices()).toHaveLength(1);
    await renewals.issueDueInvoices(new Date('2027-06-10T00:00:00.000Z'), pending.id);
    await renewals.issueDueInvoices(new Date('2027-06-10T00:00:00.000Z'), pending.id);
    expect(await invoices()).toMatchObject([
      { renewalCycle: 1, status: 'PAID' },
      { renewalCycle: 2, dueAt: new Date('2027-06-10T00:00:00.000Z'), totalAmount: 3100000n, status: 'OPEN', pricingSnapshot: { breakdown: { units: [{ contractId: a.id }] } } },
    ]);
    await renewals.issueDueInvoices(new Date('2027-07-10T00:00:00.000Z'), pending.id);
    expect(await invoices()).toHaveLength(3);
  });

  it('continues a historical whole-order PREPAID request and safely ignores completion retries', async () => {
    const { reservation } = await activeRental({ quantity: 3 });
    const pending = await prisma.renewalRequest.create({ data: {
      reservationId: reservation.id, renewalCode: 'OLD-RENEWAL-' + runId, requestedByUserId: customerId,
      activeKey: reservation.id, idempotencyKey: 'old-renewal-key-' + runId, termMonths: 3, paymentPlan: 'PREPAID',
      previousEndDate: reservation.endDate, requestedEndDate: new Date('2027-08-10T00:00:00Z'),
      quoteSnapshot: { currency: 'VND', storageTypeId, storageTypeName: 'Renewal product', quantity: 3, previousEndDate: '2027-05-10',
        requestedEndDate: '2027-08-10', termMonths: 3, paymentPlan: 'PREPAID', monthlyUnitPrice: 3100000, baseRentalAmount: 27900000,
        discountAmount: 1395000, discountPercent: 5, rentalAmount: 26505000, depositAmount: 0, totalAmount: 26505000 },
    } });
    const approved = await renewals.approve(pending.id, manager);
    const invoice = approved.invoices[0];
    await prisma.renewalRequest.update({ where: { id: pending.id }, data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customerId } });
    await billing.recordPayment(invoice.id, { amount: 1000000, method: 'CASH' }, `prepaid-part-${runId}`, manager);
    expect((await prisma.renewalRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('APPROVED_PENDING_PAYMENT');
    await billing.recordPayment(invoice.id, { amount: invoice.balanceDue - 1000000, method: 'BANK_TRANSFER', reference: `prepaid-full-ref-${runId}` }, `prepaid-full-${runId}`, manager);
    await prisma.$transaction((tx) => renewals.completeAfterPayment(tx, pending.id));
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE', endDate: new Date('2027-08-10T00:00:00.000Z') } })).toBe(3);
    expect(await prisma.storageUnit.count({ where: { reservationUnits: { some: { reservationId: reservation.id } }, status: 'OCCUPIED' } })).toBe(3);
  });

  it('supports rejection, ownership-safe reads, manager search and role authorization', async () => {
    const { reservation } = await activeRental();
    const pending = await request(reservation.id);
    await resetRenewalToPending(pending.id);
    await expect(renewals.reject(pending.id, { reason: 'No' }, manager)).rejects.toThrow();
    const rejected = await renewals.reject(pending.id, { reason: 'Customer requested a different date.' }, manager);
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Customer requested a different date.' });
    expect((await renewals.listCustomerRenewals(customerId, 1, 20)).total).toBe(1);
    expect((await renewals.listManagerRenewals({ page: 1, limit: 20, search: 'Renewal Customer', status: 'REJECTED' })).total).toBe(1);
    expect(JSON.stringify(await renewals.getManagerRenewal(pending.id))).not.toContain('secret-hash');
    await expect(renewals.approve(pending.id, staff)).rejects.toBeInstanceOf(ForbiddenException);

    const guard = new RolesGuard(new Reflector());
    const matrix: Array<[typeof CustomerRenewalsController | typeof ManagerRenewalsController, PublicUser['role'][]]> = [
      [CustomerRenewalsController, ['CUSTOMER']], [ManagerRenewalsController, ['MANAGER']],
    ];
    for (const [controller, roles] of matrix) for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] as const) {
      const context = { getHandler: () => function renewalOperation() {}, getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) } as unknown as ExecutionContext;
      if (roles.includes(role)) expect(guard.canActivate(context)).toBe(true); else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });

  it('keeps separate open requests for A and B and rejects concurrent duplicates', async () => {
    const { reservation, contracts: [a, b] } = await activeRental({ quantity: 2 });
    const [one, two, three] = await Promise.allSettled([
      request(reservation.id, 3, 'PREPAID', undefined, a.id),
      request(reservation.id, 3, 'PREPAID', undefined, a.id),
      request(reservation.id, 3, 'PREPAID', undefined, b.id),
    ]);
    expect([one, two].filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect([one, two].find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(three).toMatchObject({ status: 'fulfilled', value: { rentalContractId: b.id } });
    const view = await activeRentals.getCustomerRental(customerId, reservation.id);
    expect(view.contracts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: a.id, pendingRenewal: expect.any(Object) }),
      expect.objectContaining({ id: b.id, pendingRenewal: expect.any(Object) }),
    ]));
  });

  it('activates A twice from its own latest date, then activates B independently', async () => {
    const { reservation, contracts: [a, b], invoice: shared } = await activeRental({ quantity: 2 });
    const first = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    await expect(billing.recordPayment(first.invoices[0].id, { amount: first.invoices[0].balanceDue, method: 'CASH' }, 'unsigned-' + runId, manager)).rejects.toThrow();
    const key = 'paid-once-' + runId;
    await acceptAndPay(first, key);
    await billing.recordPayment(first.invoices[0].id, { amount: first.invoices[0].balanceDue, method: 'CASH' }, key, manager);
    await expect(prisma.payment.count({ where: { invoiceId: first.invoices[0].id } })).resolves.toBe(1);
    await expect(prisma.rentalContract.findUnique({ where: { id: b.id } })).resolves.toMatchObject({ endDate: b.endDate });

    const second = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    const other = await request(reservation.id, 1, 'PREPAID', undefined, b.id);
    expect(second.previousEndDate).toBe(first.requestedEndDate);
    expect(other.previousEndDate).toBe('2027-05-10');
    await acceptAndPay(second);
    await acceptAndPay(other);
    await expect(prisma.reservation.findUnique({ where: { id: reservation.id } })).resolves.toMatchObject({ endDate: new Date(second.requestedEndDate) });
    await expect(prisma.reservationUnit.findUnique({ where: { id: b.reservationUnitId } })).resolves.toMatchObject({ plannedEndDate: new Date(other.requestedEndDate) });
    await expect(prisma.invoice.findUnique({ where: { id: shared.id } })).resolves.toEqual(shared);
    await expect(prisma.invoice.count({ where: { reservationId: reservation.id, type: 'RENEWAL', depositAmount: { not: 0 } } })).resolves.toBe(0);
  });

  it('returns B while A renews and keeps the return and renewal scoped after payment', async () => {
    const { reservation, contracts: [a, b], invoice: shared } = await activeRental({ quantity: 2, endDate: '2026-11-18' });
    const returns = new ReturnsService(prisma);
    const customer = actor(customerId, 'CUSTOMER');
    const pending = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    await expect(returns.createCustomerReturn(customer, { reservationId: reservation.id, rentalContractId: a.id }, 'renew-return-a-' + runId))
      .rejects.toMatchObject({ response: { code: 'UNRESOLVED_RENEWAL_EXISTS' } });
    const returning = await returns.createCustomerReturn(customer, { reservationId: reservation.id, rentalContractId: b.id }, 'renew-return-b-' + runId);
    await expect(request(reservation.id, 3, 'PREPAID', undefined, b.id)).rejects.toMatchObject({ response: { code: 'RENEWAL_RETURN_IN_PROGRESS' } });
    await returns.assign(returning.id, { staffUserId: staff.id }, manager);
    const inspected = await returns.startInspection(returning.id, staff);
    await returns.updateInspection(returning.id, inspected.inspections[0].id, { result: 'PASS' }, staff);
    await returns.finalize(returning.id, staff);
    await acceptAndPay(pending);
    await expect(prisma.rentalContract.findUnique({ where: { id: b.id } })).resolves.toMatchObject({ status: 'COMPLETED', endDate: b.endDate });
    await expect(prisma.depositSettlement.findUnique({ where: { returnRequestId: returning.id } })).resolves.toMatchObject({ depositAmount: 2900000n });
    await expect(prisma.invoice.findUnique({ where: { id: shared.id } })).resolves.toEqual(shared);
    const again = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    expect(again.previousEndDate).toBe(pending.requestedEndDate);
  });

  it('rolls back payments and contract dates when the in-transaction allocation update fails', async () => {
    const { reservation, contracts: [a, b] } = await activeRental({ quantity: 2 });
    const pending = await request(reservation.id, 3, 'PREPAID', undefined, a.id);
    await prisma.renewalRequest.update({ where: { id: pending.id }, data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customerId } });
    const invoice = pending.invoices[0];
    await expect(prisma.$transaction(tx => {
      const failing = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== 'reservationUnit') return Reflect.get(target, property, receiver);
          return new Proxy(target.reservationUnit, { get(delegate, method, context) {
            if (method !== 'updateMany') return Reflect.get(delegate, method, context);
            return async () => {
              expect((await tx.rentalContract.findUniqueOrThrow({ where: { id: a.id } })).endDate).toEqual(new Date(pending.requestedEndDate));
              return { count: 0 };
            };
          } });
        },
      });
      return billing.recordPayment(invoice.id, { amount: invoice.balanceDue, method: 'CASH' }, 'failed-renewal-' + runId, manager, failing);
    })).rejects.toThrow('Phân bổ kho cần gia hạn vừa thay đổi.');
    await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({ status: 'OPEN', amountPaid: 0n });
    await expect(prisma.payment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(0);
    for (const contract of [a, b]) {
      await expect(prisma.rentalContract.findUnique({ where: { id: contract.id } })).resolves.toMatchObject({ endDate: contract.endDate });
      await expect(prisma.reservationUnit.findUnique({ where: { id: contract.reservationUnitId } })).resolves.toMatchObject({ plannedEndDate: contract.endDate });
    }
  });
});
