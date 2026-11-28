import { expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { ServiceCalendarService } from './service-calendar.service.js';

const actor = { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser;
const from = '2026-11-23T00:00:00+07:00';
const to = '2026-11-30T00:00:00+07:00';
const scheduledAt = new Date('2026-11-25T09:00:00+07:00');
const reservation = { reservationCode: 'WDP-01', customer: { fullName: 'Nguyễn Văn An' } };

function fixture() {
  const db = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: actor.id }) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility-a' }]) },
    handoverAppointment: { findMany: vi.fn().mockResolvedValue([]) },
    returnRequest: { findMany: vi.fn().mockResolvedValue([]) },
    transferRequest: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { db, agenda: new ServiceCalendarService(db as never) };
}

it('uses appointment timestamps and existing FacilityAccess scopes for all three sources', async () => {
  const { db, agenda } = fixture();
  await expect(agenda.staffAgenda(actor, from, to)).resolves.toEqual({ facilityId: 'facility-a', items: [] });
  const range = { gte: new Date('2026-11-22T17:00:00Z'), lt: new Date('2026-11-29T17:00:00Z') };
  const facility = { facilityAccess: { some: { userId: actor.id, revokedAt: null, user: { role: actor.role, accountStatus: 'ACTIVE' } } } };
  expect(db.handoverAppointment.findMany.mock.calls[0][0].where).toEqual({ reservation: { facilityId: 'facility-a', facility }, scheduledAt: range });
  expect(db.returnRequest.findMany.mock.calls[0][0].where).toEqual({ inspectionScheduledAt: range, AND: [{ OR: [
    { inspections: { some: { storageUnit: { storageType: { facilityId: 'facility-a' } } } } },
    { inspections: { none: {} }, reservation: { facilityId: 'facility-a' } },
  ] }], OR: [
    { inspections: { some: {}, every: { storageUnit: { storageType: { facility } } } } },
    { inspections: { none: {} }, reservation: { facility } },
  ] });
  expect(db.transferRequest.findMany.mock.calls[0][0].where).toEqual({
    fromStorageUnit: { storageType: { facility } }, AND: [{ fromStorageUnit: { storageType: { facilityId: 'facility-a' } } }],
    supportRequest: { transferRequestedStartAt: range },
  });
});

it('sorts actual appointments, retains cancellations, and limits customer identity to the assigned staff member', async () => {
  const { db, agenda } = fixture();
  const unit = { unitNumber: 'LG-03', storageType: { name: 'Kho lớn' } };
  db.handoverAppointment.findMany.mockResolvedValue([
    { id: 'cancelled', appointmentCode: 'H-2', scheduledAt, status: 'CANCELLED', assignedStaff: null, reservation: { ...reservation, units: [] } },
    { id: 'other', appointmentCode: 'H-3', scheduledAt, status: 'CONFIRMED',
      assignedStaff: { id: 'colleague', fullName: 'Nhân viên B' }, reservation: { ...reservation, units: [{ storageUnit: unit, releasedAt: null }] } },
  ]);
  db.returnRequest.findMany.mockResolvedValue([{ id: 'mine', returnCode: 'R-1', status: 'INSPECTION_IN_PROGRESS',
    inspectionScheduledAt: new Date(+scheduledAt - 60_000), assignedStaff: { id: actor.id, fullName: 'Nhân viên A' },
    reservation, inspections: [{ storageUnit: unit }] }]);
  const result = await agenda.staffAgenda(actor, from, to);
  expect(result.items).toMatchObject([
    { id: 'mine', ownership: 'mine', customer: 'Nguyễn Văn An', inProgress: true, units: [unit] },
    { id: 'cancelled', ownership: 'unassigned', customer: 'N.V.A', status: 'CANCELLED', units: [] },
    { id: 'other', ownership: 'other', customer: 'N.V.A', assignee: 'Nhân viên B', units: [unit] },
  ]);
  db.handoverAppointment.findMany.mockResolvedValue([]);
  await expect(agenda.staffAgenda(actor, from, to)).resolves.toMatchObject({ items: [{ id: 'mine' }] });
});

it('rejects missing access and oversized ranges before querying appointment records', async () => {
  const { db, agenda } = fixture();
  await expect(agenda.staffAgenda(actor, from, '2026-12-01T00:00:00+07:00')).rejects.toThrow('tối đa 7 ngày');
  db.facilityAccess.findMany.mockResolvedValue([]);
  await expect(agenda.staffAgenda(actor, from, to)).rejects.toThrow('cấp quyền');
  expect(db.handoverAppointment.findMany).not.toHaveBeenCalled();
});
