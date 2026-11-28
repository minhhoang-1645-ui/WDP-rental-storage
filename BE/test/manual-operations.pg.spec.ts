import { AssignmentQueueService } from '../dist/modules/dispatch/assignment-queue.service.js';
import { ReturnsService } from '../dist/modules/returns/returns.service.js';
import { SupportService } from '../dist/modules/support/support.service.js';
import { assessHandoverWindow } from '../dist/modules/dispatch/service-schedule.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID, scryptSync } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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
    approvedAt: new Date(), approvedByUserId: manager.id, handoverReport: { stagedHandover: true },
  } });
  const mover = actor('manual-mover', 'FACILITY_STAFF');
  await db.user.create({ data: { ...mover, passwordHash: 'test' } });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: mover.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([mover.id, b]) } });
  expect(await db.transferRequest.findUniqueOrThrow({ where: { id: move.id } })).toMatchObject({ assignedStaffUserId: null });
  const transfers = new TransfersService(db);
  const queue = new AssignmentQueueService(db, new AppointmentsService(db), new ReturnsService(db));
  for (const blocked of [{ status: 'REQUESTED' }, { reason: 'OPERATIONAL_RELOCATION' }] as const) {
    await db.transferRequest.update({ where: { id: move.id }, data: blocked });
    await expect(queue.claim(mover, 'transfers', move.id)).rejects.toMatchObject({ status: 409 });
    await db.transferRequest.update({ where: { id: move.id }, data: { status: 'APPROVED', reason: 'OTHER' } });
  }
  await queue.claim(mover, 'transfers', move.id);
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


