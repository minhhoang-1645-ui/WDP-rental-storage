import { expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { ServiceCalendarService } from '../dispatch/service-calendar.service.js';
import { AppointmentsService } from './appointments.service.js';

const customer: PublicUser = { id: 'customer', role: 'STORAGE_CUSTOMER', fullName: 'Customer', email: 'customer@example.test', phone: '' };
const manager: PublicUser = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Manager', email: 'manager@example.test', phone: '' };
const staff: PublicUser = { id: 'staff', role: 'FACILITY_STAFF', fullName: 'Staff', email: 'staff@example.test', phone: '' };
const when = (clock: string) => '2099-01-05T' + clock + ':00+07:00';

function setup() {
  const startDate = new Date('2099-01-05'), endDate = new Date('2099-01-20');
  const reservation = {
    id: 'r', reservationCode: 'R1', customerId: customer.id, customer, facilityId: 'f', quantity: 1, status: 'CONFIRMED',
    units: [{ id: 'allocation' }], invoices: [{ type: 'INITIAL', status: 'PAID' }],
    contracts: [{ status: 'READY_FOR_HANDOVER', termsAcceptedAt: new Date(), termsAcceptedByUserId: customer.id,
      reservationUnitId: 'allocation', startDate, endDate, reservationUnit: { storageUnit: { id: 'u', status: 'RESERVED' } } }],
  };
  const facility = { id: 'f', serviceSchedule: [], accessHours: '09:00–16:00, Thứ Hai' };
  const inspection = { id: 'return', reservation: { facilityId: 'f' }, inspections: [], status: 'REQUESTED', inspectionScheduledAt: null };
  type Appointment = { id: string; scheduledAt: Date; createdAt: Date; updatedAt: Date; reservation: typeof reservation; assignedStaffUserId: string | null };
  let stored: Appointment | null = null;
  const tx = {
    $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(),
    reservation: { findFirst: vi.fn().mockResolvedValue({ id: 'r' }), findUnique: vi.fn().mockResolvedValue(reservation) },
    facility: { findUniqueOrThrow: vi.fn().mockResolvedValue(facility), findMany: vi.fn().mockResolvedValue([facility]) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'f' }]) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: manager.id }) },
    auditEvent: { create: vi.fn() },
    handoverAppointment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(async () => stored),
      findFirst: vi.fn(async () => stored),
      findMany: vi.fn(async () => stored ? [stored] : []),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }) => {
        const row = { ...data, id: 'h', createdAt: new Date(), updatedAt: new Date(), reservation, assignedStaffUserId: null } as Appointment;
        stored = row;
        return row;
      }),
      update: vi.fn(async ({ data }) => {
        const row = { ...stored!, ...data } as Appointment;
        stored = row;
        return row;
      }),
    },
    returnRequest: { findUnique: vi.fn().mockResolvedValue(inspection), findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async ({ data }) => data) },
    transferRequest: { findMany: vi.fn().mockResolvedValue([]) },
    staffShift: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  };
  const db = { ...tx, $transaction: vi.fn(fn => fn(tx)) } as never;
  return { appointments: new AppointmentsService(db), agenda: new ServiceCalendarService(db), tx, facility };
}

it('keeps created and changed customer times pending until the Manager confirms', async () => {
  const { appointments, agenda, tx, facility } = setup();
  const create = (time: string) => appointments.createCustomerAppointment(customer,
    { reservationId: 'r', scheduledAt: when(time) }, 'manual-test');
  await expect(create('16:00')).rejects.toThrow('giờ khách truy cập');
  const requested = await create('09:00');
  expect(requested).toMatchObject({ status: 'REQUESTED', schedulePendingManager: true, confirmedAt: null });
  const confirm = (time: string, actor = manager) => appointments.adjustAppointment(requested.id,
    { action: 'CONFIRM_EXCEPTION', expectedScheduledAt: when(time), note: 'Đã bố trí người phục vụ' }, actor);
  await expect(confirm('09:00', staff)).rejects.toThrow('Chỉ quản lý');
  await expect(confirm('09:00')).resolves.toMatchObject({ status: 'CONFIRMED' });
  const calendar = await agenda.agenda(manager, when('00:00'), when('23:59'));
  expect(calendar.items).toEqual([expect.objectContaining({
    id: requested.id, status: 'CONFIRMED', warning: undefined,
  })]);
  const change = (time: string) => appointments.rescheduleCustomerAppointment(requested.id,
    { expectedScheduledAt: when('09:00'), scheduledAt: when(time) }, customer);
  await expect(change('08:59')).rejects.toThrow('giờ khách truy cập');
  await expect(change('10:00')).resolves.toMatchObject({ status: 'REQUESTED', confirmedAt: null, schedulePendingManager: true });
  facility.accessHours = '11:00–16:00, Thứ Hai';
  await expect(confirm('10:00')).rejects.toThrow('giờ khách truy cập');
  expect(tx.staffShift.count).not.toHaveBeenCalled();
  expect(tx.handoverAppointment.update).toHaveBeenCalledTimes(2);
});

it('allows the Manager to schedule a return directly during customer access hours', async () => {
  const { agenda, tx } = setup();
  const plan = (time: string) => agenda.planReturn(manager, 'return',
    { scheduledAt: when(time), expectedScheduledAt: null, reason: 'Đã bố trí người kiểm tra' });
  await expect(plan('16:00')).rejects.toThrow('giờ khách truy cập');
  await expect(plan('15:45')).resolves.toEqual({ inspectionScheduledAt: new Date(when('15:45')) });
  expect(tx.staffShift.count).not.toHaveBeenCalled();
  expect(tx.returnRequest.update).toHaveBeenCalledOnce();
});
