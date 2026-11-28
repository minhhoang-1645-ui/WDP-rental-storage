import { describe, expect, it, vi } from 'vitest';
import { invoiceBreakdown } from '../billing/invoice-breakdown.js';
import { baselinePricingPolicy } from '../policies/pricing-policy.js';
import { applyEarlyReturn, earlyReturnSettlementPending, hasStartedUnissuedRenewal, planEarlyReturn, summarizeEarlyReturn } from './return-period-closeout.js';

const day = (date: string) => new Date(date + 'T00:00:00Z');
const starts = ['2026-11-17', '2026-12-17', '2027-01-17', '2027-02-17', '2027-03-17', '2027-04-17', '2027-05-17'];
type Invoice = Parameters<typeof planEarlyReturn>[0][number];
const invoice = (cycle: number, paid = 0n, overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-' + cycle, reservationId: 'order', invoiceCode: 'I' + cycle, type: cycle === 1 ? 'INITIAL' : 'RECURRING',
  status: paid === 100n ? 'PAID' : paid ? 'PARTIALLY_PAID' : 'OPEN',
  rentalAmount: 100n, serviceAmount: 0n, chargeAmount: 0n, depositAmount: 0n, totalAmount: 100n, amountPaid: paid, balanceDue: 100n - paid,
  billingCycle: cycle, billingPeriodStart: day(starts[cycle - 1]), billingPeriodEnd: day(starts[cycle]),
  renewalRequestId: null, renewalCycle: null, renewalRequest: null, depositSettlement: null,
  dueAt: day(starts[cycle - 1]), storageTypeIdSnapshot: 'type', facilityIdSnapshot: null, currency: 'VND', pricingSnapshot: { paymentPlan: 'PAY_MONTHLY' },
  ...overrides,
});
const plan = (invoices: Invoice[], date = '2027-01-10', fault = false) => planEarlyReturn(invoices, 'contract', ['contract'], day(date), fault);
const prepaid = (paid: bigint): Invoice => invoice(1, 0n, {
  status: paid === 660n ? 'PAID' : paid ? 'PARTIALLY_PAID' : 'OPEN',
  rentalAmount: 600n, depositAmount: 60n, totalAmount: 660n, amountPaid: paid, balanceDue: 660n - paid,
  billingPeriodEnd: day(starts[6]), pricingSnapshot: { paymentPlan: 'PREPAID', billingMode: 'MONTHLY', termMonths: 6 },
});
const db = () => ({
  invoice: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
  paymentSubmission: { count: vi.fn().mockResolvedValue(0) }, onlinePaymentTransaction: { count: vi.fn().mockResolvedValue(0) },
  payment: { findMany: vi.fn().mockResolvedValue([{ id: 'payment', amount: 660n }]) },
});

