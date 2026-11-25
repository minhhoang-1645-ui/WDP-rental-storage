import { AutoDispatchService } from '../dist/modules/dispatch/auto-dispatch.service.js';
import { assessHandoverWindow } from '../dist/modules/dispatch/service-schedule.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { StaffShiftsService } from '../dist/modules/dispatch/staff-shifts.service.js';

const target = 'postgresql://nestbox_test@127.0.0.1:55447/nestbox_shifts_utf8_test';
if (process.env.NESTBOX_SHIFT_TEST !== '1' || process.env.DATABASE_URL !== target || process.env.DIRECT_URL !== target) {
  throw new Error('Shift checks require the disposable localhost PostgreSQL database.');
}

const db = new PrismaService();
const shifts = new StaffShiftsService(db);
const namespace = randomUUID();
const actor = (suffix: string, role: 'FACILITY_STAFF' | 'FACILITY_MANAGER') => ({
  id: namespace + suffix, role, fullName: suffix, email: namespace + suffix + '@example.test',
});
const manager = actor('manager', 'FACILITY_MANAGER');
const staff = actor('staff', 'FACILITY_STAFF');
const other = actor('other', 'FACILITY_STAFF');
const a = namespace + 'a';
const b = namespace + 'b';
const now = Date.now();
const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();
const slot = (facilityId: string, from: number, to: number) => ({
  facilityId, staffUserId: staff.id, startsAt: at(from), endsAt: at(to),
});

beforeAll(async () => {
  await db.user.createMany({ data: [manager, staff, other].map(user => ({ ...user, passwordHash: 'test' })) });
  await db.facility.createMany({ data: [a, b].map(id => ({ id, code: id, name: id, address: 'Test' })) });
  await db.facilityAccess.createMany({ data: [manager, staff].flatMap(user => [a, b].map(facilityId => ({
    id: randomUUID(), userId: user.id, facilityId, grantedById: manager.id, activeKey: JSON.stringify([user.id, facilityId]),
  }))) });
});

afterAll(async () => db.$disconnect());

it('serializes overlapping shifts across both authorized facilities', async () => {
  const result = await Promise.allSettled([shifts.plan(manager, slot(a, 80, 100)), shifts.plan(manager, slot(b, 90, 120))]);
  expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  expect(result.find(item => item.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
});

it('limits attendance to the assigned employee and the actual shift window', async () => {
  const { shift } = await shifts.plan(manager, slot(a, -5, 30));
  const before = await shifts.list(staff, at(-10), at(35));
  expect(before.items).toMatchObject([{ attendance: 'NOT_CHECKED_IN' }]);
  await expect(shifts.attend(other, shift.id, 'CHECK_IN')).rejects.toMatchObject({ status: 404 });
  const [{ checkedInAt }, retry] = await Promise.all([
    shifts.attend(staff, shift.id, 'CHECK_IN'),
    shifts.attend(staff, shift.id, 'CHECK_IN'),
  ]);
  expect(checkedInAt).toBeInstanceOf(Date);
  expect(retry.checkedInAt).toEqual(checkedInAt);
  expect((await shifts.list(staff, at(-10), at(35))).items).toMatchObject([{ attendance: 'PRESENT' }]);
  await shifts.attend(staff, shift.id, 'CHECK_OUT');
  expect((await shifts.list(staff, at(-10), at(35))).items).toMatchObject([{ attendance: 'CHECKED_OUT' }]);
  expect(await db.auditEvent.count({ where: { resourceId: shift.id, action: 'CHECK_IN' } })).toBe(1);
});

it('blocks a missing facility grant and a disabled account', async () => {
  await expect(shifts.plan({ ...manager, selectedFacilityId: a }, slot(b, 130, 150))).rejects.toMatchObject({ status: 403 });
  await expect(shifts.plan(manager, { ...slot(a, 130, 150), staffUserId: other.id })).rejects.toMatchObject({ status: 403 });
  const { shift } = await shifts.plan(manager, slot(a, 130, 150));
  await db.user.update({ where: { id: staff.id }, data: { accountStatus: 'DISABLED' } });
  try {
    await expect(shifts.attend(staff, shift.id, 'CHECK_IN')).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: staff.id }, data: { accountStatus: 'ACTIVE' } });
  }
});

