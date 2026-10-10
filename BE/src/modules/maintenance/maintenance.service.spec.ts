import 'dotenv/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BookingService } from '../booking/booking.service.js';
import { ManagerService } from '../manager/manager.service.js';
import { MaintenanceService } from './maintenance.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `maintenance-facility-${runId}`;
const storageTypeId = `maintenance-product-${runId}`;
const staffId = `maintenance-staff-${runId}`;
const otherStaffId = `maintenance-other-staff-${runId}`;
const managerId = `maintenance-manager-${runId}`;
const adminId = `maintenance-admin-${runId}`;
const customerId = `maintenance-customer-${runId}`;
const unitCodes = Array.from({ length: 5 }, (_, index) => `MNT-${runId}-${index + 1}`);
const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: `${role} Maintenance`, email: `${id}@example.test`, phone: '' });
const key = (name: string) => `maintenance-${name}-${randomUUID()}`;

describe('Maintenance V1', () => {
  let prisma: PrismaService;
  let maintenance: MaintenanceService;
  let booking: BookingService;
  let managerUnits: ManagerService;
  const staff = actor(staffId, 'STAFF');
  const otherStaff = actor(otherStaffId, 'STAFF');
  const manager = actor(managerId, 'MANAGER');
  const customer = actor(customerId, 'CUSTOMER');

  beforeAll(async () => {
    prisma = new PrismaService(); await prisma.$connect();
    maintenance = new MaintenanceService(prisma); booking = new BookingService(prisma); managerUnits = new ManagerService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `MNT-${runId}`, name: 'Maintenance test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `MNT-TYPE-${runId}`, name: 'Maintenance product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
      widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
      image: 'https://example.test/maintenance.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, position) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'M', row: 1, position: position + 1 })) });
    await prisma.user.createMany({ data: [
      { id: staffId, email: `${staffId}@example.test`, fullName: 'Maintenance Staff', role: 'STAFF', passwordHash: 'secret-hash' },
      { id: otherStaffId, email: `${otherStaffId}@example.test`, fullName: 'Other Staff', role: 'STAFF', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Maintenance Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
      { id: adminId, email: `${adminId}@example.test`, fullName: 'Maintenance Admin', role: 'ADMIN', passwordHash: 'secret-hash' },
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Maintenance Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.maintenanceRequest.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
    await prisma.maintenanceRequest.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [staffId, otherStaffId, managerId, adminId, customerId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  async function unit(index = 0) { return prisma.storageUnit.findUniqueOrThrow({ where: { unitNumber: unitCodes[index] } }); }
  const manual = async (index = 0, by: PublicUser = staff, requestKey = key('create')) => {
    const storageUnit = await unit(index);
    return maintenance.createManual({ storageUnitId: storageUnit.id, category: 'FACILITY_EQUIPMENT', priority: 'HIGH', description: 'Climate control is not functioning.' }, requestKey, by);
  };

  it('allows Staff manual AVAILABLE report, is idempotent, takes unit offline and prevents a second active case', async () => {
    const requestKey = key('same-create');
    const created = await manual(0, staff, requestKey);
    const retry = await manual(0, staff, requestKey);
    expect(retry.id).toBe(created.id);
    expect(created).toMatchObject({ source: 'MANUAL', status: 'OPEN', priority: 'HIGH', category: 'FACILITY_EQUIPMENT' });
    expect((await unit(0)).status).toBe('MAINTENANCE');
    await expect(maintenance.createManual({ storageUnitId: (await unit(0)).id, category: 'OTHER', description: 'Another issue exists.' }, key('duplicate'), manager)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.maintenanceRequest.count({ where: { storageUnitId: (await unit(0)).id } })).toBe(1);
  });

  it('rejects manual maintenance for OCCUPIED and rejects Customer creation', async () => {
    const occupied = await unit(0); await prisma.storageUnit.update({ where: { id: occupied.id }, data: { status: 'OCCUPIED' } });
    await expect(manual(0)).rejects.toMatchObject({ response: { code: 'OCCUPIED_UNIT_MAINTENANCE_REQUIRES_INCIDENT_FLOW' } });
    await prisma.storageUnit.update({ where: { id: occupied.id }, data: { status: 'AVAILABLE' } });
    await expect(manual(0, customer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('supports Staff/Manager reads, filters, Manager manual creation and never exposes passwordHash', async () => {
    await manual(0, manager);
    const staffList = await maintenance.listStaff({ page: 1, limit: 20, status: 'OPEN', priority: 'HIGH', category: 'FACILITY_EQUIPMENT', assignedToMe: false, search: unitCodes[0] }, staff);
    const managerList = await maintenance.listManager({ page: 1, limit: 20, status: 'OPEN', search: unitCodes[0] });
    expect(staffList.total).toBe(1); expect(managerList.total).toBe(1);
    expect(JSON.stringify(await maintenance.getManager(managerList.items[0].id))).not.toContain('secret-hash');
    expect(JSON.stringify(await maintenance.getStaff(staffList.items[0].id))).not.toContain('returnContext');
  });

  it('enforces STAFF assignment, Manager-only assignment/priority, and assigned-worker start rules', async () => {
    const created = await manual();
    await expect(maintenance.assign(created.id, { staffUserId: customerId }, key('bad-assignee'), manager)).rejects.toBeInstanceOf(BadRequestException);
    await expect(maintenance.assign(created.id, { staffUserId: staffId }, key('staff-assign'), staff)).rejects.toBeInstanceOf(ForbiddenException);
    const assigned = await maintenance.assign(created.id, { staffUserId: staffId }, key('assign'), manager);
    expect(assigned.assignedStaff).toMatchObject({ id: staffId, role: 'STAFF' });
    await expect(maintenance.updatePriority(created.id, { priority: 'LOW' }, key('staff-priority'), staff)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await maintenance.updatePriority(created.id, { priority: 'LOW' }, key('manager-priority'), manager)).toMatchObject({ priority: 'LOW' });
    await expect(maintenance.start(created.id, key('wrong-start'), otherStaff)).rejects.toBeInstanceOf(ForbiddenException);
    const started = await maintenance.start(created.id, key('start'), staff);
    expect(started).toMatchObject({ status: 'IN_PROGRESS', unit: { status: 'MAINTENANCE' } });
    expect((await unit()).status).toBe('MAINTENANCE');
  });

  it('requires work note, keeps unit offline, supports rejection and only Manager verification releases it', async () => {
    const created = await manual();
    await maintenance.assign(created.id, { staffUserId: staffId }, key('assign'), manager);
    await maintenance.start(created.id, key('start'), staff);
    expect(() => maintenance.completeWork(created.id, { workNote: '' }, key('empty-complete'), staff)).toThrow(BadRequestException);
    const awaiting = await maintenance.completeWork(created.id, { workNote: 'Replaced lock and tested access.' }, key('complete'), staff);
    expect(awaiting).toMatchObject({ status: 'AWAITING_VERIFICATION', unit: { status: 'MAINTENANCE' } });
    await expect(maintenance.verify(created.id, {}, key('staff-verify'), staff)).rejects.toBeInstanceOf(ForbiddenException);
    expect(() => maintenance.rejectVerification(created.id, { note: '' }, key('empty-reject'), manager)).toThrow(BadRequestException);
    const rejected = await maintenance.rejectVerification(created.id, { note: 'Lock still does not engage reliably.' }, key('reject'), manager);
    expect(rejected).toMatchObject({ status: 'IN_PROGRESS', unit: { status: 'MAINTENANCE' } });
    expect(rejected.workCompletedAt).toBeTruthy();
    await maintenance.completeWork(created.id, { workNote: 'Adjusted lock and retested twice.' }, key('complete-again'), staff);
    const completed = await maintenance.verify(created.id, { note: 'Verified operational.' }, key('verify'), manager);
    expect(completed).toMatchObject({ status: 'COMPLETED', verifiedBy: { id: managerId }, unit: { status: 'AVAILABLE' } });
    expect((await unit()).status).toBe('AVAILABLE');
    await expect(maintenance.verify(created.id, {}, key('verify-again'), manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('makes concurrent verification safe and permits a new historical case after completion', async () => {
    const created = await manual();
    await maintenance.assign(created.id, { staffUserId: staffId }, key('assign'), manager);
    await maintenance.start(created.id, key('start'), staff);
    await maintenance.completeWork(created.id, { workNote: 'Work is ready for verification.' }, key('complete'), staff);
    const attempts = await Promise.allSettled([
      maintenance.verify(created.id, { note: 'First verify.' }, key('verify-one'), manager),
      maintenance.verify(created.id, { note: 'Second verify.' }, key('verify-two'), actor(adminId, 'ADMIN')),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.maintenanceRequest.count({ where: { storageUnitId: (await unit()).id, status: 'COMPLETED' } })).toBe(1);
    const next = await manual(0, manager, key('new-case'));
    expect(next.status).toBe('OPEN');
    expect(await prisma.maintenanceRequest.count({ where: { storageUnitId: (await unit()).id } })).toBe(2);
  });

  it('preserves future confirmed allocation and exposes risk while MAINTENANCE blocks availability', async () => {
    const created = await manual();
    const startDate = new Date(); startDate.setUTCDate(startDate.getUTCDate() + 10); startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate); endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: `WDP-MNT-FUTURE-${runId}`, customerId, facilityId, storageTypeId, quantity: 1, startDate, endDate,
      periodMode: 'DURATION', durationMonths: 1, availabilitySnapshot: {}, quoteSnapshot: { paymentPlan: 'PAY_MONTHLY' } as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: key('future-reservation'),
    } });
    const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: (await unit()).id, plannedStartDate: startDate, plannedEndDate: endDate } });
    const detail = await maintenance.getManager(created.id);
    expect(detail).toMatchObject({ hasFutureAllocation: true, nextConfirmedAllocation: { reservationReference: reservation.reservationCode } });
    const unitDetail = await managerUnits.getUnit((await unit()).id);
    expect(unitDetail).toMatchObject({ activeMaintenance: { id: created.id, status: 'OPEN', priority: 'HIGH' } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId, id: { not: (await unit()).id } }, data: { status: 'MAINTENANCE' } });
    const blocked = await booking.checkAvailability({ productId: storageTypeId, startDate: startDate.toISOString().slice(0, 10), periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' });
    expect(blocked.available).toBe(false);
    await maintenance.assign(created.id, { staffUserId: staffId }, key('assign'), manager);
    await maintenance.start(created.id, key('start'), staff);
    await maintenance.completeWork(created.id, { workNote: 'Maintenance completed.' }, key('complete'), staff);
    await maintenance.verify(created.id, {}, key('verify'), manager);
    expect(await prisma.reservationUnit.findUniqueOrThrow({ where: { id: allocation.id } })).toMatchObject({ releasedAt: null, plannedStartDate: startDate, plannedEndDate: endDate });
    const stillBlocked = await booking.checkAvailability({ productId: storageTypeId, startDate: startDate.toISOString().slice(0, 10), periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' });
    expect(stillBlocked.available).toBe(false);
  });
});
