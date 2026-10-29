import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { UnitStaffService } from './unit-staff.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
const staff = { id: 'staff', role: 'STAFF' } as PublicUser;
const config = (enabled: boolean) => ({ get: () => String(enabled) });
describe('unit responsibility feature gate and ownership', () => {
  it('does not access the new table before the migration is enabled', async () => {
    const db = { unitStaffAssignment: { findMany: vi.fn() } };
    const service = new UnitStaffService(db as never, config(false) as never);
    expect(await service.list(manager)).toMatchObject({ enabled: false, items: [] });
    expect(await service.resolveStaff(db as never, ['unit'])).toBeNull();
    await expect(service.assign('unit', { staffUserId: 'staff', expectedAssignmentId: null }, manager)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.unitStaffAssignment.findMany).not.toHaveBeenCalled();
  });
  it('returns only the authenticated Staff assignments and denies customer/admin assignment', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new UnitStaffService({ unitStaffAssignment: { findMany } } as never, config(true) as never);
    await service.list(staff);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { endedAt: null, staffUserId: 'staff' } }));
    for (const role of ['STAFF', 'CUSTOMER', 'ADMIN']) await expect(service.assign('unit', {}, { id: role, role } as PublicUser)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not arbitrarily give a multi-unit case to one of different responsible staff', async () => {
    const findMany = vi.fn().mockResolvedValue([{ staffUserId: 'a', assignedByUserId: 'manager' }, { staffUserId: 'b', assignedByUserId: 'manager' }]);
    const tx = { unitStaffAssignment: { findMany } };
    const service = new UnitStaffService({} as never, config(true) as never);
    expect(await service.resolveStaff(tx as never, ['unit1', 'unit2'])).toBeNull();
    findMany.mockResolvedValue([{ staffUserId: 'a', assignedByUserId: 'manager' }]);
    expect(await service.resolveStaff(tx as never, ['unit1', 'unit2'])).toBeNull();
    expect(await service.resolveStaff(tx as never, ['unit1', 'unit1'])).toMatchObject({ staffUserId: 'a' });
  });
  it('preserves the old assignment history and rejects stale reassignments', async () => {
    const current = { id: 'old', staffUserId: 'previous' };
    const tx = { $queryRaw: vi.fn(), storageUnit: { findUnique: vi.fn().mockResolvedValue({ id: 'unit' }) }, user: { findFirst: vi.fn().mockResolvedValue({ id: 'staff' }) }, unitStaffAssignment: { findFirst: vi.fn().mockResolvedValue(current), update: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'new', staffUserId: 'staff' }) }, supportRequest: { updateMany: vi.fn() }, maintenanceRequest: { updateMany: vi.fn() }, stockMovement: { updateMany: vi.fn() } };
    const db = { $transaction: vi.fn(operation => operation(tx)) };
    const service = new UnitStaffService(db as never, config(true) as never);
    await expect(service.assign('unit', { staffUserId: 'staff', expectedAssignmentId: null }, manager)).rejects.toThrow('Phân công đã thay đổi');
    expect(tx.unitStaffAssignment.create).not.toHaveBeenCalled();
    expect(await service.assign('unit', { staffUserId: 'staff', expectedAssignmentId: 'old' }, manager)).toMatchObject({ id: 'new' });
    expect(tx.unitStaffAssignment.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { endedAt: expect.any(Date) } });
    expect(tx.stockMovement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignedStaffUserId: null, status: 'REQUESTED' }) }));
  });
});
