import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { StockMovementsService } from './stock-movements.service.js';

const customer = { id: 'customer', role: 'STORAGE_CUSTOMER' } as PublicUser;
const manager = { id: 'manager', role: 'FACILITY_MANAGER', selectedFacilityId: 'A' } as PublicUser;
const stamp = new Date('2026-01-01');
const fixture = {
  id: 'movement', movementCode: 'OLD', type: 'OUT', lines: [], status: 'COMPLETED',
  storageUnitId: 'old-unit', unitCodeSnapshot: 'OLD-01', floorSnapshot: '1', zoneSnapshot: 'A',
  storageUnitSnapshot: { unitNumber: 'OLD-01' }, locationRecordedAt: stamp,
};

describe('Read-only personal stock movement history', () => {
  it('reads only the owner’s historical evidence without looking up current balances or allocations', async () => {
    const findFirst = vi.fn(async ({ where }) => where.customerUserId === customer.id ? fixture : null);
    const service = new StockMovementsService({ stockMovement: { findFirst } } as never);
    expect(await service.getCustomer(customer, 'OLD')).toMatchObject({
      readOnly: true, storageUnit: { unitNumber: 'OLD-01' }, locationEvidence: 'RECORDED',
    });
    expect(findFirst.mock.calls[0][0]).toMatchObject({ where: { customerUserId: 'customer', rentalContract: { reservation: { customerId: 'customer' } }, OR: [{ id: 'OLD' }, { movementCode: 'OLD' }] } });
    expect(JSON.stringify(findFirst.mock.calls[0][0].select)).not.toMatch(/balance|reservationUnit/);
    await expect(service.getCustomer({ ...customer, id: 'other' }, 'OLD')).rejects.toMatchObject({ status: 404 });
  });

  it('filters Manager history by their selected active facility grant and avoids guessing missing snapshots', async () => {
    const findFirst = vi.fn(async ({ where }) =>
      where.rentalContract.reservation.facility.id === 'A' ? { ...fixture, locationRecordedAt: null } : null);
    const service = new StockMovementsService({ stockMovement: { findFirst } } as never);
    expect(await service.getManager(manager, 'movement')).toMatchObject({
      readOnly: true, storageUnit: null, locationEvidence: 'UNKNOWN_LEGACY',
    });
    expect(findFirst.mock.calls[0][0].where.rentalContract.reservation.facility).toMatchObject({
      id: 'A', facilityAccess: { some: { userId: manager.id, revokedAt: null, user: { role: manager.role, accountStatus: 'ACTIVE' } } },
    });
    await expect(service.getManager({ ...manager, selectedFacilityId: 'B' }, 'movement')).rejects.toMatchObject({ status: 404 });
    expect(() => service.getManager({ ...manager, role: 'FACILITY_STAFF' }, 'movement')).toThrow();
  });
});
