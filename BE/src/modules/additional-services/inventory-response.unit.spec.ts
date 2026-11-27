import { describe, expect, it, vi } from 'vitest';
import { AdditionalServiceInventoryService } from './additional-service-inventory.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const actor: PublicUser = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Manager', email: 'manager@example.test', phone: '' };

function setup(kind: 'PURCHASE' | 'RENTAL') {
  const offer = {
    id: 'offer', additionalServiceId: 'service', facilityId: 'facility',
    unitPrice: 10000n, isActive: true, stockOnHand: kind === 'PURCHASE' ? 10 : null,
    rentalCapacity: kind === 'RENTAL' ? 10 : null, createdAt: new Date(), updatedAt: new Date(),
    additionalService: { id: 'service', code: 'SVC', kind, billingUnit: kind === 'PURCHASE' ? 'ONE_TIME' : 'DAY', isActive: true },
  };
  const update = vi.fn(async ({ data }) => ({ ...offer, ...data }));
  const tx = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: actor.id }) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility' }]) },
    facilityServiceOffering: { findMany: vi.fn().mockResolvedValue([offer]), update },
    reservationService: { aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 4 } }), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  };
  const service = new AdditionalServiceInventoryService({ ...tx, $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } as never);
  return { service, update, tx };
}

describe('Facility inventory PATCH response', () => {
  it('enforces the monthly minimum and reports insufficient equipment for the checked dates', async () => {
    const { service, tx } = setup('RENTAL');
    const [offer] = await tx.facilityServiceOffering.findMany();
    tx.facilityServiceOffering.findMany.mockResolvedValue([{
      ...offer, additionalService: { ...offer.additionalService, billingUnit: 'MONTH', minimumRentalMonths: 2 },
    } as typeof offer]);
    const query = { facilityId: 'facility', quantity: 2, startDate: '2099-01-01' };
    await expect(service.publicAvailability('service', { ...query, endDate: '2099-02-01' })).rejects.toThrow('tối thiểu 2 tháng');
    tx.reservationService.findMany.mockResolvedValue([{ quantity: 9, serviceStartDate: new Date('2099-01-01'), serviceEndDate: new Date('2099-03-01') }] as never);
    await expect(service.publicAvailability('service', { ...query, endDate: '2099-03-01' })).resolves.toMatchObject({ available: false, availableQuantity: 1 });
  });
  it.each(['PURCHASE', 'RENTAL'] as const)('returns JSON-safe inventory after updating %s', async kind => {
    const { service, update } = setup(kind);
    const field = kind === 'PURCHASE' ? 'stockOnHand' : 'rentalCapacity';
    const result = await service.update('service', { facilityId: 'facility', [field]: 13 }, actor);
    expect(update).toHaveBeenCalledOnce();
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ id: 'offer', facilityId: 'facility', [field]: 13 });
    expect(result).not.toHaveProperty('unitPrice');
  });
  it('does not update stock below reserved quantity', async () => {
    const { service, update } = setup('PURCHASE');
    await expect(service.update('service', { stockOnHand: 3 }, actor)).rejects.toThrow('Tồn kho thấp hơn số lượng đã giữ');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects stale quantity edits and audits the accepted old and new totals', async () => {
    const { service, update, tx } = setup('PURCHASE');
    await expect(service.update('service', { stockOnHand: 12, expectedQuantity: 9 }, actor)).rejects.toThrow('Số lượng đã thay đổi');
    expect(update).not.toHaveBeenCalled();
    await service.update('service', { stockOnHand: 12, expectedQuantity: 10 }, actor);
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      metadata: { facilityId: 'facility', field: 'stockOnHand', before: 10, after: 12 },
    }) });
  });

  it('enforces peak overlapping rental commitments instead of summing sequential rentals', async () => {
    const { service, update, tx } = setup('RENTAL');
    tx.reservationService.findMany.mockResolvedValue([
      { quantity: 4, serviceStartDate: new Date('2099-01-01'), serviceEndDate: new Date('2099-01-03') },
      { quantity: 3, serviceStartDate: new Date('2099-01-02'), serviceEndDate: new Date('2099-01-04') },
      { quantity: 5, serviceStartDate: new Date('2099-01-04'), serviceEndDate: new Date('2099-01-05') },
    ] as never);
    await expect(service.update('service', { rentalCapacity: 6 }, actor)).rejects.toThrow('thấp hơn số lượng đã đặt đồng thời');
    expect(update).not.toHaveBeenCalled();
    await expect(service.update('service', { rentalCapacity: 7 }, actor)).resolves.toMatchObject({ rentalCapacity: 7 });
  });

  it('keeps historical units separate from current stock and rental counts', async () => {
    const { service, tx } = setup('PURCHASE');
    const line = (kind: string, unit: string | null, quantity: number) => ({
      additionalServiceId: 'service', serviceKindSnapshot: kind, quantity,
      reservation: { facilityId: 'facility', quoteSnapshot: { services: [{ serviceId: 'service', physicalUnit: unit }] } },
    });
    tx.reservationService.findMany.mockResolvedValue([
      line('PURCHASE', 'thùng', 4), line('PURCHASE', 'thùng', 3),
      line('PURCHASE', 'bộ', 2), line('PURCHASE', null, 1), line('RENTAL', 'bộ', 10),
    ] as never);
    expect(await service.managerList(actor)).toMatchObject([{
      availableQuantity: 6, completedRentalCount: 1,
      soldByUnit: [{ unit: 'thùng', quantity: 7 }, { unit: 'bộ', quantity: 2 }, { unit: null, quantity: 1 }],
    }]);
    expect(tx.reservationService.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reservation: { status: 'CONFIRMED' },
        AND: [{ OR: [{ OR: [{ serviceFacilityId: 'facility' }, { serviceFacilityId: null, reservation: { facilityId: 'facility' } }] }] }],
        OR: expect.arrayContaining([expect.objectContaining({ serviceKindSnapshot: 'PURCHASE', fulfillmentStatus: 'FULFILLED' })]),
      }),
    }));
  });

  it('reports remaining purchase stock in the approved configuration during a review', async () => {
    const { service, tx } = setup('RENTAL');
    const [offer] = await tx.facilityServiceOffering.findMany();
    tx.facilityServiceOffering.findMany.mockResolvedValue([{
      ...offer,
      isActive: false,
      stockOnHand: 10,
      additionalService: { ...offer.additionalService, isActive: false },
      configurationReview: { before: { kind: 'PURCHASE', billingUnit: 'ONE_TIME' } },
    } as typeof offer]);

    expect(await service.managerList(actor)).toMatchObject([{
      kind: 'PURCHASE', stockOnHand: 10, reservedQuantity: 4, availableQuantity: 6,
    }]);
  });

});
