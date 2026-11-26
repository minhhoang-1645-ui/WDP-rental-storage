import { AutoDispatchService } from '../dist/modules/dispatch/auto-dispatch.service.js';
import { assessHandoverWindow } from '../dist/modules/dispatch/service-schedule.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { StaffShiftsService } from '../dist/modules/dispatch/staff-shifts.service.js';
import { MaintenanceService } from '../dist/modules/maintenance/maintenance.service.js';
import { SupportService } from '../dist/modules/support/support.service.js';
import { TransfersService } from '../dist/modules/transfers/transfers.service.js';
import { AppointmentsService } from '../dist/modules/appointments/appointments.service.js';
import { ServiceCalendarService } from '../dist/modules/dispatch/service-calendar.service.js';
import { ReturnsService } from '../dist/modules/returns/returns.service.js';

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

it('keeps the scheduler off when the feature flag is off', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NESTBOX_AUTO_DISPATCH_ENABLED', 'false');
  const schedule = vi.spyOn(globalThis, 'setInterval');
  const worker = new AutoDispatchService(db);
  try {
    worker.onModuleInit();
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    vi.unstubAllEnvs();
    await worker.onModuleDestroy();
  }
});

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
    maintenanceCode: randomUUID(), createIdempotencyKey: randomUUID(), commonAreaFacilityId: b, commonArea: 'CORRIDOR',
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

it('coordinates breaks, customer wait, manual assignment and a restarted dispatcher', async () => {
  const facilityId = namespace + 'live';
  const team = [actor('live-first', 'FACILITY_STAFF'), actor('live-second', 'FACILITY_STAFF')];
  await db.user.createMany({ data: team.map(user => ({ ...user, passwordHash: 'test' })) });
  await db.facility.create({ data: { id: facilityId, code: facilityId, name: 'Dispatch test', address: 'Test' } });
  await db.facilityAccess.createMany({ data: [manager, ...team].map(user => ({
    id: randomUUID(), userId: user.id, facilityId, grantedById: manager.id, activeKey: JSON.stringify([user.id, facilityId]),
  })) });
  const localShifts = await Promise.all(team.map(user => shifts.plan(manager, { ...slot(facilityId, -2, 20), staffUserId: user.id })));
  await Promise.all(team.map((user, i) => shifts.attend(user, localShifts[i].shift.id, 'CHECK_IN')));
  await shifts.attend(team[0], localShifts[0].shift.id, 'START_BREAK');
  await shifts.attend(team[0], localShifts[0].shift.id, 'START_BREAK');
  expect(await db.auditEvent.count({ where: { resourceId: localShifts[0].shift.id, action: 'START_BREAK' } })).toBe(1);

  const type = await db.storageType.findUniqueOrThrow({ where: { id: namespace + 'type' } });
  const reservation = await db.reservation.create({ data: {
    reservationCode: randomUUID(), idempotencyKey: randomUUID(), customerId: staff.id, facilityId, storageTypeId: type.id,
    quantity: 1, startDate: new Date(at(1440)), endDate: new Date(at(2880)), periodMode: 'DURATION',
    quoteSnapshot: {}, availabilitySnapshot: {},
  } });
  const support = new SupportService(db);
  const request = await db.supportRequest.create({ data: {
    supportCode: randomUUID(), idempotencyKey: randomUUID(), customerUserId: staff.id, reservationId: reservation.id,
    category: 'OTHER', subject: 'Fixture support', description: 'Test only',
  } });
  const maintenance = new MaintenanceService(db);
  const ticket = await db.maintenanceRequest.create({ data: {
    maintenanceCode: randomUUID(), createIdempotencyKey: randomUUID(), commonAreaFacilityId: facilityId, commonArea: 'ENTRANCE',
    source: 'MANUAL', category: 'LOCK_OR_ACCESS', priority: 'URGENT', description: 'Test only', reportedByUserId: team[1].id,
  } });
  const engine = new AutoDispatchService(db);
  expect(await engine.dispatchFacility(facilityId)).toBe(1);
  expect(await db.supportRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ assignedStaffUserId: team[1].id });
  await support.start(request.id, randomUUID(), team[1]);
  await maintenance.setDispatchReady(ticket.id, { ready: true, reason: 'Manager checked in-house repair' }, randomUUID(), manager);
  expect(await engine.dispatchFacility(facilityId)).toBe(0);
  await support.customerWait(request.id, { reason: 'Waiting for customer to confirm the access issue' }, randomUUID(), team[1]);
  await Promise.allSettled([
    engine.dispatchFacility(facilityId),
    maintenance.assign(ticket.id, { staffUserId: team[1].id, expectedAssignedStaffUserId: null }, randomUUID(), manager),
  ]);
  const assigned = await db.maintenanceRequest.findUniqueOrThrow({ where: { id: ticket.id } });
  expect(assigned.assignedStaffUserId).toBe(team[1].id);
  expect(await db.auditEvent.count({ where: { resourceId: ticket.id, action: 'TASK_ASSIGNMENT' } })).toBe(1);
  expect(await new AutoDispatchService(db).dispatchFacility(facilityId)).toBe(0);
  await db.maintenanceRequest.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS' } });
  await expect(support.customerWait(request.id, {}, randomUUID(), team[1], true)).rejects.toMatchObject({ status: 409 });
  await expect(shifts.attend(team[1], localShifts[1].shift.id, 'START_BREAK')).rejects.toMatchObject({ status: 409 });
  await db.maintenanceRequest.update({ where: { id: ticket.id }, data: { status: 'AWAITING_VERIFICATION' } });
  await support.customerWait(request.id, {}, randomUUID(), team[1], true);
  await shifts.attend(team[0], localShifts[0].shift.id, 'END_BREAK');
  await expect(shifts.attend(team[0], localShifts[0].shift.id, 'START_BREAK', 1)).rejects.toMatchObject({ status: 409 });
  await shifts.attend(team[1], localShifts[1].shift.id, 'CHECK_OUT');
  expect((await shifts.list(manager, at(-10), at(30), facilityId)).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ staffUserId: team[0].id, availability: 'AVAILABLE' }),
    expect.objectContaining({ staffUserId: team[1].id, pendingHandover: expect.arrayContaining([expect.objectContaining({ id: request.id })]) }),
  ]));
});

