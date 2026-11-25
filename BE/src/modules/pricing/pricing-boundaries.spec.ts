import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PricingService } from './pricing.service.js';
import { BookingService } from '../booking/booking.service.js';
import type { PricingInput } from './pricing.types.js';
import { baselinePricingPolicy, type PricingPolicySnapshot } from '../policies/pricing-policy.js';

const service = new PricingService({} as never);
const storage = { id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(3000000), allowDailyRental: true, minRentalDays: 1 };
const input: PricingInput = { storageTypeId: 'type', startDate: '2026-01-01', endDate: '2026-04-01', quantity: 1, paymentPlan: 'PAY_MONTHLY' };
it('gates direct quotes on the group range and keeps internal bounds out of customer responses', async () => {
  const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const product = { ...storage, facilityId: 'A', bookingEnabled: true };
  const db = { storageType: { findUnique: vi.fn().mockResolvedValue(product) },
    facility: { findUnique: vi.fn().mockResolvedValue({ bookingEnabled: true, operationalStatus: 'OPEN' }) },
    businessRule: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) } };
  const pricing = new PricingService(db as never);
  const request = { ...input, startDate: start, endDate: end };
  await expect(pricing.quote(request)).rejects.toThrow('chưa nhận giao dịch');
  db.businessRule.findFirst.mockResolvedValue({ value: { min: 1_000_000, max: 2_800_000 } });
  await expect(pricing.quote(request)).rejects.toThrow('chưa nhận giao dịch');
  db.businessRule.findFirst.mockResolvedValue({ value: { min: 1_000_000, max: 3_000_000 } });
  const quote = await pricing.quote(request);
  expect(quote.monthlyUnitPrice).toBe(3_000_000);
  expect(quote).not.toHaveProperty('pricingRange');
  db.storageType.findUnique.mockResolvedValue({ ...product, bookingEnabled: false });
  await expect(pricing.quote(request)).rejects.toThrow('chưa nhận giao dịch');
});
it('lists multiple eligible types in one group and filters another site independently', async () => {
  const type = { ...storage, facilityId: 'A', bookingEnabled: true, widthCm: 150, lengthCm: 200, heightCm: 240 };
  const findMany = vi.fn().mockResolvedValue([
    { ...type, id: 'a1', monthlyRate: new Prisma.Decimal(500000) },
    { ...type, id: 'a2', monthlyRate: new Prisma.Decimal(800000) },
    { ...type, id: 'b1', facilityId: 'B', monthlyRate: new Prisma.Decimal(800000) },
    { ...type, id: 'a3', sizeId: 'medium', monthlyRate: new Prisma.Decimal(800000) },
  ]);
  const db = { storageType: { findMany }, facilityServiceOffering: { findMany: vi.fn().mockResolvedValue([]) },
    facility: { findMany: vi.fn().mockResolvedValue([]) }, businessRule: { findMany: vi.fn().mockResolvedValue([
      { facilityId: 'A', key: 'monthlyPriceRange:small', value: { min: 500000, max: 800000 } },
      { facilityId: 'B', key: 'monthlyPriceRange:small', value: { min: 900000, max: 1000000 } },
    ]) } };
  const catalog = await new BookingService(db as never).getCatalog();
  expect(catalog.products.map(product => [product.id, product.monthlyPrice])).toEqual([['a1', 500000], ['a2', 800000]]);
  expect(catalog.products[0]).not.toHaveProperty('priceRange');
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ bookingEnabled: true }) }));
});
describe('existing pricing policy boundaries, no live database', () => {
  it.each([
    ['NONE', 0, 0],
    ['FIXED_AMOUNT', 700_000, 1_400_000],
    ['RENT_PERCENTAGE', 50, 9_000_000],
    ['MONTHLY_RENT_MULTIPLIER', 2, 12_000_000],
  ] as const)('applies %s once to a two-unit quote and preserves its policy version', (method, amount, depositAmount) => {
    const policy: PricingPolicySnapshot = {
      ...baselinePricingPolicy,
      deposit: { version: 2, value: { ...baselinePricingPolicy.deposit.value, other: { method, amount } } },
      prepaid: { version: 4, value: { ...baselinePricingPolicy.prepaid.value, 3: { enabled: true, percent: 20 } } },
    };
    const draft = { ...input, paymentPlan: 'PREPAID' as const, quantity: 2 };
    expect(service.calculate(storage, draft, [], policy)).toMatchObject({
      pricingPolicy: policy, depositAmount, baseRentalAmount: 18_000_000, discountAmount: 3_600_000,
    });
    expect(service.calculate(storage, draft, [], policy, true).depositAmount).toBe(0);
  });

  it('can disable an offer while preserving the prepaid payment plan', () => {
    const policy = { ...baselinePricingPolicy, prepaid: {
      version: 2, value: { ...baselinePricingPolicy.prepaid.value, 3: { enabled: false, percent: 30 } },
    } };
    expect(service.calculate(storage, { ...input, paymentPlan: 'PREPAID' }, [], policy))
      .toMatchObject({ discountPercent: 0, paymentPlan: 'PREPAID', rentalAmount: 9_000_000 });
  });
  it.each([['2026-01-31', '2026-02-28'], ['2028-01-31', '2028-02-29'], ['2026-03-31', '2026-04-30'], ['2026-04-30', '2026-05-30']])('uses a calendar month from %s to %s', (startDate, endDate) => {
    const quote = service.calculate(storage, { ...input, startDate, endDate, quantity: 2 });
    expect(quote).toMatchObject({ termMonths: 1, rentalAmount: 6000000, depositAmount: 6000000, quotedTotalAmount: 12000000 });
  });
  it('keeps initial due separate from the full term and applies discounts only to rent', () => {
    expect(service.calculate(storage, input)).toMatchObject({ quotedTotalAmount: 12000000, estimatedInitialAmountDue: 6000000 });
    expect(service.calculate(storage, { ...input, paymentPlan: 'PREPAID' })).toMatchObject({ rentalAmount: 8550000, depositAmount: 3000000, discountAmount: 450000, quotedTotalAmount: 11550000, estimatedInitialAmountDue: 11550000 });
  });
  it.each([['2026-02-01', 0], ['2026-04-01', 5], ['2026-07-01', 10], ['2027-01-01', 15], ['2026-03-01', 0]])('offers only the existing eligible discount for a term ending %s', (endDate, percent) => {
    const monthly = service.calculate(storage, { ...input, endDate });
    const prepaid = service.calculate(storage, { ...input, endDate, paymentPlan: 'PREPAID' });
    expect(monthly.prepaidDiscountPercent).toBe(percent);
    expect(monthly.discountPercent).toBe(0);
    expect(prepaid.discountPercent).toBe(percent);
    expect(prepaid.depositAmount).toBe(monthly.depositAmount);
    expect(prepaid.lineItems.some(row => row.code === 'prepaid-discount')).toBe(percent > 0);
  });
  it.each(['PAY_MONTHLY', 'PREPAID'] as const)('itemizes a mixed-service quote without double counting for %s', paymentPlan => {
    const quote = service.calculate(storage, { ...input, paymentPlan, serviceSelections: [{ serviceId: 'box', quantity: 2 }, { serviceId: 'cart', quantity: 2, serviceStartDate: '2026-01-05', serviceEndDate: '2026-01-10' }, { serviceId: 'shelf', quantity: 1, serviceStartDate: '2026-02-01', serviceEndDate: '2026-04-01' }] }, [
      { id: 'box', code: 'BOX_SMALL', name: 'Small Moving Box', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 15000n, isActive: true },
      { id: 'cart', code: 'CART', name: 'Xe đẩy', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 60000n, isActive: true },
      { id: 'shelf', code: 'SHELF_STANDARD', name: 'Storage Shelf', kind: 'RENTAL', billingUnit: 'MONTH', unitPrice: 120000n, isActive: true },
    ]);
    const first = quote.initialPaymentBreakdown;
    expect(quote.lineItems.reduce((sum, row) => sum + row.amount, 0)).toBe(quote.quotedTotalAmount);
    expect(first.rentalAmount + first.depositAmount + first.purchaseAddOnAmount + first.rentalAddOnAmount).toBe(quote.estimatedInitialAmountDue);
    expect(first.totalAmount + first.remainingAmount).toBe(quote.quotedTotalAmount);
    expect(quote.addOnTotalAmount).toBe(870000);
    expect(quote.services[0].name).toBe('Thùng carton nhỏ');
    expect(quote.services[2].name).toBe('Kệ lưu trữ');
    expect(first.rentalAddOnAmount).toBe(paymentPlan === 'PREPAID' ? 840000 : 600000);
  });
  it('uses daily rates only when allowed and preserves locker no-deposit policy', () => {
    expect(service.calculate(storage, { ...input, startDate: '2026-02-01', endDate: '2026-02-06' })).toMatchObject({ billableDays: 5, rentalAmount: 500000, depositAmount: 500000 });
    expect(() => service.calculate({ ...storage, allowDailyRental: false }, { ...input, endDate: '2026-01-06' })).toThrow();
    expect(service.calculate({ ...storage, sizeId: 'locker' }, input).depositAmount).toBe(0);
  });
  it('charges a purchase once and a DAY service for its five days, not the whole storage term', () => {
    const services = [{ id: 'purchase', code: 'BOX', name: 'Vật tư', kind: 'PURCHASE' as const, billingUnit: 'ONE_TIME' as const, unitPrice: 10000n, isActive: true }, { id: 'rental', code: 'CART', name: 'Thiết bị', kind: 'RENTAL' as const, billingUnit: 'DAY' as const, unitPrice: 1999n, isActive: true }];
    const quote = service.calculate(storage, { ...input, serviceSelections: [{ serviceId: 'purchase', quantity: 2 }, { serviceId: 'rental', quantity: 2, serviceStartDate: '2026-03-05', serviceEndDate: '2026-03-10' }] }, services);
    expect(quote).toMatchObject({ purchaseAddOnAmount: 20000, rentalAddOnAmount: 19990, estimatedInitialAmountDue: 6020000 });
    expect(quote.services[1].amount).toBe(19990);
  });
  it('accepts an exact calendar MONTH service and rejects a partial calendar month or outside interval', () => {
    const addon = { id: 'monthly', code: 'MONTHLY', name: 'Thiết bị tháng', kind: 'RENTAL' as const, billingUnit: 'MONTH' as const, unitPrice: 100000n, isActive: true };
    const selection = { serviceId: 'monthly', quantity: 3, serviceStartDate: '2026-01-31', serviceEndDate: '2026-02-28' };
    expect(service.calculate(storage, { ...input, serviceSelections: [selection] }, [addon]).rentalAddOnAmount).toBe(300000);
    for (const patch of [{ serviceEndDate: '2026-03-01' }, { serviceEndDate: '2026-05-01' }, { serviceEndDate: '2026-01-31' }]) expect(() => service.calculate(storage, { ...input, serviceSelections: [{ ...selection, ...patch }] }, [addon])).toThrow();
  });
  it('rejects unknown prices instead of turning null into free storage', () => {
    expect(() => service.calculate({ ...storage, monthlyRate: null }, input)).toThrow();
    expect(() => service.calculate(storage, { ...input, serviceSelections: [{ serviceId: 'missing', quantity: 1 }] }, [])).toThrow();
  });
});
