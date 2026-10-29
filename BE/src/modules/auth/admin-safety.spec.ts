import { describe, expect, it } from 'vitest';
import { MemoryUserRepository } from '../users/user.repository.js';

describe('administrator account status changes', () => {
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