it('treats customer move-ready as a request to inspect, without releasing old access or the allocation', async () => {
  const customer = { id: namespace + 'move-customer', role: 'STORAGE_CUSTOMER' as const,
    fullName: 'Customer fixture', email: namespace + '@example.test' };
  await db.user.create({ data: { ...customer, passwordHash: 'test' } });
  const type = await db.storageType.findUniqueOrThrow({ where: { id: namespace + 'type' } });
  const [source, destination] = await Promise.all((['OCCUPIED', 'RESERVED'] as const).map(status => db.storageUnit.create({
    data: { storageTypeId: type.id, unitNumber: randomUUID(), status },
  })));
  const reservation = await db.reservation.create({ data: {
    reservationCode: randomUUID(), idempotencyKey: randomUUID(), customerId: customer.id, facilityId: b, storageTypeId: type.id,
    quantity: 1, startDate: new Date(at(-1440)), endDate: new Date(at(5760)), periodMode: 'DURATION', status: 'CONFIRMED',
    quoteSnapshot: {}, availabilitySnapshot: {},
  } });
  const [oldAllocation, newAllocation] = await Promise.all([source, destination].map(unit => db.reservationUnit.create({
    data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: reservation.startDate, plannedEndDate: reservation.endDate },
  })));
  const contract = await db.rentalContract.create({ data: {
    contractCode: randomUUID(), reservationId: reservation.id, reservationUnitId: oldAllocation.id,
    status: 'ACTIVE', startDate: reservation.startDate, endDate: reservation.endDate,
  } });
  const move = await db.transferRequest.create({ data: {
    transferCode: randomUUID(), idempotencyKey: randomUUID(), reservationId: reservation.id, rentalContractId: contract.id,
    fromStorageUnitId: source.id, toStorageUnitId: destination.id, fromReservationUnitId: oldAllocation.id,
    toReservationUnitId: newAllocation.id, status: 'APPROVED', reason: 'OTHER', requestedByUserId: customer.id,
    handoverReport: { stagedHandover: true },
  } });
  const mover = actor('auto-mover', 'FACILITY_STAFF');
  await db.user.create({ data: { ...mover, passwordHash: 'test' } });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: mover.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([mover.id, b]) } });
  const shift = await shifts.plan(manager, { ...slot(b, -5, 30), staffUserId: mover.id });
  await shifts.attend(mover, shift.shift.id, 'CHECK_IN');
  expect(await new AutoDispatchService(db).dispatchFacility(b)).toBe(1);
  expect(await db.transferRequest.findUniqueOrThrow({ where: { id: move.id } })).toMatchObject({ assignedStaffUserId: mover.id });
  const transfers = new TransfersService(db);
  await expect(transfers.advanceMove(move.id, customer, 'CUSTOMER_READY')).rejects.toMatchObject({ status: 409 });
  await transfers.advanceMove(move.id, mover, 'DELIVER_DESTINATION', { destinationReady: true, accessDelivered: true });
  const first = await transfers.advanceMove(move.id, customer, 'CUSTOMER_READY');
  expect(await transfers.advanceMove(move.id, customer, 'CUSTOMER_READY')).toEqual(first);
  await transfers.advanceMove(move.id, mover, 'START_SOURCE');
  await expect(transfers.complete(move.id, mover, { destinationReady: true, goodsMoved: false })).rejects.toMatchObject({ status: 400 });
  await expect(transfers.assign(move.id, { staffUserId: other.id, expectedAssignedStaffUserId: mover.id }, manager))
    .rejects.toMatchObject({ status: 409 });
  await transfers.assign(move.id, { staffUserId: other.id, expectedAssignedStaffUserId: mover.id, handoverConfirmed: true,
    handoverNote: 'Reviewed progress, existing keys and pending verification.' }, manager);
  await expect(transfers.advanceMove(move.id, mover, 'START_SOURCE')).rejects.toMatchObject({ status: 403 });
  expect(await db.reservationUnit.findUniqueOrThrow({ where: { id: oldAllocation.id } })).toMatchObject({ releasedAt: null });
  expect(await db.storageUnit.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ status: 'OCCUPIED' });
  expect(await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ reservationUnitId: oldAllocation.id, status: 'ACTIVE' });
  await shifts.attend(mover, shift.shift.id, 'CHECK_OUT');
});

