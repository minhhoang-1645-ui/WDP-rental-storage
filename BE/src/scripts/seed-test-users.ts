import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const scryptAsync = promisify(scrypt);

const testUsers: Array<{ email: string; fullName: string; phone: string; role: UserRole }> = [
  { email: 'customer@test.com', fullName: 'WDP Test Customer', phone: '0900000001', role: 'CUSTOMER' },
  { email: 'staff@test.com', fullName: 'WDP Test Staff', phone: '0900000002', role: 'STAFF' },
  { email: 'manager@test.com', fullName: 'WDP Test Manager', phone: '0900000003', role: 'MANAGER' },
  { email: 'admin@test.com', fullName: 'WDP Test Admin', phone: '0900000004', role: 'ADMIN' },
];

async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Test-user seeding is disabled in production.');
  const password = process.env.SEED_TEST_USERS_PASSWORD ?? process.env.SEED_MANAGER_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error('Set SEED_TEST_USERS_PASSWORD (preferred) or SEED_MANAGER_PASSWORD to a 12-128 character development password.');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    for (const user of testUsers) {
      const hash = await passwordHash(password);
      await prisma.user.upsert({
        where: { email: user.email },
        update: { fullName: user.fullName, phone: user.phone, role: user.role, accountStatus: 'ACTIVE', passwordHash: hash },
        create: { ...user, accountStatus: 'ACTIVE', passwordHash: hash },
      });
    }


    const [customer, staff, manager] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'customer@test.com' } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'staff@test.com' } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'manager@test.com' } }),
    ]);
    const storageType = await prisma.storageType.findUnique({ where: { id: 'sm-b12' } });
    if (!storageType) throw new Error('Run npm run prisma:seed before seed:test-users so the approved storage catalog exists.');

    const [availableUnit, occupiedUnit, maintenanceUnit] = await Promise.all([
      prisma.storageUnit.upsert({ where: { unitNumber: 'DEMO-SM-AVAILABLE' }, update: { storageTypeId: storageType.id, status: 'AVAILABLE', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 1 }, create: { storageTypeId: storageType.id, unitNumber: 'DEMO-SM-AVAILABLE', status: 'AVAILABLE', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 1 } }),
      prisma.storageUnit.upsert({ where: { unitNumber: 'DEMO-SM-OCCUPIED' }, update: { storageTypeId: storageType.id, status: 'OCCUPIED', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 2 }, create: { storageTypeId: storageType.id, unitNumber: 'DEMO-SM-OCCUPIED', status: 'OCCUPIED', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 2 } }),
      prisma.storageUnit.upsert({ where: { unitNumber: 'DEMO-SM-MAINTENANCE' }, update: { storageTypeId: storageType.id, status: 'MAINTENANCE', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 3 }, create: { storageTypeId: storageType.id, unitNumber: 'DEMO-SM-MAINTENANCE', status: 'MAINTENANCE', floor: 'Tầng trệt', zone: 'DEMO', row: 1, position: 3 } }),
    ]);

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const activeStart = new Date(today); activeStart.setUTCDate(activeStart.getUTCDate() - 30);
    const activeEnd = new Date(today); activeEnd.setUTCDate(activeEnd.getUTCDate() + 180);
    const pendingStart = new Date(today); pendingStart.setUTCDate(pendingStart.getUTCDate() + 14);
    const pendingEnd = new Date(pendingStart); pendingEnd.setUTCMonth(pendingEnd.getUTCMonth() + 3);
    const unknownQuote = { demo: true, pricingStatus: 'NEEDS_CONFIRMATION', rentalAmount: null, depositAmount: null, additionalFees: null };

    const activeReservation = await prisma.reservation.upsert({
      where: { reservationCode: 'WDP-DEMO-ACTIVE' },
      update: { customerId: customer.id, facilityId: storageType.facilityId, storageTypeId: storageType.id, quantity: 1, startDate: activeStart, endDate: activeEnd, status: 'CONFIRMED', quoteSnapshot: unknownQuote, availabilitySnapshot: { demo: true, available: true } },
      create: { reservationCode: 'WDP-DEMO-ACTIVE', customerId: customer.id, facilityId: storageType.facilityId, storageTypeId: storageType.id, quantity: 1, startDate: activeStart, endDate: activeEnd, periodMode: 'DURATION', durationMonths: 6, adjacentPreference: false, status: 'CONFIRMED', quoteSnapshot: unknownQuote, availabilitySnapshot: { demo: true, available: true }, idempotencyKey: 'demo-active-reservation-v1', confirmedAt: new Date() },
    });
    const activeAllocation = await prisma.reservationUnit.upsert({
      where: { reservationId_storageUnitId: { reservationId: activeReservation.id, storageUnitId: occupiedUnit.id } },
      update: { plannedStartDate: activeStart, plannedEndDate: activeEnd, releasedAt: null, actualVacatedAt: null },
      create: { reservationId: activeReservation.id, storageUnitId: occupiedUnit.id, plannedStartDate: activeStart, plannedEndDate: activeEnd },
    });
    const activeContract = await prisma.rentalContract.upsert({
      where: { contractCode: 'WDP-DEMO-ACTIVE-C01' },
      update: { reservationId: activeReservation.id, reservationUnitId: activeAllocation.id, status: 'ACTIVE', startDate: activeStart, endDate: activeEnd, activatedAt: activeStart, completedAt: null },
      create: { contractCode: 'WDP-DEMO-ACTIVE-C01', reservationId: activeReservation.id, reservationUnitId: activeAllocation.id, status: 'ACTIVE', startDate: activeStart, endDate: activeEnd, activatedAt: activeStart },
    });

    await prisma.reservation.upsert({
      where: { reservationCode: 'WDP-DEMO-PENDING' },
      update: { customerId: customer.id, facilityId: storageType.facilityId, storageTypeId: storageType.id, quantity: 1, startDate: pendingStart, endDate: pendingEnd, status: 'PENDING', quoteSnapshot: unknownQuote, availabilitySnapshot: { demo: true, available: true } },
      create: { reservationCode: 'WDP-DEMO-PENDING', customerId: customer.id, facilityId: storageType.facilityId, storageTypeId: storageType.id, quantity: 1, startDate: pendingStart, endDate: pendingEnd, periodMode: 'DURATION', durationMonths: 3, adjacentPreference: false, status: 'PENDING', quoteSnapshot: unknownQuote, availabilitySnapshot: { demo: true, available: true }, idempotencyKey: 'demo-pending-reservation-v1' },
    });

    await prisma.maintenanceRequest.upsert({
      where: { maintenanceCode: 'WDP-MNT-DEMO-001' },
      update: { storageUnitId: maintenanceUnit.id, source: 'MANUAL', category: 'FACILITY_EQUIPMENT', priority: 'MEDIUM', status: 'OPEN', description: 'Demo maintenance case for operational testing.', reportedByUserId: manager.id, assignedStaffUserId: staff.id, activeKey: `MAINTENANCE:${maintenanceUnit.id}` },
      create: { maintenanceCode: 'WDP-MNT-DEMO-001', storageUnitId: maintenanceUnit.id, source: 'MANUAL', category: 'FACILITY_EQUIPMENT', priority: 'MEDIUM', status: 'OPEN', description: 'Demo maintenance case for operational testing.', reportedByUserId: manager.id, assignedStaffUserId: staff.id, activeKey: `MAINTENANCE:${maintenanceUnit.id}`, createIdempotencyKey: 'demo-maintenance-v1' },
    });

    await prisma.supportRequest.upsert({
      where: { supportCode: 'WDP-SUP-DEMO-001' },
      update: { customerUserId: customer.id, reservationId: activeReservation.id, rentalContractId: activeContract.id, storageUnitId: occupiedUnit.id, category: 'UNIT_ISSUE', priority: 'MEDIUM', status: 'ASSIGNED', subject: 'Demo unit access issue', description: 'Demo case for the Customer to Manager to Staff workflow.', assignedStaffUserId: staff.id },
      create: { supportCode: 'WDP-SUP-DEMO-001', customerUserId: customer.id, reservationId: activeReservation.id, rentalContractId: activeContract.id, storageUnitId: occupiedUnit.id, category: 'UNIT_ISSUE', priority: 'MEDIUM', status: 'ASSIGNED', subject: 'Demo unit access issue', description: 'Demo case for the Customer to Manager to Staff workflow.', assignedStaffUserId: staff.id, idempotencyKey: 'demo-support-v1' },
    });

    console.log(`Demo users ready: ${testUsers.map((user) => `${user.email} (${user.role})`).join(', ')}`);
    console.log(`Demo workflow ready: ${availableUnit.unitNumber} AVAILABLE, ${occupiedUnit.unitNumber} OCCUPIED, ${maintenanceUnit.unitNumber} MAINTENANCE, WDP-DEMO-ACTIVE, WDP-DEMO-PENDING, WDP-MNT-DEMO-001, WDP-SUP-DEMO-001.`);
    console.log('Demo add-ons ready: PADLOCK_STANDARD, PACKING_BOX, SHELF_STANDARD, DEHUMIDIFIER.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Test-user seed failed.');
  process.exitCode = 1;
});