it('claims ready handover and return work, arbitrates competing claims and Manager assignment, and preserves ownership on escalation', async () => {
  const type = await db.storageType.findUniqueOrThrow({ where: { id: namespace + 'type' } });
  const customer = { id: namespace + 'queue-customer', email: namespace + 'queue@example.test',
    role: 'STORAGE_CUSTOMER' as const, fullName: 'Queue fixture' };
  const outsider = actor('outsider', 'FACILITY_STAFF');
  const inspector = actor('inspector', 'FACILITY_STAFF');
  await db.user.createMany({ data: [customer, outsider, inspector].map(user => ({ ...user, passwordHash: 'test' })) });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: outsider.id, facilityId: a, grantedById: manager.id,
    activeKey: JSON.stringify([outsider.id, a]) } });
  await db.facilityAccess.create({ data: { id: randomUUID(), userId: inspector.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([inspector.id, b]) } });
  const startDate = new Date(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z');
  const endDate = new Date(+startDate + 7 * 86400000);
  async function rental(active: boolean) {
    const unit = await db.storageUnit.create({ data: { storageTypeId: type.id, unitNumber: randomUUID(), status: active ? 'OCCUPIED' : 'RESERVED' } });
    const reservation = await db.reservation.create({ data: {
      reservationCode: randomUUID(), idempotencyKey: randomUUID(), customerId: customer.id, facilityId: b, storageTypeId: type.id,
      quantity: 1, startDate, endDate, periodMode: 'DURATION', status: 'CONFIRMED', quoteSnapshot: { depositAmount: 100 }, availabilitySnapshot: {},
    } });
    const allocation = await db.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id,
      plannedStartDate: startDate, plannedEndDate: endDate } });
    const contract = await db.rentalContract.create({ data: {
      contractCode: randomUUID(), reservationId: reservation.id, reservationUnitId: allocation.id, status: active ? 'ACTIVE' : 'READY_FOR_HANDOVER',
      startDate, endDate, termsAcceptedAt: new Date(), termsAcceptedByUserId: customer.id,
    } });
    await db.invoice.create({ data: {
      invoiceCode: randomUUID(), reservationId: reservation.id, type: 'INITIAL', status: 'PAID', rentalAmount: 100n, depositAmount: 100n,
      totalAmount: 200n, amountPaid: 200n, balanceDue: 0n, paidAt: new Date(),
    } });
    return { unit, reservation, allocation, contract };
  }

  const arrivals = await Promise.all([rental(false), rental(false)]);
  const [arrive, race] = await Promise.all(arrivals.map(({ reservation }) => db.handoverAppointment.create({ data: {
    appointmentCode: randomUUID(), idempotencyKey: randomUUID(), reservationId: reservation.id, requestedByUserId: customer.id,
    status: 'CONFIRMED', scheduledAt: new Date(), handoverLeadDays: 3,
  } })));
  const appointments = new AppointmentsService(db);
  const returns = new ReturnsService(db);
  const queue = new AssignmentQueueService(db, appointments, returns);
  expect((await queue.list(staff)).items).toEqual(expect.arrayContaining([expect.objectContaining({
    id: arrive.id, customerHint: 'Q.f', unit: arrivals[0].unit.unitNumber,
  })]));
  expect((await queue.list(outsider)).items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: arrive.id })]));
  await expect(queue.claim(outsider, 'appointments', arrive.id)).rejects.toMatchObject({ status: 403 });
  await db.user.update({ where: { id: staff.id }, data: { accountStatus: 'DISABLED' } });
  await expect(queue.claim(staff, 'appointments', arrive.id)).rejects.toMatchObject({ status: 403 });
  await db.user.update({ where: { id: staff.id }, data: { accountStatus: 'ACTIVE' } });
  const incident = await db.maintenanceRequest.create({ data: {
    maintenanceCode: randomUUID(), createIdempotencyKey: randomUUID(), storageUnitId: arrivals[0].unit.id,
    source: 'MANUAL', category: 'UNIT_DAMAGE', description: 'Safety fixture', reportedByUserId: staff.id,
    incidentBlocks: { create: { storageUnitId: arrivals[0].unit.id } },
  } });
  await expect(queue.claim(staff, 'appointments', arrive.id)).rejects.toMatchObject({ status: 409 });
  await db.incidentUnitBlock.updateMany({ where: { maintenanceRequestId: incident.id }, data: { releasedAt: new Date() } });
  const won = await Promise.allSettled([queue.claim(staff, 'appointments', arrive.id), queue.claim(other, 'appointments', arrive.id)]);
  expect(won.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(won.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
  const owner = (await db.handoverAppointment.findUniqueOrThrow({ where: { id: arrive.id } })).assignedStaffUserId === staff.id ? staff : other;
  const next = owner.id === staff.id ? other : staff;
  expect(await db.auditEvent.count({ where: { resourceId: arrive.id, action: 'TASK_ASSIGNMENT' } })).toBe(1);
  expect(await db.rentalContract.findUniqueOrThrow({ where: { id: arrivals[0].contract.id } })).toMatchObject({ status: 'READY_FOR_HANDOVER' });

  const competing = await Promise.allSettled([queue.claim(staff, 'appointments', race.id),
    appointments.assignAppointment(race.id, { staffUserId: other.id, expectedAssignedStaffUserId: null }, manager)]);
  expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(competing.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });

  await queue.exception(owner, 'appointments', arrive.id, { reason: 'Phát sinh ngoại lệ bàn giao' }, false);
  expect((await queue.coordination(manager)).changes).toEqual(expect.arrayContaining([expect.objectContaining({
    id: arrive.id, selfClaimedBy: owner.id, exception: 'Phát sinh ngoại lệ bàn giao',
  })]));
  await expect(appointments.completeHandover(arrive.id, {}, owner)).rejects.toThrow(/chờ quản lý/);
  await appointments.assignAppointment(arrive.id, { staffUserId: next.id, expectedAssignedStaffUserId: owner.id }, manager);
  expect((await queue.coordination(manager)).changes.find(item => item.id === arrive.id))
    .toMatchObject({ managerAssignedTo: next.id });
  await expect(appointments.completeHandover(arrive.id, {}, owner)).rejects.toMatchObject({ status: 403 });
  await queue.exception(manager, 'appointments', arrive.id, { reason: 'Đã kiểm tra điều kiện' }, true);
  await expect(appointments.confirmAppointment(arrive.id, next)).resolves.toMatchObject({ id: arrive.id });

  const active = await rental(true);
  const leaving = await db.returnRequest.create({ data: {
    returnCode: randomUUID(), idempotencyKey: randomUUID(), reservationId: active.reservation.id, requestedByUserId: customer.id,
    activeKey: 'RETURN_CONTRACT:' + active.contract.id,
    inspections: { create: { rentalContractId: active.contract.id, storageUnitId: active.unit.id } },
  }, include: { inspections: true } });
  expect((await queue.list(inspector)).items).toEqual(expect.arrayContaining([expect.objectContaining({
    id: leaving.id, unit: active.unit.unitNumber,
  })]));
  await expect(returns.startInspection(leaving.id, inspector)).rejects.toMatchObject({ status: 403 });
  await expect(queue.claim(inspector, 'returns', leaving.id)).resolves.toMatchObject({ assignedStaffUserId: inspector.id });
  await expect(returns.startInspection(leaving.id, inspector)).resolves.toMatchObject({ status: 'INSPECTION_IN_PROGRESS' });
  await expect(returns.settleEarlyReturn(leaving.id, {}, other)).rejects.toMatchObject({ status: 403 });
  await expect(queue.claim(staff, 'maintenance', leaving.id)).rejects.toMatchObject({ status: 403 });
  await expect(queue.claim(staff, 'damage-claims', leaving.id)).rejects.toMatchObject({ status: 403 });

  const support = new SupportService(db);
  const supportCase = await db.supportRequest.create({ data: { supportCode: randomUUID(), idempotencyKey: randomUUID(),
    customerUserId: customer.id, reservationId: active.reservation.id, rentalContractId: active.contract.id, storageUnitId: active.unit.id,
    category: 'ACCESS_CODE_ISSUE', description: 'Access code issue fixture', subject: 'Mã ra vào' } });
  await expect(queue.claim(staff, 'support-requests', supportCase.id)).resolves.toMatchObject({ assignedStaffUserId: staff.id });
  await support.start(supportCase.id, randomUUID(), staff);
  const resolution = { resolutionType: 'ACCESS_RESTORED', resolutionNote: 'Đối chiếu hồ sơ đang thuê tại cơ sở' };
  await expect(support.resolveAssignedRequest(supportCase.id, resolution, randomUUID(), staff)).rejects.toMatchObject({ status: 400 });
  await expect(support.resolveAssignedRequest(supportCase.id, { ...resolution, identityVerified: true }, randomUUID(), staff))
    .resolves.toMatchObject({ status: 'RESOLVED' });
  const specialCase = await db.supportRequest.create({ data: { supportCode: randomUUID(), idempotencyKey: randomUUID(),
    customerUserId: customer.id, reservationId: active.reservation.id, category: 'PAYMENT_SUPPORT', description: 'Special fixture', subject: 'Đối soát' } });
  await expect(queue.claim(other, 'support-requests', specialCase.id)).rejects.toMatchObject({ status: 409 });
  const escalatedCase = await db.supportRequest.create({ data: { supportCode: randomUUID(), idempotencyKey: randomUUID(),
    customerUserId: customer.id, reservationId: active.reservation.id, category: 'OTHER', description: 'Escalation fixture', subject: 'Hỗ trợ tại cơ sở' } });
  await queue.claim(staff, 'support-requests', escalatedCase.id);
  await support.start(escalatedCase.id, randomUUID(), staff);
  await support.escalate(escalatedCase.id, { reason: 'Cần quản lý xác minh tình huống' }, randomUUID(), staff);
  await expect(queue.claim(other, 'support-requests', escalatedCase.id)).rejects.toMatchObject({ status: 409 });
  await support.assign(escalatedCase.id, { staffUserId: other.id, expectedAssignedStaffUserId: staff.id }, randomUUID(), manager);
  await expect(support.start(escalatedCase.id, randomUUID(), staff)).rejects.toMatchObject({ status: 403 });

  await returns.updateInspection(leaving.id, leaving.inspections[0].id, { result: 'PASS', conditionNote: 'Kho trống và đúng hiện trạng.' }, inspector);
  await expect(returns.finalize(leaving.id, inspector, { unitsEmpty: false, accessRevoked: true })).rejects.toMatchObject({ status: 400 });
  await expect(returns.finalize(leaving.id, inspector, { unitsEmpty: true, accessRevoked: true })).resolves.toMatchObject({ status: 'PENDING_SETTLEMENT' });
  expect(await db.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: leaving.id } })).toMatchObject({ settledAt: null, refundAmount: 100n });
  await expect(returns.settleEarlyReturn(leaving.id, {}, inspector)).rejects.toMatchObject({ status: 403 });
});


