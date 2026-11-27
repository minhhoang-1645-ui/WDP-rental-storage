import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { PayosPaymentService } from '../src/modules/billing/payos-payment.service.js';
import { OnlinePaymentService } from '../src/modules/billing/online-payment.service.js';
import { ReportingService } from '../src/modules/manager/reporting.service.js';
import type { PublicUser } from '../src/modules/auth/auth.types.js';

const isolated = process.env.NESTBOX_ISOLATED_TEST === '1';
const local = 'postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if (isolated && (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local)) throw new Error('Disposable payOS database required.');
let db: PrismaService | undefined;
afterAll(async () => db?.$disconnect());

it.runIf(isolated)('hạch toán payOS một lần trên PostgreSQL khi webhook tranh chấp với đồng bộ, giữ riêng tiền thiếu, thừa và đến muộn', async () => {
  const client = db = new PrismaService();
  const prefix = randomUUID().slice(0, 8);
  const createUser = (name: string) => client.user.create({
    data: { fullName: name, email: prefix + name + '@example.test', role: 'STORAGE_CUSTOMER', passwordHash: 'fixture-disabled' },
  });
  const [person, outsider] = await Promise.all([createUser('customer'), createUser('outsider')]);
  const actor = { id: person.id, role: person.role } as PublicUser;
  const site = await client.facility.create({ data: { code: prefix, name: 'Fixture', address: 'Fixture' } });
  const type = await client.storageType.create({ data: {
    id: prefix, code: prefix, facilityId: site.id, name: 'Fixture', sizeId: 'small', sizeName: 'Small', kicker: 'Fixture', condition: 'STANDARD',
    widthCm: 100, lengthCm: 100, heightCm: 100, roomEquivalent: 'Fixture', capacity: 'Fixture', boxCount: 'Fixture',
    suitableItems: [], image: '', imageAlt: '', floor: '', access: '', features: [],
  } });
  const invoice = async (status: 'OPEN' | 'VOID' = 'OPEN', initial = false) => {
    const reservation = await client.reservation.create({ data: {
      reservationCode: randomUUID(), idempotencyKey: randomUUID(), facilityId: site.id, customerId: person.id, storageTypeId: type.id,
      status: 'CONFIRMED', quantity: 1, startDate: new Date(), endDate: new Date(Date.now() + 86400000), periodMode: 'DURATION',
      quoteSnapshot: {}, availabilitySnapshot: {},
    } });
    if (initial) {
      const unit = await client.storageUnit.create({ data: { unitNumber: randomUUID(), storageTypeId: type.id, status: 'RESERVED' } });
      const allocation = await client.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id,
        plannedStartDate: reservation.startDate, plannedEndDate: reservation.endDate } });
      await client.rentalContract.create({ data: { contractCode: randomUUID(), reservationId: reservation.id, reservationUnitId: allocation.id,
        startDate: reservation.startDate, endDate: reservation.endDate, termsAcceptedAt: new Date() } });
      await client.reservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.now() + 120_000) } });
    }
    return client.invoice.create({ data: { invoiceCode: randomUUID(), reservationId: reservation.id,
      type: initial ? 'INITIAL' : 'RECURRING', billingCycle: initial ? 1 : 2,
      status, rentalAmount: 100_000n, depositAmount: 0n, totalAmount: 100_000n, balanceDue: status === 'VOID' ? 0n : 100_000n } });
  };
  const linkId = randomUUID().replaceAll('-', '');
  const checkoutUrl = 'https://pay.payos.vn/web/' + linkId;
  const provider = {
    assertConfigured: vi.fn(),
    create: vi.fn(async (orderCode: number, amount: number) => ({ orderCode, amount, paymentLinkId: linkId, checkoutUrl, currency: 'VND' })),
    get: vi.fn(),
    cancel: vi.fn(),
    verify: vi.fn(async (body: { data: object }) => body.data),
  };
  const billing = new BillingService(client);
  const service = new PayosPaymentService(client, provider as never, billing);
  const open = await invoice();
  const closed = await invoice('VOID');
  await expect(service.create(open.id, randomUUID(), { ...actor, id: outsider.id }, false)).rejects.toThrow('thuộc tài khoản');
  await expect(service.create(closed.id, randomUUID(), actor, false)).rejects.toThrow();
  expect(provider.create).not.toHaveBeenCalled();
  const first = await service.create(open.id, randomUUID(), actor, false);
  const retry = await service.create(open.id, randomUUID(), actor, false);
  expect(retry.transactionId).toBe(first.transactionId);
  expect(provider.create).toHaveBeenCalledOnce();
  expect(provider.create.mock.calls[0][1]).toBe(100_000);
  const orderCode = Number(first.merchantOrderRef);
  const bank = (suffix: string, amount: number) => ({ orderCode, amount, code: '00', currency: 'VND',
    paymentLinkId: linkId, reference: prefix + '-' + suffix, transactionDateTime: new Date().toISOString() });
  const webhook = (data: ReturnType<typeof bank>) => service.webhook({ code: '00', success: true, data } as never);
  const exact = bank('exact', 100_000);
  provider.get.mockResolvedValue({ id: linkId, orderCode, amount: 100_000, status: 'PAID', transactions: [exact] });
  await Promise.all([webhook(exact), webhook(exact), service.sync(first.transactionId)]);
  await Promise.all([webhook(bank('under', 500)), webhook(bank('over', 120_000)), webhook(bank('late', 100_000))]);
  expect(await client.payment.findMany({ where: { invoiceId: open.id } })).toMatchObject([{ method: 'PAYOS', amount: 100_000n, reference: exact.reference }]);
  expect(await client.invoice.findUnique({ where: { id: open.id } })).toMatchObject({ status: 'PAID', balanceDue: 0n });
  expect(await client.payosReceipt.count({ where: { transactionId: first.transactionId } })).toBe(4);
  expect(await client.onlinePaymentReconciliation.count({ where: { payosReceipt: { transactionId: first.transactionId } } })).toBe(3);
  const unknown = { ...bank('unknown', 1_000), orderCode: orderCode + 1 };
  await webhook(unknown);
  expect(await client.payosReceipt.findUnique({ where: { reference: unknown.reference } })).toMatchObject({ transactionId: null, amount: 1_000n });
  const timeoutInvoice = await invoice();
  const timeoutKey = randomUUID();
  const recoveryLink = randomUUID().replaceAll('-', '');
  provider.create.mockRejectedValueOnce(new Error('fixture timeout after provider accepts request'));
  await expect(service.create(timeoutInvoice.id, timeoutKey, actor, true)).rejects.toThrow('fixture timeout');
  const reserved = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { idempotencyKey: timeoutKey } });
  provider.get.mockResolvedValue({ id: recoveryLink, orderCode: Number(reserved.payosOrderCode),
    amount: 100_000, status: 'PENDING', transactions: [] });
  await expect(service.create(timeoutInvoice.id, timeoutKey, actor, true)).resolves.toMatchObject({ transactionId: reserved.id,
    checkoutUrl: 'https://pay.payos.vn/web/' + recoveryLink });
  expect(provider.create).toHaveBeenCalledTimes(2);
  const voidTime = new Date();
  await client.invoice.update({ where: { id: timeoutInvoice.id }, data: { status: 'VOID', balanceDue: 0n } });
  const late = { ...bank('void', 100_000), orderCode: Number(reserved.payosOrderCode), paymentLinkId: recoveryLink,
    transactionDateTime: voidTime.toISOString() };
  provider.cancel.mockResolvedValue({ id: recoveryLink, orderCode: late.orderCode, amount: 100_000,
    status: 'CANCELLED', transactions: [late] });
  await service.sync(reserved.id);
  expect(provider.cancel).toHaveBeenCalledWith(late.orderCode);
  expect(await client.payment.count({ where: { invoiceId: timeoutInvoice.id } })).toBe(0);
  expect(await client.onlinePaymentReconciliation.count({ where: { payosReceipt: { transactionId: reserved.id } } })).toBe(1);
  const manager = await client.user.create({ data: { fullName: 'Fixture Manager', email: prefix + 'manager@example.test',
    role: 'FACILITY_MANAGER', passwordHash: 'fixture-disabled' } });
  const bom = await client.user.create({ data: { fullName: 'Fixture BOM', email: prefix + 'bom@example.test',
    role: 'BUSINESS_OPERATIONS_MANAGER', passwordHash: 'fixture-disabled' } });
  await client.facilityAccess.create({ data: { userId: manager.id, facilityId: site.id, grantedById: bom.id, activeKey: manager.id } });
  const managerActor = { id: manager.id, role: manager.role } as PublicUser;
  const online = new OnlinePaymentService(client, billing, {} as never);
  const ownExceptions = await online.listManagerReconciliations(1, 20, undefined, managerActor);
  expect(ownExceptions.total).toBe(4);
  expect(ownExceptions.items.every(item => item.source === 'PAYOS')).toBe(true);
  const outsideSite = await client.facility.create({ data: { code: prefix + '-out', name: 'Outside', address: 'Fixture' } });
  const outsideManager = await client.user.create({ data: { fullName: 'Outside Manager', email: prefix + 'outside@example.test',
    role: 'FACILITY_MANAGER', passwordHash: 'fixture-disabled' } });
  await client.facilityAccess.create({ data: { userId: outsideManager.id, facilityId: outsideSite.id, grantedById: bom.id, activeKey: outsideManager.id } });
  const outsideActor = { id: outsideManager.id, role: outsideManager.role } as PublicUser;
  expect((await online.listManagerReconciliations(1, 20, undefined, outsideActor)).total).toBe(0);
  await expect(online.resolveReconciliation(ownExceptions.items[0].id, { resolution: 'REFUND_REQUIRED', resolutionNote: 'Fixture only' },
    outsideActor)).rejects.toMatchObject({ status: 403 });
  const exceptionId = ownExceptions.items[0].id;
  await online.resolveReconciliation(exceptionId, { resolution: 'REFUND_REQUIRED', resolutionNote: 'Fixture only' }, managerActor);
  const refundEvidence = { resolution: 'RECONCILED', resolutionNote: 'Fixture hoàn tiền', refundReference: 'fixture-ref' };
  await expect(online.resolveReconciliation(exceptionId, refundEvidence, managerActor)).rejects.toMatchObject({ status: 400 });
  await expect(online.resolveReconciliation(exceptionId, { ...refundEvidence, refundConfirmed: true, refundMethod: 'BANK_TRANSFER' },
    managerActor)).resolves.toMatchObject({ status: 'RECONCILED', resolutionNote: expect.stringContaining('fixture-ref') });
  const report = await new ReportingService(client).summary({ facilityId: site.id, group: 'day' }, { id: bom.id, role: bom.role } as PublicUser);
  expect(report.times.reduce((sum, bucket) => sum + bucket.received, 0)).toBe(100_000);
  const cashInvoice = await invoice();
  const cash = await billing.recordPayment(cashInvoice.id, { amount: 100_000, method: 'CASH' }, randomUUID(), managerActor);
  expect(cash.payment).toMatchObject({ method: 'CASH', amount: 100_000 });
  expect((await billing.listManagerPayments({ page: 1, limit: 20 }, managerActor)).summary)
    .toEqual({ total: '200000', online: '100000', transfer: '0', cash: '100000' });
  provider.create.mockImplementation(async (code, amount) => {
    const id = randomUUID().replaceAll('-', '');
    return { orderCode: code, amount, paymentLinkId: id, checkoutUrl: 'https://pay.payos.vn/web/' + id, currency: 'VND' };
  });
  const initial = await invoice('OPEN', true);
  const initialSession = await service.create(initial.id, randomUUID(), actor, true);
  const initialRecord = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { id: initialSession.transactionId } });
  const initialBank = { ...bank('initial', 100_000), orderCode: Number(initialRecord.payosOrderCode), paymentLinkId: initialRecord.payosLinkId! };
  await webhook(initialBank);
  expect(await client.rentalContract.findFirst({ where: { reservationId: initial.reservationId } })).toMatchObject({ status: 'READY_FOR_HANDOVER' });
  const contract = await client.rentalContract.findFirstOrThrow({ where: { reservationId: initial.reservationId },
    include: { reservationUnit: { include: { storageUnit: true } } } });
  await client.rentalContract.update({ where: { id: contract.id }, data: { status: 'ACTIVE' } });
  await client.storageUnit.update({ where: { id: contract.reservationUnit.storageUnitId }, data: { status: 'OCCUPIED' } });
  await client.reservation.update({ where: { id: initial.reservationId }, data: { quoteSnapshot: { billingMode: 'MONTHLY' } } });
  const requestedEndDate = new Date(+contract.endDate + 31 * 86_400_000);
  const previousEndDate = contract.endDate.toISOString().slice(0, 10);
  const renewal = await client.renewalRequest.create({ data: { renewalCode: randomUUID(), reservationId: initial.reservationId,
    rentalContractId: contract.id, status: 'APPROVED_PENDING_PAYMENT', previousEndDate: contract.endDate, requestedEndDate,
    termMonths: 1, paymentPlan: 'PREPAID', requestedByUserId: person.id, idempotencyKey: randomUUID(), quoteSnapshot: {
      currency: 'VND', storageTypeId: type.id, quantity: 1, previousEndDate, renewalStartDate: previousEndDate,
      requestedEndDate: requestedEndDate.toISOString().slice(0, 10), termMonths: 1, paymentPlan: 'PREPAID',
      monthlyUnitPrice: 100_000, baseRentalAmount: 100_000, discountPercent: 0, discountAmount: 0,
      rentalAmount: 100_000, totalAmount: 100_000, depositAmount: 0, scope: {
        reservationId: initial.reservationId, rentalContractId: contract.id, contractCode: contract.contractCode,
        reservationUnitId: contract.reservationUnitId, storageUnitId: contract.reservationUnit.storageUnitId,
        unitCode: contract.reservationUnit.storageUnit.unitNumber,
      },
    } } });
  const renewalInvoice = await client.invoice.create({ data: { invoiceCode: randomUUID(), reservationId: initial.reservationId,
    renewalRequestId: renewal.id, type: 'RENEWAL', billingCycle: null, renewalCycle: 1,
    rentalAmount: 100_000n, depositAmount: 0n, totalAmount: 100_000n, balanceDue: 100_000n } });
  await expect(service.create(renewalInvoice.id, randomUUID(), actor, false)).rejects.toThrow('phụ lục');
  await client.renewalRequest.update({ where: { id: renewal.id }, data: { appendixAcceptedAt: new Date() } });
  const renewalSession = await service.create(renewalInvoice.id, randomUUID(), actor, false);
  const renewalRecord = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { id: renewalSession.transactionId } });
  await webhook({ ...bank('renewal', 100_000), orderCode: Number(renewalRecord.payosOrderCode), paymentLinkId: renewalRecord.payosLinkId! });
  expect(await client.renewalRequest.findUnique({ where: { id: renewal.id } })).toMatchObject({ status: 'COMPLETED' });
  const matchingPayments = await billing.listManagerPayments({ page: 1, limit: 20, search: contract.reservationUnit.storageUnit.unitNumber }, managerActor);
  expect(matchingPayments.items).toEqual(expect.arrayContaining([expect.objectContaining({
    method: 'PAYOS', unitCode: contract.reservationUnit.storageUnit.unitNumber,
  })]));
  const expiredInitial = await invoice('OPEN', true);
  const expiredSession = await service.create(expiredInitial.id, randomUUID(), actor, true);
  const expiredRecord = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { id: expiredSession.transactionId } });
  await client.reservation.update({ where: { id: expiredInitial.reservationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await webhook({ ...bank('hold-expired', 100_000), orderCode: Number(expiredRecord.payosOrderCode), paymentLinkId: expiredRecord.payosLinkId! });
  expect(await client.rentalContract.findFirst({ where: { reservationId: expiredInitial.reservationId } })).toMatchObject({ status: 'PENDING_PAYMENT' });
  const cashRace = await invoice();
  const cashSession = await service.create(cashRace.id, randomUUID(), actor, false);
  const cashRecord = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { id: cashSession.transactionId } });
  vi.stubEnv('PAYOS_CUTOVER', 'true');
  try {
    await expect(billing.recordPayment(cashRace.id, { amount: 100_000, method: 'CASH' }, randomUUID(), managerActor))
      .rejects.toThrow('phiên payOS đang hoạt động');
    await client.onlinePaymentTransaction.update({ where: { id: cashRecord.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await billing.recordPayment(cashRace.id, { amount: 100_000, method: 'CASH' }, randomUUID(), managerActor);
    await webhook({ ...bank('cash-race', 100_000), orderCode: Number(cashRecord.payosOrderCode), paymentLinkId: cashRecord.payosLinkId! });
    expect(await client.payment.findMany({ where: { invoiceId: cashRace.id } })).toMatchObject([{ method: 'CASH', amount: 100_000n }]);
    expect(await client.onlinePaymentReconciliation.count({ where: { payosReceipt: { transactionId: cashRecord.id } } })).toBe(1);

    for (const first of ['CASH', 'PAYOS'] as const) {
      const raceInvoice = await invoice('OPEN', true);
      const session = await service.create(raceInvoice.id, randomUUID(), actor, false);
      const persisted = await client.onlinePaymentTransaction.findUniqueOrThrow({ where: { id: session.transactionId } });
      // The bank received money before expiry, but its callback can arrive after cash becomes available.
      const expiry = new Date(Date.now() - 1000);
      await client.onlinePaymentTransaction.update({ where: { id: session.transactionId }, data: { expiresAt: expiry } });
      const event = { ...bank('race-' + first, 100_000), orderCode: Number(persisted.payosOrderCode),
        paymentLinkId: persisted.payosLinkId!, transactionDateTime: new Date(+expiry - 1000).toISOString() };
      const cashKey = randomUUID();
      const cashInput = { amount: 100_000, method: 'CASH' };
      const acquired = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const recordOnline = billing.recordVerifiedOnlinePayment.bind(billing);
      const pauseOnline = first === 'PAYOS' ? vi.spyOn(billing, 'recordVerifiedOnlinePayment').mockImplementationOnce(async (...args) => {
        const payment = await recordOnline(...args);
        acquired.resolve();
        await release.promise;
        return payment;
      }) : undefined;
      const winner = first === 'PAYOS' ? webhook(event) : client.$transaction(async tx => {
        const payment = await billing.recordPayment(raceInvoice.id, cashInput, cashKey, managerActor, tx);
        acquired.resolve();
        await release.promise;
        return payment;
      }, { isolationLevel: 'Serializable' });
      let loser: Promise<unknown> | undefined;
      try {
        await Promise.race([acquired.promise, winner]);
        loser = first === 'PAYOS' ? billing.recordPayment(raceInvoice.id, cashInput, cashKey, managerActor) : webhook(event);
        // Attach rejection handling now and prove the second connection is waiting on PostgreSQL's row lock.
        void loser.catch(() => undefined);
        await vi.waitFor(async () => {
          const [waiting] = await client.$queryRaw<{ locked: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
              AND wait_event_type = 'Lock' AND query LIKE '%FROM "Invoice"%' AND query LIKE '%FOR UPDATE%') AS locked
          `;
          expect(waiting.locked).toBe(true);
        }, { timeout: 3000, interval: 25 });
      } finally {
        release.resolve();
        pauseOnline?.mockRestore();
      }
      const outcomes = await Promise.allSettled([winner, loser!]);
      expect(outcomes[0].status).toBe('fulfilled');
      if (first === 'PAYOS') expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      else expect(outcomes[1].status).toBe('fulfilled');
      const payments = await client.payment.findMany({ where: { invoiceId: raceInvoice.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ method: first, amount: 100_000n });
      expect(await client.invoice.findUnique({ where: { id: raceInvoice.id } })).toMatchObject({ status: 'PAID', amountPaid: 100_000n, balanceDue: 0n });
      expect(await client.rentalContract.count({ where: { reservationId: raceInvoice.reservationId, status: 'READY_FOR_HANDOVER' } })).toBe(1);
      const receipt = await client.payosReceipt.findUniqueOrThrow({ where: { reference: event.reference }, include: { reconciliation: true } });
      expect(receipt).toMatchObject({ transactionId: session.transactionId, amount: 100_000n });
      if (first === 'CASH') expect(receipt.reconciliation).toMatchObject({ amount: 100_000n, status: 'PENDING_REVIEW' });
      else expect(receipt.reconciliation).toBeNull();
    }
  } finally {
    vi.unstubAllEnvs();
  }
}, 25_000);
