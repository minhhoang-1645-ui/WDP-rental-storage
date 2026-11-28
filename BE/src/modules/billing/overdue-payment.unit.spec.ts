import { describe, expect, it, vi } from 'vitest';
import { OverduePaymentWorker } from './overdue-payment.js';
import { datedPaymentOverdue, verifiedRentDebt } from './overdue-payment-rules.js';

const dueAt = new Date('2026-11-01T00:00:00Z');
const now = new Date('2026-11-07T00:00:00+07:00');
const pricingSnapshot = { pricingPolicy: { paymentOverdue: { version: 3,
  value: { graceDays: 5, managerDays: 15, feeMethod: 'RENT_DEBT_PERCENTAGE', feeAmount: 10 },
} } };
const depositAmount = 0n;
const invoice = { id: 'debt', invoiceCode: 'I01', reservationId: 'reservation', type: 'RECURRING', status: 'PARTIALLY_PAID',
  dueAt, rentalAmount: 1_000_000n, depositAmount, serviceAmount: 0n, chargeAmount: 0n, totalAmount: 1_000_000n, amountPaid: 400_000n,
  balanceDue: 600_000n, facilityIdSnapshot: 'original-site', storageTypeIdSnapshot: 'type', pricingSnapshot, currency: 'VND',
  reservation: { status: 'CONFIRMED' }, replacesInvoiceId: null,
};

describe('Overdue payment assessment', () => {
  it('uses the Vietnamese calendar and skips invoices without signed terms', () => {
    expect(datedPaymentOverdue(pricingSnapshot, dueAt, new Date(+now - 1))).toMatchObject({ overdueDays: 5, managerReviewOn: '2026-11-16' });
    expect(datedPaymentOverdue(pricingSnapshot, dueAt, now)).toMatchObject({ overdueDays: 6, version: 3 });
    expect(datedPaymentOverdue({}, dueAt, now)).toBeNull();
  });

  it('requires provable rent principal on invoices with partial payment', () => {
    expect(verifiedRentDebt(invoice)).toBe(600_000n);
    expect(verifiedRentDebt({ ...invoice, serviceAmount: 100_000n, totalAmount: 1_100_000n, balanceDue: 700_000n })).toBeNull();
    expect(verifiedRentDebt({ ...invoice, serviceAmount: 100_000n, totalAmount: 1_100_000n, amountPaid: 0n, balanceDue: 1_100_000n })).toBe(1_000_000n);
  });

  it('locks and rereads the source, defers pending payment, and creates one adjustment across retries', async () => {
    let saved: object | null = null;
    const tx = { $queryRaw: vi.fn(), invoice: {
      findUnique: vi.fn(async ({ where }) => where.id ? invoice : saved),
      create: vi.fn(async ({ data }) => { saved = data; return saved; }),
    }, paymentSubmission: { count: vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0) },
    onlinePaymentTransaction: { count: vi.fn().mockResolvedValue(0) }, payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: invoice.amountPaid } }) } };
    const prisma = { $transaction: (run: (db: typeof tx) => unknown) => run(tx), invoice: { findMany: vi.fn().mockResolvedValue([{ id: invoice.id }]) } };
    const worker = new OverduePaymentWorker(prisma as never);
    await worker.assess(new Date(+now - 1));
    await worker.assess(now);
    expect(tx.invoice.create).not.toHaveBeenCalled();
    await worker.assess(now);
    await worker.assess(now);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.invoice.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({
      invoiceCode: 'I01-LATE', type: 'SETTLEMENT', chargeAmount: 60_000n, balanceDue: 60_000n, facilityIdSnapshot: 'original-site',
      pricingSnapshot: expect.objectContaining({ policyVersion: 3, verifiedRentDebt: 600_000, sourceInvoiceId: invoice.id }),
    }) });
  });
});
