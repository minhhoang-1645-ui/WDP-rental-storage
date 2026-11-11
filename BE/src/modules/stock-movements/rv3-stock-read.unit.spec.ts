import { describe, expect, it, vi } from 'vitest';
import { StockMovementsService } from './stock-movements.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const staff = { id: 'staff-a', role: 'STAFF' } as PublicUser;
const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
const unit = { id: 'unit-b', unitNumber: 'B02', floor: '1', zone: 'B' };

describe('RV3 stored items and historical location', () => {
  it('returns the current allocation after a transfer and applies Staff scope alongside search/unit filters', async () => {
    const stored = { id: 'item', name: 'Vali', unit: 'cái', balance: 2, customer: { id: 'customer', fullName: 'Khách thuê' }, rentalContract: { id: 'contract', contractCode: 'C01', reservationUnit: { storageUnit: unit } } };
    const findMany = vi.fn().mockResolvedValue([stored]);
    const count = vi.fn().mockResolvedValue(1);
    const service = new StockMovementsService({ storedItem: { findMany, count } } as never, { enabled: () => true } as never);
    const result = await service.listOperationalStoredItems(staff, { page: 1, limit: 20, search: 'Vali', storageUnitId: 'unit-b' });
    expect(result.items[0]).toMatchObject({ currentStorageUnit: unit, customer: { fullName: 'Khách thuê' }, balance: 2 });
    const where = findMany.mock.calls[0][0].where;
    expect(where.rentalContract.AND).toEqual([
      { OR: [
        { stockMovements: { some: { assignedStaffUserId: staff.id } } },
        { reservationUnit: { storageUnit: { staffAssignments: { some: { staffUserId: staff.id, endedAt: null } } } } },
      ] },
      { reservationUnit: { storageUnitId: unit.id } },
    ]);
    expect(where.OR).toHaveLength(3);
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('does not query feature-gated assignments when unavailable and gives Manager a read-only list', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new StockMovementsService({ storedItem: { findMany, count: vi.fn().mockResolvedValue(0) } } as never);
    await service.listOperationalStoredItems(staff, { page: 1, limit: 20 });
    expect(findMany.mock.calls[0][0].where.rentalContract.AND[0].OR).toEqual([{ stockMovements: { some: { assignedStaffUserId: staff.id } } }]);
    await service.listOperationalStoredItems(manager, { page: 1, limit: 20 });
    expect(findMany.mock.calls[1][0].where.rentalContract.AND).toEqual([{}]);
    await expect(service.complete('movement', {}, manager)).rejects.toThrow('được giao');
  });

  it('retains the original completion snapshot while the contract moves to a new unit', async () => {
    const original = { id: 'unit-a', unitNumber: 'A01', floor: 'G', zone: 'A' };
    const stamp = new Date();
    const movement = { id: 'movement', status: 'COMPLETED', storageUnitSnapshot: original, rentalContract: { reservationUnit: { storageUnit: unit } }, lines: [], createdAt: stamp, updatedAt: stamp };
    const service = new StockMovementsService({ stockMovement: { findFirst: vi.fn().mockResolvedValue(movement) } } as never);
    expect(await service.getManager('movement', manager)).toMatchObject({ currentStorageUnit: unit, storageUnitAtCompletion: original });
    movement.storageUnitSnapshot = null as never;
    expect(await service.getManager('movement', manager)).toMatchObject({ currentStorageUnit: unit, storageUnitAtCompletion: null });
  });

  it('keeps the Customer stored-item array contract and includes the real unit relation', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new StockMovementsService({ storedItem: { findMany } } as never);
    expect(await service.listStoredItems('customer', 'contract')).toEqual([]);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { customerUserId: 'customer', balance: { gt: 0 } },
      select: { rentalContract: { select: { reservationUnit: { select: { storageUnit: { select: { unitNumber: true } } } } } } },
    });
  });

  it('rejects nonstandard units on new goods and keeps historical units on existing goods', async () => {
    const stamp = new Date();
    const existing = { id: 'old-item', unit: 'bao tải cũ' };
    const movement = { id: 'movement', lines: [], createdAt: stamp, updatedAt: stamp };
    const tx = {
      $queryRaw: vi.fn(), rentalContract: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: new Date('2035-01-01'), reservationUnit: { storageUnitId: 'unit', storageUnit: { unitNumber: 'A01', floor: '1', zone: 'A' } } }) },
      stockMovement: { create: vi.fn().mockResolvedValue(movement), findUniqueOrThrow: vi.fn().mockResolvedValue(movement) },
      storedItem: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() },
      stockMovementLine: { create: vi.fn() },
    };
    const db = { rentalContract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract', status: 'ACTIVE' }) }, stockMovement: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn(operation => operation(tx)) };
    const service = new StockMovementsService(db as never);
    const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
    await expect(service.create(customer, { rentalContractId: 'contract', type: 'IN', lines: [{ name: 'Hàng mới', unit: 'đơn vị tùy ý', quantity: 1 }] }, 'units-new-test')).rejects.toThrow('danh mục chuẩn');
    await expect(service.create(customer, { rentalContractId: 'contract', type: 'IN', lines: [{ storedItemId: existing.id, quantity: 1 }] }, 'units-old-test')).resolves.toMatchObject({ id: movement.id });
    expect(tx.storedItem.create).not.toHaveBeenCalled();
  });
});
