import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
import { StaffDirectoryController } from '../auth/staff-directory.controller.js';

describe('Manager assignment preserves Staff execution boundary', () => {
  const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
  it('lists only active Staff for assignment', async () => {
    const users = { count: vi.fn().mockResolvedValue(1), list: vi.fn().mockResolvedValue([{ id: 'staff', fullName: 'Nhân viên', email: 'staff@example.test' }]) };
    const controller = new StaffDirectoryController(users as never);
    expect((await controller.list()).items).toHaveLength(1);
    expect(users.count).toHaveBeenCalledWith({ role: 'STAFF', accountStatus: 'ACTIVE' });
    expect(users.list).toHaveBeenCalledWith(0, 100, { role: 'STAFF', accountStatus: 'ACTIVE' });
  });
  it('lets Manager assign and reassign only unfinished work to active Staff', async () => {
    const stamp = new Date();
    const row = { id: 'movement', status: 'REQUESTED', lines: [], createdAt: stamp, updatedAt: stamp };
    const update = vi.fn(async ({ data }) => Object.assign(row, data));
    const tx = { $queryRaw: vi.fn(), stockMovement: { findFirst: vi.fn().mockResolvedValue(row), findUniqueOrThrow: vi.fn().mockResolvedValue(row), update } };
    const user = { findFirst: vi.fn(({ where }) => Promise.resolve(where.id === 'disabled' ? null : { id: where.id })) };
    const service = new StockMovementsService({ user, $transaction: vi.fn(operation => operation(tx)) } as never);
    expect((await service.assign('movement', 'staff-a', manager)).status).toBe('ASSIGNED');
    await service.assign('movement', 'staff-b', manager);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedStaffUserId: 'staff-b', assignedByUserId: manager.id }) }));
    expect(user.findFirst).toHaveBeenCalledWith({ where: { id: 'staff-a', role: 'STAFF', accountStatus: 'ACTIVE' }, select: { id: true } });
    await expect(service.assign('movement', 'disabled', manager)).rejects.toThrow('đang hoạt động');
    await expect(service.complete('movement', {}, manager)).rejects.toThrow('nhân viên được giao');
    row.status = 'COMPLETED';
    await expect(service.assign('movement', 'staff-a', manager)).rejects.toThrow('đang chờ');
    expect(update).toHaveBeenCalledTimes(2);
  });
});
