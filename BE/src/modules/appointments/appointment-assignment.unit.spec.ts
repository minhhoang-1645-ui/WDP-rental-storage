import { describe, expect, it, vi } from 'vitest';
import { AppointmentsService } from './appointments.service.js';
import { ManagerAppointmentsController } from './manager-appointments.controller.js';
import { StaffAppointmentsController } from './staff-appointments.controller.js';
import type { PublicUser, AuthenticatedRequest } from '../auth/auth.types.js';

const staff = { id: 'staff-a', role: 'STAFF', fullName: 'Nhân viên A' } as PublicUser;
const other = { ...staff, id: 'staff-b', fullName: 'Nhân viên B' };
const manager = { id: 'manager', role: 'MANAGER' } as PublicUser;
const query = { page: 1, limit: 20 };

function setup() {
  const now = new Date();
  const make = (id: string, assignedStaffUserId: string | null, status = 'CONFIRMED', completedByUserId: string | null = null) => ({
    id, appointmentCode: id, status, assignedStaffUserId, completedByUserId,
    assignedStaff: assignedStaffUserId ? { id: assignedStaffUserId, fullName: assignedStaffUserId, accountStatus: 'ACTIVE' } : null,
    scheduledAt: now, createdAt: now, updatedAt: now,
    reservation: { id: 'reservation', contracts: [], customer: { id: 'customer', fullName: 'Khách thuê' } },
  });
  const records = [make('unassigned', null), make('mine', staff.id), make('other', other.id), make('legacy-mine', null, 'COMPLETED', staff.id), make('legacy-other', null, 'COMPLETED', other.id)];
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]: [string, any]) =>
    key === 'AND' ? value.every((clause: any) => matches(row, clause)) : key === 'OR' ? value.some((clause: any) => matches(row, clause)) : row[key] === value);
  const model = {
    findFirst: vi.fn(async ({ where }) => records.find(row => matches(row, where)) ?? null),
    findUnique: vi.fn(async ({ where }) => records.find(row => row.id === where.id) ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }) => records.find(row => row.id === where.id)!),
    findMany: vi.fn(async ({ where, skip, take }) => records.filter(row => matches(row, where)).slice(skip, skip + take)),
    count: vi.fn(async ({ where }) => records.filter(row => matches(row, where)).length),
    update: vi.fn(async ({ where, data }) => {
      const row = records.find(row => row.id === where.id)!;
      return Object.assign(row, data, { assignedStaff: { id: data.assignedStaffUserId, fullName: data.assignedStaffUserId, accountStatus: 'ACTIVE' } });
    }),
  };
  const tx = { handoverAppointment: model, $queryRaw: vi.fn(), user: { findUnique: vi.fn(async ({ where }) => ({ id: where.id, role: 'STAFF', accountStatus: 'ACTIVE' })) } };
  const db = { ...tx, $transaction: vi.fn(operation => operation(tx)) };
  return { service: new AppointmentsService(db as never, {} as never, {} as never), records, model, tx };
}

describe('Handover staff assignment', () => {
  it('scopes both Staff controllers before counting/pagination and preserves only their own legacy history', async () => {
    const { service } = setup();
    const direct = new StaffAppointmentsController(service);
    const shared = new ManagerAppointmentsController(service);
    const request = { user: staff } as AuthenticatedRequest;
    expect(await direct.list({ limit: '1' }, request)).toMatchObject({ total: 2, items: [{ id: 'mine' }] });
    expect(await shared.list({ page: '2', limit: '1' }, request)).toMatchObject({ total: 2, items: [{ id: 'legacy-mine' }] });
    expect((await service.listOperationalAppointments(query, manager)).total).toBe(5);
    expect((await service.listOperationalAppointments(query, other)).items.map(row => row.id)).toEqual(['other', 'legacy-other']);
    for (const id of ['unassigned', 'other', 'legacy-other']) {
      await expect(direct.get(id, request)).rejects.toThrow('Không tìm thấy');
      await expect(shared.get(id, request)).rejects.toThrow('Không tìm thấy');
    }
    expect(await shared.get('legacy-mine', request)).toMatchObject({ assignmentStatus: 'UNASSIGNED', assignedStaff: null });
  });

  it('requires an active Staff, Manager role and a current assignment version', async () => {
    const { service, model, tx } = setup();
    await expect(service.assignAppointment('unassigned', { staffUserId: staff.id, expectedAssignedStaffUserId: null }, staff)).rejects.toThrow('quản lý');
    await expect(service.assignAppointment('unassigned', { staffUserId: staff.id }, manager)).rejects.toThrow('phiên bản');
    tx.user.findUnique.mockResolvedValueOnce({ id: staff.id, role: 'STAFF', accountStatus: 'DISABLED' });
    await expect(service.assignAppointment('unassigned', { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('hoạt động');
    tx.user.findUnique.mockResolvedValueOnce({ id: manager.id, role: 'MANAGER', accountStatus: 'ACTIVE' });
    await expect(service.assignAppointment('unassigned', { staffUserId: manager.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('STAFF');
    expect(model.update).not.toHaveBeenCalled();
  });

  it('assigns and reassigns explicitly, blocks stale reassignment and retains assignment audit fields', async () => {
    const { service, model } = setup();
    expect(await service.assignAppointment('unassigned', { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager)).toMatchObject({ assignedStaff: { id: staff.id }, assignmentStatus: 'ASSIGNED', assignedAt: expect.any(String) });
    expect(model.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedStaffUserId: staff.id, assignedByUserId: manager.id, assignedAt: expect.any(Date) } }));
    await expect(service.assignAppointment('unassigned', { staffUserId: other.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('vừa thay đổi');
    await service.assignAppointment('unassigned', { staffUserId: other.id, expectedAssignedStaffUserId: staff.id }, manager);
    expect((await service.listOperationalAppointments(query, staff)).items.map(row => row.id)).not.toContain('unassigned');
    expect((await service.listOperationalAppointments(query, other)).items.map(row => row.id)).toContain('unassigned');
    await service.assignAppointment('unassigned', { staffUserId: other.id, expectedAssignedStaffUserId: staff.id }, manager);
    expect(model.update).toHaveBeenCalledTimes(2);
  });

  it('rejects assignment after completion/cancellation and blocks unassigned or wrong Staff actions', async () => {
    const { service, records, model } = setup();
    records.push({ ...records[0], id: 'cancelled', status: 'CANCELLED' });
    for (const id of ['legacy-mine', 'cancelled']) await expect(service.assignAppointment(id, { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('Chỉ phân công');
    for (const id of ['unassigned', 'other', 'legacy-other']) {
      await expect(service.confirmAppointment(id, staff)).rejects.toThrow('phân công');
      await expect(service.completeHandover(id, {}, staff)).rejects.toThrow('phân công');
    }
    expect((await service.confirmAppointment('mine', staff)).id).toBe('mine');
    expect((await service.completeHandover('legacy-mine', {}, staff)).id).toBe('legacy-mine');
    expect(model.update).not.toHaveBeenCalled();
  });
});
