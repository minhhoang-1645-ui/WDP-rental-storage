import { describe, expect, it, vi } from 'vitest';
import { AdditionalServicesService } from './additional-services.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { Prisma } from '../../generated/prisma/client.js';

const stamp = new Date();
const catalogItem = {
  id: 'addon',
  code: 'BOX',
  name: 'Hộp',
  kind: 'PURCHASE',
  billingUnit: 'ONE_TIME',
  physicalUnit: null,
  unitPrice: 20000n,
  createdAt: stamp,
  updatedAt: stamp,
  isActive: true,
  offerings: [],
};
describe('physical unit independent of billing and historical prices', () => {
  it('adds a nullable catalog field without guessing legacy units; reviews configured offerings and only blocks outstanding obligations', async () => {
    const actor = {
      id: 'bom',
      role: 'BUSINESS_OPERATIONS_MANAGER' as const,
      fullName: 'Test',
      email: 'test@example.test',
      phone: '',
    };
    const additionalService = {
      findUnique: vi.fn().mockResolvedValue(catalogItem),
      update: vi.fn(async ({ data }) => ({ ...catalogItem, ...data })),
    };
    const db: any = {
      additionalService,
      reservationService: { findFirst: vi.fn().mockResolvedValue(null) },
      facilityServiceOffering: { update: vi.fn() },
      facilityAccess: { findMany: vi.fn().mockResolvedValue([{ userId: 'manager-1', facilityId: 'facility-1' }]) },
      auditEvent: { create: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(actor) },
      $queryRawUnsafe: vi.fn(),
    };
    db.$transaction = (callback: any) => callback(db);
    const service = new AdditionalServicesService(db);
    expect(
      await service.saveCatalog('addon', { physicalUnit: 'cái', expectedUpdatedAt:stamp.toISOString() }, actor),
    ).toMatchObject({ physicalUnit: 'cái', unitPrice: null });
    await expect(
      service.saveCatalog('addon', { physicalUnit: 'ngày', expectedUpdatedAt:stamp.toISOString() }, actor),
    ).rejects.toThrow('đơn vị');
    await expect(
      service.saveCatalog(
        'addon',
        { kind: 'RENTAL', billingUnit: 'DAY', expectedUpdatedAt:stamp.toISOString() },
        actor,
      ),
    ).resolves.toMatchObject({ kind: 'RENTAL', billingUnit: 'DAY' });
    additionalService.findUnique.mockResolvedValue({ ...catalogItem, physicalUnit: 'cái' });
    const expectedUpdatedAt = stamp.toISOString();
    await expect(service.saveCatalog('addon', { physicalUnit: 'thùng', expectedUpdatedAt }, actor))
      .resolves.toMatchObject({ physicalUnit: 'thùng' });
    await expect(service.saveCatalog('addon', { kind: 'RENTAL', expectedUpdatedAt }, actor))
      .rejects.toThrow('Thiết bị cho thuê');
    additionalService.findUnique.mockResolvedValue({
      ...catalogItem, physicalUnit: 'cái',
      offerings: [{ id: 'offer-1', facilityId: 'facility-1', configurationReview: null, stockOnHand: 100 }],
    });
    await expect(service.saveCatalog('addon', { physicalUnit: 'thùng', expectedUpdatedAt }, actor))
      .resolves.toMatchObject({ physicalUnit: 'thùng' });
    expect(db.facilityServiceOffering.update).toHaveBeenCalledWith({
      where: { id: 'offer-1' }, data: { configurationReview: {
        revision: expect.any(String), before: { kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'cái' },
        after: { kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'thùng' },
      } },
    });
    expect(db.auditEvent.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      metadata: expect.objectContaining({ recipientIds: ['manager-1'], reviewFacilityIds: ['facility-1'],
        changes: [{ field: 'physicalUnit', before: 'cái', after: 'thùng' }] }),
    }) });
    db.facilityServiceOffering.update.mockClear();
    db.auditEvent.create.mockClear();
    await service.saveCatalog('addon', { physicalUnit: 'cái', expectedUpdatedAt }, actor);
    expect(db.auditEvent.create).not.toHaveBeenCalled();
    db.reservationService.findFirst.mockResolvedValue({ serviceKindSnapshot: 'RENTAL' });
    await expect(service.saveCatalog('addon', { physicalUnit: 'thùng', expectedUpdatedAt }, actor))
      .rejects.toThrow('Còn lượt thuê chưa kết thúc');
    await expect(service.saveCatalog('addon', { name: 'Tên mới', isActive: false, expectedUpdatedAt }, actor))
      .resolves.toMatchObject({ name: 'Tên mới', isActive: false });
    expect(db.facilityServiceOffering.update).not.toHaveBeenCalled();
    await expect(service.saveCatalog('addon', { code: 'NEW', expectedUpdatedAt }, actor))
      .rejects.toThrow('Không đổi mã');
    await expect(service.saveCatalog('addon', { isActive: false, expectedUpdatedAt: 'stale' }, actor))
      .rejects.toThrow('vừa thay đổi');
    await expect(
      service.saveCatalog('addon', { unitPrice: 30000 }, actor),
    ).rejects.toThrow('cơ sở');
  });
  it('preserves saved quote amounts and units when catalog price changes; PURCHASE, DAY, MONTH remain priced by existing rules', async () => {
    const pricing = new PricingService({} as never);
    const storage = {
      id: 'type',
      name: 'Kho',
      sizeId: 'small',
      monthlyRate: new Prisma.Decimal(1500000),
      allowDailyRental: true,
      minRentalDays: 1,
    };
    const input = {
      storageTypeId: 'type',
      quantity: 1,
      startDate: '2026-11-01',
      endDate: '2027-02-01',
      paymentPlan: 'PAY_MONTHLY' as const,
      serviceSelections: [
        { serviceId: 'box', quantity: 2 },
        {
          serviceId: 'dolly',
          quantity: 1,
          serviceStartDate: '2026-11-01',
          serviceEndDate: '2026-11-03',
        },
        {
          serviceId: 'shelf',
          quantity: 1,
          serviceStartDate: '2026-11-01',
          serviceEndDate: '2027-02-01',
        },
      ],
    };
    const services = [
      {
        id: 'box',
        code: 'BOX',
        name: 'Hộp',
        kind: 'PURCHASE' as const,
        billingUnit: 'ONE_TIME' as const,
        unitPrice: 20000n,
        physicalUnit: 'cái',
        isActive: true,
      },
      {
        id: 'dolly',
        code: 'DOLLY',
        name: 'Xe đẩy',
        kind: 'RENTAL' as const,
        billingUnit: 'DAY' as const,
        unitPrice: 60000n,
        physicalUnit: 'xe',
        isActive: true,
      },
      {
        id: 'shelf',
        code: 'SHELF',
        name: 'Kệ',
        kind: 'RENTAL' as const,
        billingUnit: 'MONTH' as const,
        unitPrice: 150000n,
        physicalUnit: 'bộ',
        isActive: true,
      },
    ];
    const saved = pricing.calculate(storage, input, services);
    expect(saved.services.map((item) => item.amount)).toEqual([
      40000, 120000, 450000,
    ]);
    expect(saved.initialPaymentBreakdown).toMatchObject({
      purchaseAddOnAmount: 40000,
      rentalAddOnAmount: 270000,
    });
    services[0].unitPrice = 90000n;
    expect(
      pricing.calculate(storage, input, services).purchaseAddOnAmount,
    ).toBe(180000);
    expect(saved.purchaseAddOnAmount).toBe(40000);
    expect(saved.services[0].physicalUnit).toBe('cái');
    expect(saved.discountPercent).toBe(0);
  });
});
