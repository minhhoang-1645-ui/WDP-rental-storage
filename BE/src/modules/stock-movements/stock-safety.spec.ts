import { describe, expect, it, vi } from 'vitest';
import { StockMovementsService } from './stock-movements.service.js';
import { ManagerStockMovementsController } from './manager-stock-movements.controller.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import type { PublicUser } from '../auth/auth.types.js';

const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
function setup(quantities: number[], initial = 6, type = 'OUT') {
  let balance = initial;
  const item = { id: 'item', itemCode: 'ITEM', name: 'Thùng', unit: 'thùng', balance: initial };
  const lines = quantities.map((quantity, i) => ({ id: 'line' + i, storedItemId: 'item', requestedQty: quantity, actualQty: null, storedItem: item, note: null }));
  const row = { id: 'movement', movementCode: 'MOV', status: 'ASSIGNED', type, assignedStaffUserId: 'staff', createdAt: new Date(), updatedAt: new Date(), lines };
  const tx = { $queryRaw: vi.fn(), rentalContract: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) }, stockMovement: { findFirst: vi.fn().mockResolvedValue({ id: row.id }), findUniqueOrThrow: vi.fn(async () => row), update: vi.fn(async ({ data }) => Object.assign(row, data)) }, stockMovementLine: { findMany: vi.fn().mockResolvedValue(lines), update: vi.fn() }, storedItem: { updateMany: vi.fn(async ({ where, data }) => { if (balance < where.balance.gte) return { count: 0 }; balance -= data.balance.decrement; return { count: 1 }; }), update: vi.fn(async ({ data }) => { balance += data.balance.increment; }) } };
  const db = { $transaction: vi.fn(async operation => { const before = balance; try { return await operation(tx); } catch (error) { balance = before; throw error; } }) };
  return { service: new StockMovementsService(db as never), tx, balance: () => balance };
}
describe('stock movement safety with stubbed transaction', () => {
  it('autoassigns new stock requests using the current allocation when a transfer happened between contract reads', async () => {
    const stamp = new Date();
    const movement = { id: 'movement', movementCode: 'MOV', status: 'ASSIGNED', type: 'IN', lines: [], createdAt: stamp, updatedAt: stamp };
    const tx = { rentalContract: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', reservationUnit: { storageUnitId: 'destination' } }) },
      stockMovement: { create: vi.fn().mockResolvedValue(movement), findUniqueOrThrow: vi.fn().mockResolvedValue(movement) },
      storedItem: { create: vi.fn().mockResolvedValue({ id: 'item' }) }, stockMovementLine: { create: vi.fn() } };
    const db = { rentalContract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract', status: 'ACTIVE', reservationUnit: { storageUnitId: 'old-source' } }) }, stockMovement: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn(operation => operation(tx)) };
    const responsibility = { resolveStaff: vi.fn().mockResolvedValue({ staffUserId: 'destination-owner', assignedByUserId: 'manager' }) };
    const service = new StockMovementsService(db as never, responsibility as never);
    await service.create({ id: 'customer', role: 'CUSTOMER' } as PublicUser, { rentalContractId: 'contract', type: 'IN', lines: [{ name: 'Thùng', unit: 'thùng', quantity: 1 }] }, 'create-after-transfer');
    expect(responsibility.resolveStaff).toHaveBeenCalledWith(tx, ['destination']);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedStaffUserId: 'destination-owner', status: 'ASSIGNED' }) }));
  });

  it('rejects new scheduled movements in the past or outside the Vietnam rental dates', async () => {
    const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const contract = { id: 'contract', status: 'ACTIVE', startDate: new Date(start), endDate: new Date(end) };
    const create = vi.fn();
    const tx = { rentalContract: { findUnique: vi.fn().mockResolvedValue(contract) }, stockMovement: { create } };
    const db = { $transaction: vi.fn(operation => operation(tx)), rentalContract: { findFirst: vi.fn().mockResolvedValue(contract) }, stockMovement: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new StockMovementsService(db as never);
    const customer = { id: 'customer', role: 'CUSTOMER' } as PublicUser;
    const input = { rentalContractId: contract.id, type: 'IN', lines: [{ name: 'Hồ sơ', unit: 'thùng', quantity: 1 }] };
    const submit = (scheduledAt: string) => service.create(customer, { ...input, scheduledAt }, 'schedule-check');

    await expect(submit(new Date(Date.now() - 60000).toISOString())).rejects.toThrow('phải ở tương lai');
    await expect(submit(new Date(Date.parse(`${start}T00:00:00+07:00`) - 60000).toISOString())).rejects.toThrow('phải nằm trong kỳ thuê');
    await expect(submit(`${end}T00:00:00+07:00`)).rejects.toThrow('phải nằm trong kỳ thuê');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects aggregate overdraw when two lines reference the same stored item', async () => {
    const state = setup([4, 4]);
    await expect(state.service.complete('movement', {}, staff)).rejects.toThrow('Không đủ tồn');
    expect(state.balance()).toBe(6);
    expect(state.tx.stockMovement.update).not.toHaveBeenCalled();
  });
  it('subtracts valid actual quantities and does not subtract again on retry', async () => {
    const state = setup([4]);
    await state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 2 }] }, staff);
    expect(state.balance()).toBe(4);
    await state.service.complete('movement', {}, staff);
    expect(state.balance()).toBe(4);
    expect(state.tx.storedItem.updateMany).toHaveBeenCalledTimes(1);
  });
  it('increments IN only when completing, once', async () => {
    const state = setup([10], 0, 'IN');
    await state.service.complete('movement', {}, staff);
    await state.service.complete('movement', {}, staff);
    expect(state.balance()).toBe(10);
  });
  it('cannot change inventory after the contract has completed', async () => {
    const state = setup([1]);
    state.tx.rentalContract.findUnique.mockResolvedValue({ status: 'COMPLETED' });
    await expect(state.service.complete('movement', {}, staff)).rejects.toThrow('Hợp đồng đã kết thúc');
    expect(state.balance()).toBe(6);
  });
  it('denies another Staff, non-Staff, and foreign line IDs', async () => {
    const state = setup([1]);
    await expect(state.service.complete('movement', {}, { ...staff, id: 'other' })).rejects.toThrow('được giao');
    await expect(state.service.complete('movement', {}, { ...staff, role: 'MANAGER' })).rejects.toThrow('được giao');
    await expect(state.service.complete('movement', { lines: [{ lineId: 'foreign', actualQty: 1 }] }, staff)).rejects.toThrow('không thuộc phiếu');
    expect(state.balance()).toBe(6);
  });
  it('does not reveal a different customer movement through an idempotency collision', async () => {
    const db = { rentalContract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract', status: 'ACTIVE' }) }, stockMovement: { findUnique: vi.fn().mockResolvedValue({ customerUserId: 'other', rentalContractId: 'other-contract', type: 'IN', note: null, lines: [] }) } };
    const service = new StockMovementsService(db as never);
    await expect(service.create({ id: 'customer', role: 'CUSTOMER' } as PublicUser, { rentalContractId: 'contract', type: 'IN', lines: [{ name: 'Thùng', unit: 'thùng', quantity: 1 }] }, 'collision-key')).rejects.toThrow('Idempotency-Key');
  });
  it('recovers pending movements before the Staff portal reads them via its operational routes', async () => {
    const row = {
      id: 'movement',
      status: 'REQUESTED',
      lines: [],
      assignedStaff: null as { id: string } | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const stockMovement = {
      findFirst: vi.fn(async () => row),
      findMany: vi.fn(async () => [row]),
      count: vi.fn(async () => 1),
    };
    const recover = vi.fn(async (staffId: string, reference?: string) => {
      if (staffId === staff.id && (!reference || reference === row.id)) {
        row.status = 'ASSIGNED';
        row.assignedStaff = { id: staffId };
      }
    });
    const service = new StockMovementsService({ stockMovement } as never, { recoverPendingStockMovements: recover } as never);
    const controller = new ManagerStockMovementsController(service);
    const managerRequest = { user: { id: 'manager', role: 'MANAGER' } } as AuthenticatedRequest;
    const staffRequest = { user: staff } as AuthenticatedRequest;

    await expect(controller.get(managerRequest, row.id)).resolves.toMatchObject({ status: 'REQUESTED' });
    expect(recover).not.toHaveBeenCalled();
    await expect(controller.get(staffRequest, row.id)).resolves.toMatchObject({ status: 'ASSIGNED', assignedStaff: { id: staff.id } });
    expect(recover).toHaveBeenCalledWith(staff.id, row.id);
    await controller.list(staffRequest, {});
    expect(recover).toHaveBeenLastCalledWith(staff.id);
  });
});
