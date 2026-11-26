import { assessHandoverWindow } from '../dist/modules/dispatch/service-schedule.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { TransfersService } from '../dist/modules/transfers/transfers.service.js';
import { AppointmentsService } from '../dist/modules/appointments/appointments.service.js';
import { ServiceCalendarService } from '../dist/modules/dispatch/service-calendar.service.js';

const target = 'postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if (process.env.NESTBOX_ISOLATED_TEST !== '1' || process.env.DATABASE_URL !== target || process.env.DIRECT_URL !== target) {
  throw new Error('Service and assignment checks require the disposable localhost PostgreSQL database.');
}

const db = new PrismaService();
const namespace = randomUUID();
const actor = (suffix: string, role: 'FACILITY_STAFF' | 'FACILITY_MANAGER') => ({
  id: namespace + suffix, role, fullName: suffix, email: namespace + suffix + '@example.test',
});
const manager = actor('manager', 'FACILITY_MANAGER');
const otherManager = actor('manager-2', 'FACILITY_MANAGER');
const staff = actor('staff', 'FACILITY_STAFF');
const other = actor('other', 'FACILITY_STAFF');
const a = namespace + 'a';
const b = namespace + 'b';
const now = Date.now();
const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();

beforeAll(async () => {
  await db.user.createMany({ data: [manager, otherManager, staff, other].map(user => ({ ...user, passwordHash: 'test' })) });
  await db.facility.createMany({ data: [a, b].map(id => ({ id, code: id, name: id, address: 'Test' })) });
  await db.facilityAccess.createMany({ data: [manager, staff].map(user => ({
    facilityId: b,
    id: randomUUID(), userId: user.id, grantedById: manager.id, activeKey: JSON.stringify([user.id, b]),
  })) });
  await db.facilityAccess.create({ data: {
    id: randomUUID(), userId: otherManager.id, facilityId: b, grantedById: manager.id, activeKey: JSON.stringify([otherManager.id, b]),
  } });
  await db.facilityAccess.create({ data: {
    id: randomUUID(), userId: other.id, facilityId: b, grantedById: manager.id, activeKey: JSON.stringify([other.id, b]),
  } });
});

afterAll(async () => db.$disconnect());

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
  const mover = actor('manual-mover', 'FACILITY_STAFF');
  await db.user.create({ data: { ...mover, passwordHash: 'test' } });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: mover.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([mover.id, b]) } });
  expect(await db.transferRequest.findUniqueOrThrow({ where: { id: move.id } })).toMatchObject({ assignedStaffUserId: null });
  const transfers = new TransfersService(db);
  await transfers.assign(move.id, { staffUserId: mover.id, expectedAssignedStaffUserId: null }, manager);
  expect(await db.transferRequest.findUniqueOrThrow({ where: { id: move.id } })).toMatchObject({ assignedStaffUserId: mover.id });
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

  expect(await db.handoverAppointment.count({ where: { id: { in: [customerBooking.id, managerBooking.id] }, assignedStaffUserId: null } })).toBe(2);
  const assignments = await Promise.allSettled([
    appointments.assignAppointment(customerBooking.id, { staffUserId: staff.id, expectedAssignedStaffUserId: null }, manager),
    appointments.assignAppointment(customerBooking.id, { staffUserId: other.id, expectedAssignedStaffUserId: null }, otherManager),
  ]);
  expect(assignments.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  expect(assignments.find(item => item.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
  expect(await db.auditEvent.count({ where: { resourceId: customerBooking.id, action: 'TASK_ASSIGNMENT' } })).toBe(1);
  expect(await db.auditEvent.count({ where: { resourceId: { in: [customerBooking.id, managerBooking.id] }, route: '/system/dispatch' } })).toBe(0);
});