it('checks the real queue API with session authentication, role separation, and live FacilityAccess changes', async () => {
  const person = actor('api-staff', 'FACILITY_STAFF');
  const customer = namespace + 'api-customer';
  await db.user.create({ data: { id: customer, role: 'STORAGE_CUSTOMER', email: customer + '@example.test',
    fullName: 'Khách kiểm thử API', passwordHash: 'not-used' } });
  const password = randomUUID();
  const salt = randomUUID().replaceAll('-', '');
  await db.user.create({ data: { ...person, passwordHash: ['scrypt', salt, scryptSync(password, salt, 64).toString('hex')].join('$') } });
  const access = await db.facilityAccess.create({ data: { id: randomUUID(), userId: person.id, facilityId: b, grantedById: manager.id,
    activeKey: JSON.stringify([person.id, b]) } });
  const starts = new Date();
  const reservation = await db.reservation.create({ data: { reservationCode: randomUUID(), idempotencyKey: randomUUID(),
    customerId: customer, facilityId: b, storageTypeId: namespace + 'type', quantity: 1, startDate: starts,
    endDate: new Date(+starts + 86400000), periodMode: 'DURATION', status: 'CONFIRMED', quoteSnapshot: {}, availabilitySnapshot: {} } });
  const support = await db.supportRequest.create({ data: { supportCode: randomUUID(), idempotencyKey: randomUUID(),
    customerUserId: customer, reservationId: reservation.id, priority: 'HIGH', category: 'OTHER', description: 'Routine support fixture', subject: 'Hỗ trợ tại cơ sở' } });
  const { FoundationHttpModule } = await import('./foundation-http.module.js');
  const module = await Test.createTestingModule({ imports: [FoundationHttpModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  try {
    await app.init();
    const client = request(app.getHttpServer());
    await client.get('/api/staff/assignment-queue').expect(401);
    const login = await client.post('/api/auth/login').send({ email: person.email, password }).expect(200);
    const authorization = 'Bearer ' + login.body.token;
    await client.get('/api/manager/assignment-queue').set('Authorization', authorization).expect(403);
    const queue = await client.get('/api/staff/assignment-queue').set('Authorization', authorization).expect(200);
    const item = queue.body.items.find((row: { id: string }) => row.id === support.id);
    expect(item).toMatchObject({ id: support.id, reference: reservation.reservationCode, priority: 'HIGH', customerHint: 'K.k.t.A' });
    expect(item).not.toHaveProperty('customer');
    expect(item).not.toHaveProperty('description');
    const claim = '/api/staff/assignment-queue/support-requests/' + support.id + '/claim';
    await db.facilityAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), revokedById: manager.id, activeKey: null } });
    await client.patch(claim).set('Authorization', authorization).send({}).expect(403);
    await db.facilityAccess.update({ where: { id: access.id }, data: { revokedAt: null, revokedById: null, activeKey: JSON.stringify([person.id, b]) } });
    const saved = await client.patch(claim).set('Authorization', authorization).send({}).expect(200);
    expect(saved.body).toMatchObject({ id: support.id, assignedStaffUserId: person.id, assignedAt: expect.any(String) });
    await client.patch(claim).set('Authorization', authorization).send({}).expect(409);
  } finally {
    await app.close();
  }
});


