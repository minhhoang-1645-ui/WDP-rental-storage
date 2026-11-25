import { describe, expect, it, vi } from 'vitest';
import { AppointmentsService } from './appointments.service.js';
import { ManagerAppointmentsController } from './manager-appointments.controller.js';
import { StaffAppointmentsController } from './staff-appointments.controller.js';
import type { PublicUser, AuthenticatedRequest } from '../auth/auth.types.js';

const staff = { id: 'staff-a', role: 'FACILITY_STAFF', fullName: 'Nhân viên A' } as PublicUser;
const other = { ...staff, id: 'staff-b', fullName: 'Nhân viên B' };
const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
const query = { page: 1, limit: 20 };

function setup() {
  const now = new Date();
  const make = (id: string, assignedStaffUserId: string | null, status = 'CONFIRMED', completedByUserId: string | null = null) => ({
    id, reservationId: 'reservation', appointmentCode: id, status, assignedStaffUserId, completedByUserId,
    assignedStaff: assignedStaffUserId ? { id: assignedStaffUserId, fullName: assignedStaffUserId, accountStatus: 'ACTIVE' } : null,
    scheduledAt: now, createdAt: now, updatedAt: now,
    reservation: { id: 'reservation', invoices: [], contracts: [], customer: { id: 'customer', fullName: 'Khách thuê' } },
  });
  const records = [make('unassigned', null), make('mine', staff.id), make('other', other.id), make('legacy-mine', null, 'COMPLETED', staff.id), make('legacy-other', null, 'COMPLETED', other.id)];
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]: [string, any]) =>
    key === 'AND' ? value.every((clause: any) => matches(row, clause))
      : key === 'OR' ? value.some((clause: any) => matches(row, clause))
      : key === 'reservation' && value?.facility?.facilityAccess?.some
        ? value.facility.facilityAccess.some.revokedAt === null &&
          [staff.id, other.id, manager.id].includes(value.facility.facilityAccess.some.userId)
      : row[key] === value);
  const model = {
    findFirst: vi.fn(async ({ where }) => records.find(row => matches(row, where)) ?? null),
    findUnique: vi.fn(async ({ where }) => records.find(row => row.id === where.id) ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }) => records.find(row => row.id === where.id)!),
    findMany: vi.fn(async ({ where, skip, take }: { where: unknown; skip: number; take: number; orderBy?: unknown }) => records.filter(row => matches(row, where)).slice(skip, skip + take)),
    count: vi.fn(async ({ where }) => records.filter(row => matches(row, where)).length),
    update: vi.fn(async ({ where, data }) => {
      const row = records.find(row => row.id === where.id)!;
      return Object.assign(row, data, { assignedStaff: { id: data.assignedStaffUserId, fullName: data.assignedStaffUserId, accountStatus: 'ACTIVE' } });
    }),
  };
  const tx = {
    handoverAppointment: model,
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn(),
    reservation: { findUnique: vi.fn(async () => ({ facilityId: 'facility-a' })) },
    user: { findFirst: vi.fn(async ({ where }) => (where.role === 'FACILITY_STAFF' && where.id === manager.id
       ? null : { id: where.id, role: where.role, accountStatus: 'ACTIVE' })) },
    facilityAccess: {
      findMany: vi.fn(async () => [{ facilityId: 'facility-a' }]),
      findFirst: vi.fn(async () => ({ id: 'grant' })),
    },
    auditEvent: { create: vi.fn() },
  };
  const db = { ...tx, $transaction: vi.fn(operation => operation(tx)) };
  return { service: new AppointmentsService(db as never, {} as never, {} as never), records, model, tx };
}

describe('Handover staff assignment', () => {
  it('paginates across upcoming and finished groups using the same Staff and day filters', async () => {
    const { service, model } = setup();
    const controller = new ManagerAppointmentsController(service);
    const request = { user: staff } as AuthenticatedRequest;
    model.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(7).mockResolvedValueOnce(1);
    const result = await controller.list({ agenda: 'all', page: '2', limit: '5', date: '2026-11-18' }, request);
    expect(result.total).toBe(12);
    expect(model.findMany.mock.calls).toHaveLength(1);
    expect(model.findMany.mock.calls[0][0]).toMatchObject({
      skip: 1, take: 5,
      orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { scheduledAt: 'desc' }, { id: 'asc' }],
      where: { AND: [
        { OR: expect.arrayContaining([{ assignedStaffUserId: staff.id }]), scheduledAt: { gte: new Date('2026-11-17T17:00:00Z'), lt: new Date('2026-11-18T17:00:00Z') } },
        { status: 'COMPLETED' },
      ] },
    });
    model.count.mockClear().mockResolvedValueOnce(1);
    await controller.list({ agenda: 'upcoming' }, request);
    expect(model.count.mock.calls[0][0].where).toMatchObject({
      AND: [{ OR: expect.arrayContaining([{ assignedStaffUserId: staff.id }]) }, { status: { in: ['REQUESTED', 'CONFIRMED'] }, scheduledAt: { gte: expect.any(Date) } }],
    });
    expect(model.count).toHaveBeenCalledOnce();
  });

  it('uses both local-day boundaries and the same staff scope when filtering upcoming and today', async () => {
    const { service, model } = setup();
    const controller = new ManagerAppointmentsController(service);
    const request = { user: staff } as AuthenticatedRequest;
    await controller.list({ status: 'CONFIRMED', from: '2026-11-18', through: '2026-11-25', limit: '5' }, request);
    const [range] = model.findMany.mock.calls[0];
    expect(range).toMatchObject({ take: 5, skip: 0, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], where: {
      status: 'CONFIRMED',
      OR: expect.arrayContaining([{ assignedStaffUserId: staff.id }]),
      scheduledAt: { gte: new Date('2026-11-17T17:00:00Z'), lt: new Date('2026-11-25T17:00:00Z') },
    } });
    await controller.list({ status: 'CONFIRMED', date: '2026-11-18' }, request);
    expect(model.count.mock.calls[1][0].where).toMatchObject({
      status: 'CONFIRMED', scheduledAt: { gte: new Date('2026-11-17T17:00:00Z'), lt: new Date('2026-11-18T17:00:00Z') },
    });
    await expect(controller.list({ from: '2026-11-26', through: '2026-11-25' }, request)).rejects.toThrow('Khoảng ngày hẹn');
    await expect(controller.list({ from: '2026-02-30' }, request)).rejects.toThrow('date không hợp lệ');
  });

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
    tx.user.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.assignAppointment('unassigned', { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('hoạt động');
    tx.user.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.assignAppointment('unassigned', { staffUserId: manager.id, expectedAssignedStaffUserId: null }, manager)).rejects.toThrow('nhân viên đang hoạt động');
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
      await expect(service.confirmAppointment(id, staff)).rejects.toThrow('nhân viên được giao');
      await expect(service.completeHandover(id, {}, staff)).rejects.toThrow('nhân viên được giao');
    }
    expect((await service.confirmAppointment('mine', staff)).id).toBe('mine');
    expect((await service.completeHandover('legacy-mine', {}, staff)).id).toBe('legacy-mine');
    expect(model.update).not.toHaveBeenCalled();
  });
});
