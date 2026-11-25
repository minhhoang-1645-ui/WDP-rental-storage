import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PricingService } from '../pricing/pricing.service.js';
import { BillingService } from './billing.service.js';

describe('quoted add-on costs equal all invoice installments, no database', () => {
  it.each([
    ['2026-01-31', '2026-04-30', '2026-01-31', '2026-03-31', [100000n, 100000n, 0n]],
    ['2028-01-31', '2028-04-30', '2028-01-31', '2028-03-31', [100000n, 100000n, 0n]],
    ['2026-01-31', '2026-04-30', '2026-02-28', '2026-04-28', [0n, 200000n, 0n]],
    ['2026-01-30', '2026-04-30', '2026-01-30', '2026-03-30', [100000n, 100000n, 0n]],
  ])('anchors monthly service anniversaries to %s rather than truncating repeatedly', async (startDate, endDate, serviceStartDate, serviceEndDate, expected) => {
    const quote = new PricingService({} as never).calculate({ id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(1500000), minRentalDays: 1, allowDailyRental: true }, { storageTypeId:'type', quantity:2, startDate, endDate, paymentPlan:'PAY_MONTHLY', serviceSelections:[{serviceId:'shelf',quantity:1,serviceStartDate,serviceEndDate}] }, [{id:'shelf',code:'SHELF',name:'Kệ lưu trữ',physicalUnit:'cái',kind:'RENTAL',billingUnit:'MONTH',unitPrice:100000n,isActive:true}]);
    const reservationUnit = { id: 'u', reservationId: 'r', plannedStartDate: new Date(startDate), storageUnit: { id: 'physical', unitNumber: 'B12', storageTypeId: 'type', storageType: { name: 'Kho nhỏ', facilityId:'origin' } } };
    const contract = { id: 'c', contractCode: 'C01', status: 'ACTIVE', startDate: new Date(startDate), endDate: new Date(endDate), currentMonthlyRate: null, rateEffectiveFrom: null, reservationUnit };
    const otherUnit = { ...reservationUnit, id: 'u2', storageUnit: { ...reservationUnit.storageUnit, id: 'physical2', unitNumber: 'B13' } };
    const reservation = { id:'r',reservationCode:'R',status:'CONFIRMED',facilityId:'origin',storageTypeId:'type',quantity:2,startDate:new Date(startDate),endDate:new Date(endDate),expiresAt:null,contracts:[contract, { ...contract, id: 'c2', contractCode: 'C02', reservationUnit: otherUnit }],units:[reservationUnit, otherUnit],quoteSnapshot:quote,services:[{id:'service',additionalServiceId:'shelf',serviceNameSnapshot:'Kệ lưu trữ',serviceKindSnapshot:'RENTAL',billingUnitSnapshot:'MONTH',unitPriceSnapshot:100000n,quantity:1,amountSnapshot:200000n,serviceFacilityId:'origin',serviceStartDate:new Date(serviceStartDate),serviceEndDate:new Date(serviceEndDate)}] };
    const created: {serviceAmount:bigint;totalAmount:bigint;pricingSnapshot:{breakdown: { units: unknown[]; sharedServices: Array<{ amount: number }> }} }[]=[];
    const tx={reservation:{findUnique:vi.fn().mockResolvedValue(reservation)},invoice:{findUnique:vi.fn().mockResolvedValue(null),findMany:vi.fn().mockResolvedValue([]),upsert:vi.fn().mockImplementation(({create})=>{created.push(create);return create;})}};
    const billing=new BillingService({} as never,{} as never);
    await billing.ensureInitialInvoice(tx as never,'r');
    reservationUnit.storageUnit.storageType.facilityId='destination';
    otherUnit.storageUnit.storageType.facilityId='destination';
    reservation.services[0].serviceFacilityId='destination';
    await billing.ensureRecurringInvoices(tx as never,'r');
    expect(created[0]).not.toHaveProperty('facilityIdSnapshot');
    expect(created.slice(1)).toEqual([expect.objectContaining({facilityIdSnapshot:'destination'}),expect.objectContaining({facilityIdSnapshot:'destination'})]);
    expect(created.map(row=>row.serviceAmount)).toEqual(expected);
    for (const row of created) {
      expect(row.pricingSnapshot.breakdown.units).toHaveLength(2);
      expect(row.pricingSnapshot.breakdown.sharedServices).toEqual(row.serviceAmount ? [expect.objectContaining({ id: 'service', quantity: 1, unitPrice: 100000, physicalUnit: 'cái', amount: Number(row.serviceAmount) })] : []);
    }
    expect(Number(created[0].totalAmount)).toBe(quote.estimatedInitialAmountDue);
    expect(Number(created.reduce((sum,row)=>sum+row.serviceAmount,0n))).toBe(quote.addOnTotalAmount);
    expect(Number(created.reduce((sum,row)=>sum+row.totalAmount,0n))).toBe(quote.quotedTotalAmount);
  });
});