it('protects Staff access with self-claimed work and exposes relocation and task audit through the Admin API', async () => {
  const password = randomUUID();
  const salt = randomUUID().replaceAll('-', '');
  const passwordHash = ['scrypt', salt, scryptSync(password, salt, 64).toString('hex')].join('$');
  const admin = { id: namespace + 'audit-admin', role: 'SYSTEM_ADMINISTRATOR', fullName: 'Quản trị kiểm thử',
    email: namespace + 'audit-admin@example.test', phone: '' } as const;
  const first = actor('audit-first', 'FACILITY_STAFF');
  const second = actor('audit-second', 'FACILITY_STAFF');
  const double = actor('audit-two', 'FACILITY_STAFF');
  const siteManager = actor('audit-manager', 'FACILITY_MANAGER');
  await db.user.createMany({ data: [admin, first, second, double, siteManager].map(({ id, role, fullName, email }) => ({ id, role, fullName, email, passwordHash })) });
  const customer = namespace + 'audit-customer';
  await db.user.create({ data: { id: customer, role: 'STORAGE_CUSTOMER', email: customer + '@example.test',
    fullName: 'Khách kiểm thử', passwordHash: 'not-used' } });
  const from = new Date();
  const booking = await db.reservation.create({ data: { idempotencyKey: randomUUID(), reservationCode: randomUUID(),
    customerId: customer, facilityId: b, storageTypeId: namespace + 'type', quantity: 1, startDate: from, endDate: new Date(+from + 86400000),
    periodMode: 'DURATION', status: 'CONFIRMED', quoteSnapshot: {}, availabilitySnapshot: {} } });
  const support = await db.supportRequest.create({ data: { supportCode: randomUUID(), idempotencyKey: randomUUID(),
    customerUserId: customer, reservationId: booking.id, category: 'OTHER', subject: 'Hỗ trợ tại cơ sở', description: 'Admin audit fixture' } });
  const { FoundationHttpModule } = await import('./foundation-http.module.js');
  const module = await Test.createTestingModule({ imports: [FoundationHttpModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  try {
    await app.init();
    const client = request(app.getHttpServer());
    const login = (email: string) => client.post('/api/auth/login').send({ email, password }).expect(200);
    const adminHeader = 'Bearer ' + (await login(admin.email)).body.token;
    const get = (path: string) => client.get('/api/admin' + path).set('Authorization', adminHeader);
    const patch = (path: string, body: object) => client.patch('/api/admin' + path).set('Authorization', adminHeader).send(body);
    const grant = (userId: string, facilityId: string) => client.post('/api/admin/facility-access').set('Authorization', adminHeader).send({ userId, facilityId });
    const [firstGrant, , lastManagerGrant] = await Promise.all([
      grant(first.id, b).expect(201), grant(second.id, b).expect(201), grant(siteManager.id, a).expect(201),
    ]);
    expect((await patch('/facility-access/' + lastManagerGrant.body.id + '/revoke', {}).expect(409)).body.code)
      .toBe('LAST_FACILITY_MANAGER');
    expect((await patch('/facility-access/users/' + siteManager.id + '/relocate',
      { expectedAccessId: lastManagerGrant.body.id, facilityId: b }).expect(409)).body.code).toBe('LAST_FACILITY_MANAGER');
    const attempts = await Promise.all([grant(double.id, a), grant(double.id, b)]);
    expect(attempts.map(response => response.status).sort()).toEqual([201, 409]);
    const staffHeader = 'Bearer ' + (await login(first.email)).body.token;
    await client.get('/api/admin/audit-events').set('Authorization', staffHeader).expect(403);
    await client.patch('/api/staff/assignment-queue/support-requests/' + support.id + '/claim').set('Authorization', staffHeader).send({}).expect(200);
    expect((await get('/users/' + first.id + '/access').expect(200)).body.openAssignments).toBe(1);
    const relocation = '/facility-access/users/' + first.id + '/relocate';
    const destination = { facilityId: a, expectedAccessId: firstGrant.body.id };
    await patch(relocation, destination).expect(409);
    await patch('/facility-access/' + firstGrant.body.id + '/revoke', {}).expect(409);

    const operations = new SupportService(db);
    await operations.assign(support.id, { staffUserId: second.id, expectedAssignedStaffUserId: first.id }, randomUUID(), manager);
    const queue = new AssignmentQueueService(db, new AppointmentsService(db), new ReturnsService(db));
    await queue.release(manager, 'support-requests', support.id, { reason: 'Trả về hàng chờ', expectedAssignedStaffUserId: second.id });
    await operations.assign(support.id, { staffUserId: second.id, expectedAssignedStaffUserId: null }, randomUUID(), manager);

    expect((await get('/users/' + first.id + '/access').expect(200)).body.openAssignments).toBe(0);
    await patch(relocation, destination).expect(200);
    await client.get('/api/auth/me').set('Authorization', staffHeader).expect(401);
    const permissionScope = { category: 'ACTIVITY', scope: 'permissions', accountId: first.id, action: 'RELOCATE_FACILITY_ACCESS' };
    const history = await get('/audit-events').query({ ...permissionScope, outcome: 'SUCCESS', search: first.email.toUpperCase(), limit: 1 }).expect(200);
    expect(history.body).toMatchObject({ total: 1, items: [expect.objectContaining({
      action: 'RELOCATE_FACILITY_ACCESS', actorId: admin.id, actorName: admin.fullName,
      targetUserId: first.id, targetAccount: expect.objectContaining({ fullName: first.fullName, email: first.email }),
      previousFacilityName: b, facilityName: a, metadata: expect.objectContaining({ previousFacilityId: b, facilityId: a }),
    })] });
    const id = history.body.items[0].id;
    expect((await get('/audit-events').query({ ...permissionScope, outcome: 'SUCCESS', page: 2, limit: 1 }).expect(200)).body)
      .toMatchObject({ total: 1, items: [] });
    expect((await get('/audit-events').query({ category: 'ACTIVITY', scope: 'permissions', event: id }).expect(200)).body.items[0].id).toBe(id);
    expect((await get('/audit-events').query({ ...permissionScope, outcome: 'FAILURE' }).expect(200)).body.total).toBe(1);

    for (const [kind, expected] of [['CLAIM', first.id], ['REASSIGN', second.id], ['RELEASE', null], ['ASSIGN', second.id]] as const) {
      const result = await get('/audit-events').query({ category: 'ACTIVITY', action: 'TASK_ASSIGNMENT:' + kind, search: support.id }).expect(200);
      expect(result.body).toMatchObject({ total: 1, items: [expect.objectContaining({ facilityName: b, metadata: expect.objectContaining({
        assignedStaffUserId: expected,
      }) })] });
    }
    const shift = await db.auditEvent.create({ data: { category: 'ACTIVITY', action: 'CREATE_SHIFT', outcome: 'SUCCESS', actorId: manager.id,
      actorRole: manager.role, resource: 'staff-shifts', resourceId: randomUUID(), route: '/manager/staff-shifts', method: 'POST', httpStatus: 201 } });
    expect((await get('/audit-events').query({ category: 'ACTIVITY', action: 'CREATE_SHIFT', event: shift.id }).expect(200)).body.total).toBe(1);
  } finally {
    await app.close();
  }
});