describe('Early return financial closeout', () => {
  it('uses the booked discount table and offsets the signed fee against prepaid rent', async () => {
    const row = invoice(1, 0n, { status: 'PAID', rentalAmount: 15_300_000n, totalAmount: 15_300_000n,
      amountPaid: 15_300_000n, balanceDue: 0n, billingPeriodEnd: day('2027-11-17'), pricingSnapshot: {
        paymentPlan: 'PREPAID', billingMode: 'MONTHLY', termMonths: 12, monthlyUnitPrice: 1_500_000,
        pricingPolicy: { ...baselinePricingPolicy, earlyReturn: { version: 4, value: {
          feeMethod: 'FIXED_AMOUNT', feeAmount: 100_000, refundMode: 'RECALCULATE_DISCOUNT',
        } } },
      } });
    const result = plan([row], '2027-03-17');
    expect(summarizeEarlyReturn(result, '2027-03-17')).toMatchObject({ rentalAmount: 5_700_000,
      penaltyAmount: 100_000, refundOffset: 100_000, refundAmount: 9_500_000, additionalCharge: 0 });
    const tx = db();
    tx.payment.findMany.mockResolvedValue([{ id: 'pay-booked', amount: row.amountPaid }]);
    await expect(applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-03-17'))).resolves.toEqual([
      { invoiceId: row.id, paymentIds: ['pay-booked'], amount: 9_500_000, offsetAmount: 100_000 },
    ]);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
    const protectedPlan = planEarlyReturn([row], 'contract', ['contract'], day('2027-03-17'), false, [], true);
    expect(summarizeEarlyReturn(protectedPlan, '2027-03-17')).toMatchObject({ refundAmount: 10_200_000, penaltyAmount: 0 });
  });

  it('keeps prepaid rent in the no-refund mode and records the fee once outside original paid invoices', async () => {
    const row = { ...prepaid(660n), pricingSnapshot: { paymentPlan: 'PREPAID', billingMode: 'MONTHLY', termMonths: 6,
      pricingPolicy: { earlyReturn: { version: 2, value: { feeMethod: 'UNUSED_RENT_PERCENTAGE', feeAmount: 10, refundMode: 'NONE' } } },
    } } satisfies Invoice;
    const result = plan([row, { ...row, id: 'second', invoiceCode: 'I2', billingPeriodStart: day('2027-05-17'), billingPeriodEnd: day('2027-11-17') }]);
    expect(summarizeEarlyReturn(result, '2027-01-10')).toMatchObject({ refundAmount: 0, penaltyAmount: 100, additionalCharge: 100 });
    const tx = db();
    await applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-01-10'), 'return-id');
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoice.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ invoiceCode: 'RET-EARLY',
      type: 'SETTLEMENT', chargeAmount: 100n, balanceDue: 100n, dueAt: day('2027-01-10'),
      pricingSnapshot: expect.objectContaining({ returnRequestId: 'return-id', rentalContractId: 'contract' }),
    }) });
  });

  it('charges the fixed early return fee inside the last started period and skips it on the end date', () => {
    const row = invoice(1, 100n, { pricingSnapshot: { paymentPlan: 'PAY_MONTHLY', pricingPolicy: {
      earlyReturn: { version: 1, value: { feeMethod: 'FIXED_AMOUNT', feeAmount: 20, refundMode: 'ORIGINAL_DISCOUNT' } },
    } } });
    expect(summarizeEarlyReturn(plan([row], '2026-12-16'), '2026-12-16')).toMatchObject({
      refundAmount: 0, penaltyAmount: 20, additionalCharge: 20,
    });
    expect(summarizeEarlyReturn(plan([row], '2026-12-17'), '2026-12-17')).toMatchObject({ penaltyAmount: 0, additionalCharge: 0 });
  });

  it('keeps two started periods and waives periods three to six in the November 17 example', async () => {
    const invoices = [1, 2, 3, 4, 5, 6].map(cycle => invoice(cycle, cycle <= 2 ? 100n : 0n));
    const result = plan(invoices);
    expect(summarizeEarlyReturn(result, '2027-01-10')).toMatchObject({
      lastCycleStart: '2026-12-17', rentalAmount: 200, outstandingAmount: 0, waivedAmount: 400, refundAmount: 0, penaltyAmount: 0,
    });
    const tx = db();
    await expect(applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-01-10'))).resolves.toEqual([]);
    expect(tx.invoice.updateMany.mock.calls.map(([arg]) => [arg.where.id, arg.data.status])).toEqual([3, 4, 5, 6].map(cycle => ['invoice-' + cycle, 'VOID']));
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('allocates prepaid multi-cycle rent and preserves the full paid invoice and its payment', async () => {
    const result = plan([prepaid(660n)]);
    expect(summarizeEarlyReturn(result, '2027-01-10')).toMatchObject({ rentalAmount: 200, refundAmount: 400, waivedAmount: 0,
      adjustedInvoices: [{ type: 'INITIAL', periodStart: '2026-11-17', periodEnd: '2027-05-17',
        paidAmount: 660, unusedRent: 400, unusedServices: 0, facilityFaultCredit: 0, refund: 400, waived: 0 }],
    });
    const tx = db();
    await expect(applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-01-10'))).resolves.toEqual([
      { invoiceId: 'invoice-1', paymentIds: ['payment'], amount: 400 },
    ]);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('keeps used debt and recognizes the next period only after its boundary', () => {
    const invoices = [invoice(1, 100n), invoice(2, 25n), invoice(3)];
    for (const date of ['2027-01-10', '2027-01-16', '2027-01-17']) {
      expect(summarizeEarlyReturn(plan(invoices, date), date)).toMatchObject({ rentalAmount: 200, outstandingAmount: 75, waivedAmount: 100 });
    }
    expect(summarizeEarlyReturn(plan(invoices, '2027-01-18'), '2027-01-18')).toMatchObject({ rentalAmount: 300, outstandingAmount: 175, waivedAmount: 0 });
  });

  it('uses prior confirmed partial payment against obligations before creating a successor or refund', async () => {
    const result = plan([prepaid(180n)]);
    const tx = db();
    await applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-01-10'));
    expect(tx.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amountPaid: 180n }), data: expect.objectContaining({ status: 'VOID' }) }));
    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ replacesInvoiceId: 'invoice-1', balanceDue: 80n, amountPaid: 0n }) });
    expect(tx.payment.findMany).not.toHaveBeenCalled();
    const overpaid = plan([prepaid(300n)]);
    expect(overpaid[0]).toMatchObject({ refund: 40n, outstanding: 0n });
  });

  it('handles installments from two renewals and skips a different contract renewal', () => {
    const renewed = (billing: number, renewalId: string, paid: bigint, rentalContractId = 'contract') => invoice(billing, paid, {
      type: 'RENEWAL', billingCycle: null, renewalCycle: 1, renewalRequestId: renewalId, renewalRequest: { rentalContractId },
    });
    const result = summarizeEarlyReturn(plan([invoice(1, 100n), renewed(2, 'r1', 100n), renewed(3, 'r2', 100n),
      renewed(4, 'r2', 0n), renewed(5, 'another', 100n, 'other')]), '2027-01-10');
    expect(result).toMatchObject({ rentalAmount: 200, refundAmount: 100, waivedAmount: 100 });
  });

  it('preserves another unit’s unpaid obligation and its allocation on a shared invoice', async () => {
    const original = invoice(3, 0n, { rentalAmount: 250n, totalAmount: 250n, balanceDue: 250n });
    const units = ['contract', 'other'].map((id, index) => ({ contractId: id, contractCode: id, reservationUnitId: id,
      storageUnitId: id, unitCode: id, storageTypeId: 'type', storageTypeName: 'Kho', monthlyRate: 100 + 50 * index,
      rentalAmount: 100 + 50 * index, depositAmount: 0 }));
    original.pricingSnapshot = { breakdown: invoiceBreakdown(original.billingPeriodStart!, original.billingPeriodEnd!, units, [], original) };
    const result = planEarlyReturn([original], 'contract', ['contract', 'other'], day('2027-01-10'));
    const tx = db();
    await applyEarlyReturn(tx as never, result, 'contract', 'RET', day('2027-01-10'));
    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      balanceDue: 150n, rentalAmount: 150n, pricingSnapshot: expect.objectContaining({ breakdown: expect.objectContaining({
        units: [expect.objectContaining({ contractId: 'contract', rentalAmount: 0 }), expect.objectContaining({ contractId: 'other', rentalAmount: 150 })],
      }) }),
    }) });
  });

  it('rounds approved facility relief down by unused days within the actual billing cycle', () => {
    expect(plan([invoice(2, 100n)])[0].faultCredit).toBe(0n);
    const result = plan([invoice(2, 100n)], '2027-01-10', true);
    expect(summarizeEarlyReturn(result, '2027-01-10')).toMatchObject({ refundAmount: 22, facilityFaultCredit: 22, rentalAmount: 78 });
  });

  it('charges only elapsed service days while keeping the started rental period in full', () => {
    const row = invoice(2, 0n, { serviceAmount: 20n, totalAmount: 120n, balanceDue: 120n });
    const unit = { contractId: 'contract', contractCode: 'C1', reservationUnitId: 'allocation', storageUnitId: 'unit', unitCode: 'A1',
      storageTypeId: 'type', storageTypeName: 'Kho', monthlyRate: 100, rentalAmount: 100, depositAmount: 0 };
    row.pricingSnapshot = { breakdown: invoiceBreakdown(row.billingPeriodStart!, row.billingPeriodEnd!, [unit], [
      { id: 'service', name: 'Dịch vụ dùng theo ngày', billingUnit: 'DAY', quantity: 1, unitPrice: 2, amount: 20 },
    ], row) };
    const result = planEarlyReturn([row], 'contract', ['contract'], day('2027-01-10'), false, [
      { id: 'service', serviceStartDate: day('2027-01-05'), serviceEndDate: day('2027-01-15') },
    ]);
    expect(summarizeEarlyReturn(result, '2027-01-10')).toMatchObject({ rentalAmount: 100, serviceAmount: 10, waivedAmount: 10, outstandingAmount: 110 });
  });

  it('withholds estimates when a started renewal period has not yet been invoiced', () => {
    const renewal = { status: 'COMPLETED', paymentPlan: 'PAY_MONTHLY', rentalContractId: 'contract', termMonths: 3,
      previousEndDate: day('2026-12-17'), invoices: [{ renewalCycle: 1, status: 'PAID' }] };
    expect(hasStartedUnissuedRenewal([renewal], 'contract', day('2027-01-17'))).toBe(false);
    expect(hasStartedUnissuedRenewal([renewal], 'contract', day('2027-01-18'))).toBe(true);
    expect(hasStartedUnissuedRenewal([renewal], 'other', day('2027-01-18'))).toBe(false);
  });

  it('blocks conflicting payments before adjusting outstanding invoices', async () => {
    const tx = db();
    tx.onlinePaymentTransaction.count.mockResolvedValue(1);
    await expect(applyEarlyReturn(tx as never, plan([invoice(3)]), 'contract', 'RET', day('2027-01-10'))).rejects.toThrow('đang đối soát');
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('keeps approval and actual refund independent from deposit settlement', () => {
    const earlyReturnCloseout = { appliedAt: '2027-01-10', refundAmount: 400 };
    expect(earlyReturnSettlementPending({ earlyReturnCloseout })).toBe(true);
    expect(earlyReturnSettlementPending({ earlyReturnCloseout, rentRefundApprovedAt: day('2027-01-11') })).toBe(true);
    expect(earlyReturnSettlementPending({ earlyReturnCloseout, rentRefundApprovedAt: day('2027-01-11'), rentRefundedAt: day('2027-01-12') })).toBe(false);
    expect(earlyReturnSettlementPending({ earlyReturnCloseout: { policy: 'legacy' } })).toBe(false);
  });
});
