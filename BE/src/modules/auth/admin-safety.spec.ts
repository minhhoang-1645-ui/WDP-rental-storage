import { describe, expect, it } from 'vitest';
import { MemoryUserRepository } from '../users/user.repository.js';
import { AdminUsersController } from './admin-users.controller.js';

describe('administrator account status changes', () => {
  it('sorts matching accounts before slicing pages and rejects unsupported sort values', async () => {
    const users = new MemoryUserRepository();
    const controller = new AdminUsersController(users, {} as never);
    for (const [fullName, role] of [['Zoe', 'STAFF'], ['An', 'STAFF'], ['Be', 'STAFF'], ['Anh', 'CUSTOMER']] as const) {
      await users.create({ fullName, role, email: fullName + '@example.test', phone: '', passwordHash: 'test' });
    }
    const result = await controller.list('2', '1', undefined, 'STAFF', undefined, 'name-asc');
    expect(result.total).toBe(3);
    expect(result.items.map(user => user.fullName)).toEqual(['Be']);
    await expect(controller.list('1', '1', undefined, undefined, undefined, 'bad')).rejects.toThrow('sort không hợp lệ');
  });
  it('returns the existing account update time without exposing authentication data', async () => {
    const row = { id: 'old-user', fullName: 'Nhân viên', email: 'staff@example.test', phone: '0901234567', role: 'STAFF', accountStatus: 'DISABLED', passwordHash: 'must-not-leak', createdAt: new Date('2020-01-01'), updatedAt: new Date('2030-01-01') };
    const users = { list: async () => [row], count: async () => 1, findById: async () => row };
    const controller = new AdminUsersController(users as never, {} as never);
    const list = await controller.list();
    expect(list.items[0].updatedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(await controller.get(row.id)).toEqual(list.items[0]);
    expect(list.items[0]).not.toHaveProperty('passwordHash');
  });
  it('rejects self-disable and a non-administrator actor', async () => {
    const users = new MemoryUserRepository();
    const create = (role: 'ADMIN' | 'STAFF') => users.create({ fullName: role, email: role + '@example.test', phone: '', passwordHash: 'local-only', role });
    const admin = await create('ADMIN'), staff = await create('STAFF');
    await expect(users.updateStatus(admin.id, 'DISABLED', admin.id)).rejects.toThrow('chính tài khoản');
    await expect(users.updateStatus(admin.id, 'DISABLED', staff.id)).rejects.toThrow('không còn quyền');
    expect((await users.findById(admin.id))?.accountStatus).toBe('ACTIVE');
  });
  it('does not let two administrators disable each other concurrently', async () => {
    const users = new MemoryUserRepository();
    const base = { fullName: 'Admin', phone: '', passwordHash: 'local-only', role: 'ADMIN' as const };
    const a = await users.create({ ...base, email: 'a@example.test' }), b = await users.create({ ...base, email: 'b@example.test' });
    const result = await Promise.allSettled([users.updateStatus(b.id, 'DISABLED', a.id), users.updateStatus(a.id, 'DISABLED', b.id)]);
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(await users.count({ role: 'ADMIN', accountStatus: 'ACTIVE' })).toBe(1);
  });
});
