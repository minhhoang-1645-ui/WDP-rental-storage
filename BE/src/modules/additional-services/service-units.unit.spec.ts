import { describe, expect, it, vi } from 'vitest';
import { AdditionalServicesService } from './additional-services.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { Prisma } from '../../generated/prisma/client.js';

const stamp = new Date();
const catalogItem = { id: 'addon', code: 'BOX', name: 'Hộp', kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: null, unitPrice: 20000n, createdAt: stamp, updatedAt: stamp, isActive: true };
describe('physical unit independent of billing and historical prices', () => {
  it('adds a nullable catalog field without guessing legacy units; permits a deliberate one-time setup', async () => {
    const additionalService = { findMany: vi.fn().mockResolvedValue([catalogItem]), findFirst: vi.fn().mockResolvedValue(catalogItem), update: vi.fn(async ({ data }) => ({ ...catalogItem, ...data })) };
    const service = new AdditionalServicesService({ additionalService } as never);
    expect((await service.publicCatalog())[0]).toMatchObject({ physicalUnit: null, unitPrice: 20000, billingUnit: 'ONE_TIME' });
    expect(await service.update('addon', { physicalUnit: 'cái' })).toMatchObject({ physicalUnit: 'cái', unitPrice: 20000 });
    await expect(service.update('addon', { physicalUnit: 'ngày' })).rejects.toThrow('đơn vị');
    await expect(service.update('addon', { kind: 'RENTAL', billingUnit: 'DAY' })).rejects.toThrow('Không đổi loại');
    additionalService.findFirst.mockResolvedValue({ ...catalogItem, physicalUnit: 'cái' } as never);
    await expect(service.update('addon', { physicalUnit: 'thùng' })).rejects.toThrow('Không đổi');
  });
  it('preserves saved quote amounts and units when catalog price changes; PURCHASE, DAY, MONTH remain priced by existing rules', async () => {
    const pricing = new PricingService({} as never);
    const storage = { id: 'type', name: 'Kho', sizeId: 'small', monthlyRate: new Prisma.Decimal(1500000), allowDailyRental: true, minRentalDays: 1 };
    const input = { storageTypeId: 'type', quantity: 1, startDate: '2026-11-01', endDate: '2027-02-01', paymentPlan: 'PAY_MONTHLY' as const, serviceSelections: [
      { serviceId: 'box', quantity: 2 }, { serviceId: 'dolly', quantity: 1, serviceStartDate: '2026-11-01', serviceEndDate: '2026-11-03' }, { serviceId: 'shelf', quantity: 1, serviceStartDate: '2026-11-01', serviceEndDate: '2027-02-01' },
    ] };
    const services = [
      { id: 'box', code: 'BOX', name: 'Hộp', kind: 'PURCHASE' as const, billingUnit: 'ONE_TIME' as const, unitPrice: 20000n, physicalUnit: 'cái', isActive: true },
      { id: 'dolly', code: 'DOLLY', name: 'Xe đẩy', kind: 'RENTAL' as const, billingUnit: 'DAY' as const, unitPrice: 60000n, physicalUnit: 'xe', isActive: true },
      { id: 'shelf', code: 'SHELF', name: 'Kệ', kind: 'RENTAL' as const, billingUnit: 'MONTH' as const, unitPrice: 150000n, physicalUnit: 'bộ', isActive: true },
    ];
    const saved = pricing.calculate(storage, input, services);
    expect(saved.services.map(item => item.amount)).toEqual([40000, 120000, 450000]);
    expect(saved.initialPaymentBreakdown).toMatchObject({ purchaseAddOnAmount: 40000, rentalAddOnAmount: 270000 });
    services[0].unitPrice = 90000n;
    expect(pricing.calculate(storage, input, services).purchaseAddOnAmount).toBe(180000);
    expect(saved.purchaseAddOnAmount).toBe(40000);
    expect(saved.services[0].physicalUnit).toBe('cái');
    expect(saved.discountPercent).toBe(0);
  });
});
