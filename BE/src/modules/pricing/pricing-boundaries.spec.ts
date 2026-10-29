import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PricingService } from './pricing.service.js';
import type { PricingInput } from './pricing.types.js';

const service = new PricingService({} as never);
const storage = { id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(3000000), allowDailyRental: true, minRentalDays: 1 };
const input: PricingInput = { storageTypeId: 'type', startDate: '2026-01-01', endDate: '2026-04-01', quantity: 1, paymentPlan: 'PAY_MONTHLY' };
describe('existing pricing policy boundaries, no live database', () => {
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
