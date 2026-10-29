import { describe, expect, it, vi } from 'vitest';
import { StockMovementsService } from './stock-movements.service.js';
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
});
