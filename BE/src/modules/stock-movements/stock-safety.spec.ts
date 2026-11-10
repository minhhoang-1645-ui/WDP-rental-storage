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
  const tx = { $queryRaw: vi.fn(), rentalContract: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', reservationUnit: { storageUnit: { id: 'unit', unitNumber: 'A01', floor: '1', zone: 'A' } } }) }, stockMovement: { findFirst: vi.fn().mockResolvedValue({ id: row.id }), findUniqueOrThrow: vi.fn(async () => row), update: vi.fn(async ({ data }) => Object.assign(row, data)) }, stockMovementLine: { findMany: vi.fn().mockResolvedValue(lines), update: vi.fn() }, storedItem: { updateMany: vi.fn(async ({ where, data }) => { if (balance < where.balance.gte) return { count: 0 }; balance -= data.balance.decrement; return { count: 1 }; }), update: vi.fn(async ({ data }) => { balance += data.balance.increment; }) } };
  const db = { $transaction: vi.fn(async operation => { const before = balance; try { return await operation(tx); } catch (error) { balance = before; throw error; } }) };
  return { service: new StockMovementsService(db as never), tx, balance: () => balance };
}
describe('stock movement safety with stubbed transaction', () => {
  it('creates pending requests without assigning the unit owner automatically', async () => {
    const stamp = new Date();
    const movement = { id: 'movement', lines: [], createdAt: stamp, updatedAt: stamp };
    const tx = { rentalContract: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      stockMovement: { create: vi.fn().mockResolvedValue(movement), findUniqueOrThrow: vi.fn().mockResolvedValue(movement) },
      storedItem: { create: vi.fn().mockResolvedValue({ id: 'item' }) }, stockMovementLine: { create: vi.fn() } };
    const db = { rentalContract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract', status: 'ACTIVE' }) }, stockMovement: { findUnique: vi.fn().mockResolvedValue(null) }, $transaction: vi.fn(operation => operation(tx)) };
    const responsibility = { resolveStaff: vi.fn() };
    const service = new StockMovementsService(db as never, responsibility as never);
    await service.create({ id: 'customer', role: 'CUSTOMER' } as PublicUser, { rentalContractId: 'contract', type: 'IN', lines: [{ name: 'Thùng', unit: 'thùng', quantity: 1 }] }, 'create-manual-assignment');
    expect(responsibility.resolveStaff).not.toHaveBeenCalled();
    expect(tx.stockMovement.create.mock.calls[0][0].data).not.toHaveProperty('assignedStaffUserId');
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
    await expect(state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 4 }, { lineId: 'line1', actualQty: 4 }] }, staff)).rejects.toThrow('Không đủ tồn');
    expect(state.balance()).toBe(6);
    expect(state.tx.stockMovement.update).not.toHaveBeenCalled();
  });
  it('subtracts valid actual quantities and does not subtract again on retry', async () => {
    const state = setup([4]);
    await state.service.complete('movement', { note: 'Khách lấy ít hơn yêu cầu', lines: [{ lineId: 'line0', actualQty: 2 }] }, staff);
    expect(state.balance()).toBe(4);
    await state.service.complete('movement', {}, staff);
    expect(state.balance()).toBe(4);
    expect(state.tx.storedItem.updateMany).toHaveBeenCalledTimes(1);
  });
  it('increments IN only when completing, once', async () => {
    const state = setup([10], 0, 'IN');
    await state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 10 }] }, staff);
    await state.service.complete('movement', {}, staff);
    expect(state.balance()).toBe(10);
  });
  it('completes every counted line once in a multi-line movement', async () => {
    const state = setup([2, 3], 8);
    await state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 2 }, { lineId: 'line1', actualQty: 3 }] }, staff);
    expect(state.balance()).toBe(3);
    expect(state.tx.stockMovementLine.update).toHaveBeenCalledTimes(2);
    await state.service.complete('movement', {}, staff);
    expect(state.balance()).toBe(3);
    expect(state.tx.stockMovementLine.update).toHaveBeenCalledTimes(2);
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
    await expect(state.service.complete('movement', { lines: [{ lineId: 'foreign', actualQty: 1 }] }, staff)).rejects.toThrow('tất cả dòng hàng');
    expect(state.balance()).toBe(6);
  });
  it('does not reveal a different customer movement through an idempotency collision', async () => {
    const db = { rentalContract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract', status: 'ACTIVE' }) }, stockMovement: { findUnique: vi.fn().mockResolvedValue({ customerUserId: 'other', rentalContractId: 'other-contract', type: 'IN', note: null, lines: [] }) } };
    const service = new StockMovementsService(db as never);
    await expect(service.create({ id: 'customer', role: 'CUSTOMER' } as PublicUser, { rentalContractId: 'contract', type: 'IN', lines: [{ name: 'Thùng', unit: 'thùng', quantity: 1 }] }, 'collision-key')).rejects.toThrow('Idempotency-Key');
  });
  it('scopes Staff operational reads without assigning pending movements', async () => {
    const stockMovement = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    const recover = vi.fn();
    const service = new StockMovementsService({ stockMovement } as never, { recoverPendingStockMovements: recover } as never);
    const controller = new ManagerStockMovementsController(service);
    await controller.list({ user: staff } as AuthenticatedRequest, {});
    expect(stockMovement.findMany.mock.calls[0][0].where).toMatchObject({ assignedStaffUserId: staff.id });
    expect(recover).not.toHaveBeenCalled();
  });
  it.each([undefined, [], [{ lineId: 'line0' }], [{ lineId: 'line0', actualQty: '' }], [{ lineId: 'line0', actualQty: null }]])('rejects missing or blank counts: %j', async lines => {
    const state = setup([4]);
    await expect(state.service.complete('movement', { lines }, staff)).rejects.toThrow();
    expect(state.balance()).toBe(6);
    expect(state.tx.stockMovement.update).not.toHaveBeenCalled();
  });
  it('requires a discrepancy reason and accepts an explicitly counted zero', async () => {
    const state = setup([4]);
    await expect(state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 0 }] }, staff)).rejects.toThrow('chênh lệch');
    const result = await state.service.complete('movement', { note: 'Khách chưa mang hàng đến', lines: [{ lineId: 'line0', actualQty: 0 }] }, staff);
    expect(result.status).toBe('COMPLETED');
    expect(state.balance()).toBe(6);
    expect(state.tx.stockMovement.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedByUserId: staff.id, completedAt: expect.any(Date), storageUnitSnapshot: expect.objectContaining({ unitNumber: 'A01' }) }) }));
  });
  it('rejects duplicate counts and partial multi-line submissions', async () => {
    const state = setup([2, 2]);
    await expect(state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 2 }] }, staff)).rejects.toThrow('tất cả dòng hàng');
    await expect(state.service.complete('movement', { lines: [{ lineId: 'line0', actualQty: 2 }, { lineId: 'line0', actualQty: 2 }] }, staff)).rejects.toThrow('trùng');
    expect(state.balance()).toBe(6);
  });
});