it('applies the same last-place capacity to Customer and Manager and flags existing bookings after a schedule change', async () => {
  const local = new Date(Date.now() + 2 * 86400000 + 7 * 3600000);
  const day = local.toISOString().slice(0, 10);
  const weekday = local.getUTCDay() || 7;
  const when = (time: string) => new Date(`${day}T${time}:00+07:00`).toISOString();
  const type = await db.storageType.findUniqueOrThrow({ where: { id: namespace + 'type' } });
  const customer = { id: namespace + 'capacity', email: namespace + 'capacity@example.test',
    role: 'STORAGE_CUSTOMER' as const, fullName: 'Scheduling customer' };
  await db.user.create({ data: { ...customer, passwordHash: 'test' } });
  await db.facility.update({ where: { id: b }, data: {
    serviceSchedule: [{ weekday, starts: '08:00', ends: '10:00', capacity: 1 }, { weekday, starts: '10:00', ends: '12:00', capacity: 1 },
      { weekday, starts: '13:00', ends: '15:00', capacity: 1 }],
  } });
  await shifts.plan(manager, { facilityId: b, staffUserId: staff.id, startsAt: when('08:00'), endsAt: when('16:00') });
  const soon = new Date(day + 'T00:00:00Z');
  const end = new Date(+soon + 15 * 86400000);
  const reservations = [];
  for (let index = 0; index < 3; index++) {
    const reservation = await db.reservation.create({ data: {
      reservationCode: randomUUID(), idempotencyKey: randomUUID(), customerId: customer.id, facilityId: b, storageTypeId: type.id,
      quantity: 1, startDate: soon, endDate: end, periodMode: 'DURATION', status: 'CONFIRMED', quoteSnapshot: {}, availabilitySnapshot: {},
    } });
    const unit = await db.storageUnit.create({ data: { storageTypeId: type.id, unitNumber: randomUUID(), status: 'RESERVED' } });
    const allocation = await db.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id,
      plannedStartDate: soon, plannedEndDate: end } });
    await db.rentalContract.create({ data: {
      contractCode: randomUUID(), reservationId: reservation.id, reservationUnitId: allocation.id, status: 'READY_FOR_HANDOVER',
      startDate: soon, endDate: end, termsAcceptedAt: new Date(), termsAcceptedByUserId: customer.id,
    } });
    await db.invoice.create({ data: {
      invoiceCode: randomUUID(), reservationId: reservation.id, type: 'INITIAL', status: 'PAID', rentalAmount: 1000000n,
      depositAmount: 1000000n, totalAmount: 2000000n, amountPaid: 2000000n, balanceDue: 0n, paidAt: new Date(),
    } });
    reservations.push(reservation);
  }
  const appointments = new AppointmentsService(db);
  const [customerBooking, managerBooking] = await Promise.all([
    appointments.createCustomerAppointment(customer, { reservationId: reservations[0].id, scheduledAt: when('08:30') }, randomUUID()),
    appointments.createManagerAppointment(manager, { reservationId: reservations[1].id, scheduledAt: when('10:30') }, randomUUID()),
  ]);
  expect([customerBooking.status, managerBooking.status]).toEqual(['CONFIRMED', 'CONFIRMED']);
  const results = await Promise.allSettled([
    appointments.rescheduleCustomerAppointment(customerBooking.id, { expectedScheduledAt: when('08:30'), scheduledAt: when('13:30') }, customer),
    appointments.adjustAppointment(managerBooking.id,
      { action: 'RESCHEDULE', expectedScheduledAt: when('10:30'), scheduledAt: when('13:45'), note: 'Customer requested time change' }, manager),
  ]);
  const [moved] = results.filter(result => result.status === 'fulfilled');
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
  const overflow = await appointments.createCustomerAppointment(customer,
    { reservationId: reservations[2].id, scheduledAt: when('14:00') }, randomUUID());
  expect(overflow.status).toBe('REQUESTED');
  await expect(appointments.adjustAppointment(overflow.id, {
    action: 'CONFIRM_EXCEPTION', expectedScheduledAt: when('14:00'), note: 'Review capacity limit',
  }, manager)).rejects.toMatchObject({ status: 409 });
  await db.facility.update({ where: { id: b }, data: { serviceSchedule: [] } });
  expect((await new ServiceCalendarService(db).agenda(manager, when('00:00'), when('23:59'))).items)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: moved.value.id, status: 'CONFIRMED', warning: expect.any(String) })]));

  const dispatchStaff = actor('dispatch-handover', 'FACILITY_STAFF');
  await db.user.create({ data: { ...dispatchStaff, passwordHash: 'test' } });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: dispatchStaff.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([dispatchStaff.id, b]) } });
  const shift = await shifts.plan(manager, { ...slot(b, -5, 30), staffUserId: dispatchStaff.id });
  await shifts.attend(dispatchStaff, shift.shift.id, 'CHECK_IN');
  const due = new Date(Date.now() - 60_000);
  await db.handoverAppointment.updateMany({ where: { id: { in: [customerBooking.id, managerBooking.id] } }, data: { scheduledAt: due } });
  const blocked = await db.reservationUnit.findFirstOrThrow({ where: { reservationId: reservations[0].id } });
  const incident = await db.maintenanceRequest.create({ data: {
    maintenanceCode: randomUUID(), createIdempotencyKey: randomUUID(), commonAreaFacilityId: b, commonArea: 'CORRIDOR',
    source: 'MANUAL', category: 'LOCK_OR_ACCESS', description: 'Test only', reportedByUserId: dispatchStaff.id,
  } });
  await db.incidentUnitBlock.create({ data: { maintenanceRequestId: incident.id, storageUnitId: blocked.storageUnitId } });
  const scheduler = new AutoDispatchService(db, appointments);
  const sweep = vi.spyOn(scheduler, 'run').mockImplementation(async () => { await scheduler.dispatchFacility(b); });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NESTBOX_AUTO_DISPATCH_ENABLED', 'true');
  try {
    scheduler.onModuleInit();
    await scheduler.onModuleDestroy();
    expect(sweep).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
    sweep.mockRestore();
  }
  expect(await db.handoverAppointment.findUniqueOrThrow({ where: { id: customerBooking.id } })).toMatchObject({ assignedStaffUserId: null });
  expect(await db.handoverAppointment.findUniqueOrThrow({ where: { id: managerBooking.id } })).toMatchObject({ assignedStaffUserId: dispatchStaff.id });
  expect(await db.rentalContract.findFirstOrThrow({ where: { reservationId: reservations[1].id } })).toMatchObject({ status: 'READY_FOR_HANDOVER' });

  await db.handoverAppointment.update({ where: { id: managerBooking.id }, data: { status: 'CANCELLED', activeKey: null, cancelledAt: new Date() } });
  const returnContract = await db.rentalContract.findFirstOrThrow({ where: { reservationId: reservations[2].id },
    include: { reservationUnit: { include: { storageUnit: true } } } });
  const unit = returnContract.reservationUnit.storageUnit;
  await db.rentalContract.update({ where: { id: returnContract.id }, data: { status: 'ACTIVE' } });
  await db.storageUnit.update({ where: { id: unit.id }, data: { status: 'OCCUPIED' } });
  const returnRow = await db.returnRequest.create({ data: {
    returnCode: randomUUID(), idempotencyKey: randomUUID(), activeKey: 'RETURN_CONTRACT:' + returnContract.id,
    reservationId: reservations[2].id, requestedByUserId: customer.id, inspectionScheduledAt: due,
    inspections: { create: { storageUnitId: unit.id, rentalContractId: returnContract.id } },
  } });
  const claim = await db.damageClaim.create({ data: {
    claimCode: randomUUID(), idempotencyKey: randomUUID(), inputHash: 'fixture', customerId: customer.id,
    rentalContractId: returnContract.id, unitCodeSnapshot: unit.unitNumber, discoveredOn: new Date(),
    description: 'Fixture for staff inspection', affectedItems: [], evidenceLinks: [],
  } });
  const returnsService = new ReturnsService(db);
  const engine = new AutoDispatchService(db, appointments, returnsService);
  expect(await engine.dispatchFacility(b)).toBe(1);
  expect(await db.returnRequest.findUniqueOrThrow({ where: { id: returnRow.id } })).toMatchObject({ assignedStaffUserId: dispatchStaff.id });
  expect(await db.damageClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({ assignedStaffId: null });
  await returnsService.startInspection(returnRow.id, dispatchStaff);
  expect(await engine.dispatchFacility(b)).toBe(0);
  await db.returnRequest.update({ where: { id: returnRow.id }, data: { status: 'PENDING_SETTLEMENT', physicallyReturnedAt: new Date() } });
  expect(await engine.dispatchFacility(b)).toBe(1);
  expect(await db.damageClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({
    assignedStaffId: dispatchStaff.id, status: 'REPORTED', decision: null,
  });
});
