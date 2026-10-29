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
    const quote = new PricingService({} as never).calculate({ id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(1500000), minRentalDays: 1, allowDailyRental: true }, { storageTypeId:'type', quantity:1, startDate, endDate, paymentPlan:'PAY_MONTHLY', serviceSelections:[{serviceId:'shelf',quantity:1,serviceStartDate,serviceEndDate}] }, [{id:'shelf',code:'SHELF',name:'Kệ lưu trữ',kind:'RENTAL',billingUnit:'MONTH',unitPrice:100000n,isActive:true}]);
    const reservation = { id:'r',reservationCode:'R',status:'CONFIRMED',quantity:1,startDate:new Date(startDate),endDate:new Date(endDate),expiresAt:null,contracts:[{id:'c',status:'ACTIVE'}],units:[{id:'u'}],quoteSnapshot:quote,services:[{serviceKindSnapshot:'RENTAL',billingUnitSnapshot:'MONTH',unitPriceSnapshot:100000n,quantity:1,amountSnapshot:200000n,serviceStartDate:new Date(serviceStartDate),serviceEndDate:new Date(serviceEndDate)}] };
    const created: {serviceAmount:bigint;totalAmount:bigint}[]=[];
    const tx={reservation:{findUnique:vi.fn().mockResolvedValue(reservation)},invoice:{upsert:vi.fn().mockImplementation(({create})=>{created.push(create);return create;})}};
    const billing=new BillingService({} as never,{} as never);
    await billing.ensureInitialInvoice(tx as never,'r'); await billing.ensureRecurringInvoices(tx as never,'r');
    expect(created.map(row=>row.serviceAmount)).toEqual(expected);
    expect(Number(created[0].totalAmount)).toBe(quote.estimatedInitialAmountDue);
    expect(Number(created.reduce((sum,row)=>sum+row.serviceAmount,0n))).toBe(quote.addOnTotalAmount);
    expect(Number(created.reduce((sum,row)=>sum+row.totalAmount,0n))).toBe(quote.quotedTotalAmount);
  });
});
