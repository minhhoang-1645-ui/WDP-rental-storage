import { describe, expect, it } from 'vitest';
import { baselinePricingPolicy, pricingPolicyValidators } from './pricing-policy.js';
import { transferAmounts } from '../transfers/transfer-finance.js';
import { calculateOccupiedOverdue } from '../returns/overdue-return.js';

const on = (date: string) => new Date(date + 'T00:00:00Z');

describe('Operational settlement policies', () => {
  it('rejects conflicting cancellation thresholds or an increasing refund percentage', () => {
    const terms = baselinePricingPolicy.cancellation!.value;
    expect(() => pricingPolicyValidators.cancellation({ ...terms, nearDays: terms.farDays })).toThrow();
    expect(() => pricingPolicyValidators.cancellation({ ...terms, nearPercent: 100 })).toThrow();
  });

  it('offsets the fee against unused rent and refundable deposit using the signed period', () => {
    const terms = { moveDate: '2026-11-16', periodStart: '2026-11-01', periodEnd: '2026-12-01', oldRate: 1_500_000,
      newRate: 1_200_000, fee: 50_000, currentDeposit: 1_500_000, targetDeposit: 1_200_000 };
    expect(transferAmounts(terms)).toMatchObject({ rentalAdjustment: -150_000, depositAdjustment: -300_000, refundAmount: 400_000, amountDue: 0 });
    expect(transferAmounts({ ...terms, fee: 0 })).toMatchObject({ rentalAdjustment: -150_000, depositAdjustment: -300_000, refundAmount: 450_000, amountDue: 0 });
    expect(transferAmounts({ ...terms, currentDeposit: 900_000 })).toMatchObject({ depositAdjustment: 300_000, refundAmount: 0, amountDue: 200_000 });
    expect(() => transferAmounts({ ...terms, moveDate: '2026-12-01' })).toThrow();
  });

  it('charges physical occupancy after end date and grace period, using the latest agreed rate', () => {
    const contract = { id: 'contract', activatedAt: on('2026-11-01'), endDate: on('2026-12-01'), currentMonthlyRate: 3_000_000n, rateEffectiveFrom: on('2026-11-25') };
    const quote = { monthlyUnitPrice: 1_000_000, pricingPolicy: { returnOverdue: { version: 3,
      value: { graceDays: 1, managerDays: 7, multiplier: 120 } } } };
    expect(calculateOccupiedOverdue(contract, quote, [], on('2026-12-01'))).toBeNull();
    expect(calculateOccupiedOverdue(contract, quote, [], on('2026-12-02'))).toMatchObject({ amount: 0 });
    expect(calculateOccupiedOverdue(contract, quote, [], on('2026-12-04'))).toMatchObject({ overdueDays: 3, billableDays: 2, amount: 240_000 });
    expect(calculateOccupiedOverdue(contract, {}, [], on('2026-12-04'))).toBeNull();
  });
});
