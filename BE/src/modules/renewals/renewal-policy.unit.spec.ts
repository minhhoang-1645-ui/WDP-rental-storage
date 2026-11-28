import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { pricingPolicyDefaults, type RenewalPolicy } from '../policies/pricing-policy.js';
import { RenewalsService } from './renewals.service.js';

function setup(patch: Partial<RenewalPolicy> = {}, daysBeforeEnd = 15) {
  const endDate = new Date(Date.UTC(2030, 4, 1 + daysBeforeEnd));
  const previousRenewal = vi.fn().mockResolvedValue({
    previousEndDate: new Date('2030-04-16T00:00:00Z'), quoteSnapshot: { monthlyUnitPrice: 2_400_000 },
  });
  const reservation = {
    id: 'reservation', status: 'CONFIRMED', quantity: 1,
    quoteSnapshot: { billingMode: 'MONTHLY', monthlyUnitPrice: 1_500_000 },
    contracts: [{
      id: 'contract', contractCode: 'HD1', status: 'ACTIVE', endDate,
      currentMonthlyRate: 1_800_000n, rateEffectiveFrom: new Date('2030-03-16T00:00:00Z'),
      reservationUnitId: 'allocation',
      reservationUnit: {
        id: 'allocation', reservationId: 'reservation', storageUnitId: 'unit', plannedEndDate: endDate, releasedAt: null,
        storageUnit: {
          id: 'unit', unitNumber: 'K1', status: 'OCCUPIED',
          storageType: { id: 'small', name: 'Kho nhỏ', sizeId: 'small', facilityId: 'facility', monthlyRate: new Prisma.Decimal(3_000_000) },
        },
      },
    }],
  };
  const db = {
    reservation: { findFirst: vi.fn().mockResolvedValue(reservation) },
    facility: { findUnique: vi.fn().mockResolvedValue({ operationalStatus: 'OPEN' }) },
    businessRule: { findFirst: vi.fn().mockResolvedValue({ value: { min: 2_000_000, max: 4_000_000 } }), findMany: vi.fn().mockResolvedValue([
      { key: 'renewal', version: 2, value: { ...pricingPolicyDefaults.renewal, ...patch } },
    ]) },
    renewalRequest: { findFirst: vi.fn().mockImplementation(({ select }) => select?.quoteSnapshot ? previousRenewal() : null) },
    reservationUnit: { findFirst: vi.fn().mockResolvedValue(null) },
    returnRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    transferRequest: { count: vi.fn().mockResolvedValue(0) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    db,
    quote: () => new RenewalsService(db as never).quoteCustomerRenewal('customer', {
      reservationId: 'reservation', rentalContractId: 'contract', termMonths: 3, paymentPlan: 'PREPAID',
    }),
  };
}

afterEach(() => vi.useRealTimers());

describe('Customer renewal policy with isolated collaborators', () => {
  it.each([
    ['CURRENT_LIST_PRICE', 3_000_000],
    ['CONTRACT_RATE', 2_400_000],
  ] as const)('quotes %s from the correct source without taking a second deposit', async (priceMode, monthlyUnitPrice) => {
    vi.useFakeTimers({ now: new Date('2030-04-30T17:00:00Z') });
    const { quote } = setup({ priceMode });
    expect(await quote()).toMatchObject({
      monthlyUnitPrice, depositAmount: 0, totalAmount: monthlyUnitPrice * 3 * 0.95,
      pricingPolicy: { renewal: { version: 2 } }, pricingVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([31, 0, -1])('rejects requests %i days before the exclusive end date', async days => {
    vi.useFakeTimers({ now: new Date('2030-04-30T17:00:00Z') });
    await expect(setup({ closesDaysBefore: 0 }, days).quote()).rejects.toThrow('ngoài thời gian');
  });
  it('keeps the signed contract rate available when the retail group has no range', async () => {
    vi.useFakeTimers({ now: new Date('2030-04-30T17:00:00Z') });
    const saved = setup({ priceMode: 'CONTRACT_RATE' });
    saved.db.businessRule.findFirst.mockResolvedValue(null);
    await expect(saved.quote()).resolves.toMatchObject({ monthlyUnitPrice: 2_400_000 });
    expect(saved.db.businessRule.findFirst).not.toHaveBeenCalled();
    const retail = setup({ priceMode: 'CURRENT_LIST_PRICE' });
    retail.db.businessRule.findFirst.mockResolvedValue(null);
    await expect(retail.quote()).rejects.toThrow('chưa nhận giao dịch');
  });

  it('blocks a conflicting allocation at quote time', async () => {
    vi.useFakeTimers({ now: new Date('2030-04-30T17:00:00Z') });
    const { db, quote } = setup();
    db.reservationUnit.findFirst.mockResolvedValue({ id: 'other-allocation' });
    await expect(quote()).rejects.toThrow('trùng với kỳ đề nghị');
  });
});