it('records leave and absence without erasing a shift', async () => {
  const { shift } = await shifts.plan(manager, slot(b, 160, 180));
  await expect(shifts.mark(manager, shift.id, { status: 'ABSENT', reason: 'No show', revision: 0 })).rejects.toMatchObject({ status: 409 });
  const result = await shifts.mark(manager, shift.id, { status: 'ON_LEAVE', reason: 'Sudden leave', revision: 0 });
  expect(result.shift).toMatchObject({ status: 'ON_LEAVE', revision: 1 });
  await expect(shifts.attend(staff, shift.id, 'CHECK_IN')).rejects.toMatchObject({ status: 409 });
  await shifts.plan(manager, slot(a, 160, 180));
  await expect(shifts.plan(manager, slot(b, -20, -10))).rejects.toMatchObject({ status: 400 });
  const { shift: missed } = await shifts.plan(manager, slot(a, -40, -20)).catch(async () => {
    const shift = await db.staffShift.create({ data: {
      facilityId: a, staffUserId: staff.id, startsAt: at(-40), endsAt: at(-20),
    } });
    return { shift };
  });
  await expect(shifts.mark(manager, missed.id, { status: 'ABSENT', reason: 'No show', revision: 0 })).resolves.toMatchObject({ shift: { status: 'ABSENT' } });
});
it('serializes competing requests for the same configured service window', async () => {
  const time = new Date(at(24 * 60));
  const local = new Date(+time + 7 * 60 * 60000);
  const type = await db.storageType.create({ data: {
    id: namespace + 'type', facilityId: b, code: namespace + 'type', name: 'Test', sizeId: 'small', sizeName: 'Small',
    kicker: 'Test', condition: 'STANDARD', widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test',
    capacity: 'Test', boxCount: 'Test', suitableItems: [], image: 'test', imageAlt: 'Test', floor: 'Test', access: 'Test', features: [],
  } });
  await db.facility.update({ where: { id: b }, data: {
    serviceSchedule: [{ weekday: local.getUTCDay() || 7, starts: '00:00', ends: '24:00', capacity: 1 }],
  } });
  await shifts.plan(manager, slot(b, 24 * 60 - 10, 24 * 60 + 10));
  const reservations = await Promise.all([1, 2].map(() => db.reservation.create({ data: {
    reservationCode: randomUUID(), idempotencyKey: randomUUID(), customerId: staff.id, facilityId: b, storageTypeId: type.id,
    quantity: 1, startDate: time, endDate: new Date(+time + 86400000), periodMode: 'DURATION',
    quoteSnapshot: {}, availabilitySnapshot: {},
  } })));
  const result = await Promise.all(reservations.map(reservation => db.$transaction(async tx => {
    const decision = await assessHandoverWindow(tx, b, time);
    await tx.handoverAppointment.create({ data: {
      appointmentCode: randomUUID(), idempotencyKey: randomUUID(), reservationId: reservation.id,
      scheduledAt: time, requestedByUserId: staff.id, status: decision === 'CONFIRMED' ? 'CONFIRMED' : 'REQUESTED',
    } });
    return decision;
  })));
  expect(result.sort()).toEqual(['CAPACITY_REACHED', 'CONFIRMED']);
});

it('retains the queue without presence and dispatches concurrent tasks once after check-in', async () => {
  await db.facilityAccess.create({ data: {
    id: randomUUID(), userId: other.id, facilityId: b, grantedById: manager.id, activeKey: JSON.stringify([other.id, b]),
  } });
  const engine = new AutoDispatchService(db);
  const tickets = await Promise.all([1, 2].map(() => db.maintenanceRequest.create({ data: {
    maintenanceCode: randomUUID(), createIdempotencyKey: randomUUID(), commonAreaFacilityId: b,
    source: 'MANUAL', category: 'LOCK_OR_ACCESS', description: 'Test',
    reportedByUserId: staff.id, dispatchReadyAt: new Date(),
  } })));
  const { shift } = await shifts.plan(manager, { ...slot(b, -2, 20), staffUserId: other.id });
  expect(await engine.dispatchFacility(b)).toBe(0);
  await shifts.attend(other, shift.id, 'CHECK_IN');
  await Promise.all([engine.dispatchFacility(b), new AutoDispatchService(db).dispatchFacility(b)]);
  const assigned = async () => db.maintenanceRequest.count({ where: { id: { in: tickets.map(row => row.id) }, assignedStaffUserId: other.id } });
  expect(await assigned()).toBe(1);
  await engine.dispatchFacility(b);
  expect(await assigned()).toBe(1);
  await db.maintenanceRequest.updateMany({ where: { assignedStaffUserId: other.id }, data: { status: 'AWAITING_VERIFICATION' } });
  expect(await new AutoDispatchService(db).dispatchFacility(b)).toBe(1);
  expect(await assigned()).toBe(2);
  expect(await db.auditEvent.count({ where: { resourceId: { in: tickets.map(row => row.id) }, route: '/system/dispatch' } })).toBe(2);
  await shifts.attend(other, shift.id, 'CHECK_OUT');
});
