import 'dotenv/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BookingService } from './booking.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `test-facility-${runId}`;
const productId = `test-product-${runId}`;
const userId = `test-user-${runId}`;
const unitNumbers = [1, 2, 3].map((index) => `TEST-${runId}-${index}`);
const futureDate = (days = 60) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const baseDraft = () => ({
  productId,
  startDate: futureDate(),
  periodMode: 'duration',
  durationMonths: 3,
  quantity: 1,
  adjacencyPreference: false,
  addonIds: [],
  paymentChoice: 'pay-later',
  paymentPlan: 'PAY_MONTHLY',
});

describe('BookingService with PostgreSQL persistence', () => {
  let prisma: PrismaService;
  let service: BookingService;
  let user: PublicUser;
  const manager: PublicUser = {
    id: `test-manager-${runId}`,
    fullName: 'Test Manager',
    email: `manager-${runId}@example.test`,
    phone: '0900000099',
    role: 'MANAGER',
  };

  beforeAll(async () => {
    process.env.INQUIRY_LOOKUP_SECRET ??= 'test-inquiry-secret-that-is-at-least-32-characters';
    prisma = new PrismaService();
    await prisma.$connect();
    await prisma.facility.create({ data: { id: facilityId, code: `TEST-${runId}`, name: 'Test Facility', address: 'Test only' } });
    await prisma.storageType.create({
      data: {
        id: productId,
        facilityId,
        code: `TP-${runId}`,
        name: 'Test Storage',
        sizeId: 'small',
        sizeName: 'Kho nhỏ',
        kicker: 'Test only',
        condition: 'STANDARD',
        widthCm: 150,
        lengthCm: 200,
        heightCm: 240,
        roomEquivalent: 'Test room',
        capacity: 'Test capacity',
        boxCount: '20–24 thùng',
        suitableItems: ['Boxes'],
        image: 'https://example.test/storage.jpg',
        imageAlt: 'Test storage',
        floor: 'Test floor',
        access: 'Test access',
        features: ['Test feature'],
        monthlyRate: 1500000,
        minRentalDays: 7,
        allowDailyRental: true,
      },
    });
    await prisma.storageUnit.createMany({ data: unitNumbers.map((unitNumber, index) => ({ storageTypeId: productId, unitNumber, row: 1, position: index + 1 })) });
    const stored = await prisma.user.create({ data: { id: userId, fullName: 'Test Customer', email: `${runId}@example.test`, phone: '0900000000', role: 'CUSTOMER', passwordHash: 'test-only' } });
    user = { id: stored.id, fullName: stored.fullName, email: stored.email, phone: stored.phone ?? '', role: stored.role };
    service = new BookingService(prisma);
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId: productId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId: productId } });
    await prisma.contactInquiry.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId: productId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId: productId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId: productId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId: productId } });
    await prisma.contactInquiry.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageType.delete({ where: { id: productId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  it('accepts one or multiple units when enough physical inventory exists', async () => {
    expect((await service.checkAvailability(baseDraft())).available).toBe(true);
    const multiple = await service.checkAvailability({ ...baseDraft(), quantity: 3, adjacencyPreference: true });
    expect(multiple.available).toBe(true);
    expect(multiple.quote.periodStatus).toBe('APPROVED_DURATION');
  });

  it('prices an approved seven-day custom period through Pricing V1', async () => {
    const result = await service.checkAvailability({ ...baseDraft(), periodMode: 'dates', durationMonths: undefined, endDate: futureDate(67) });
    expect(result.available).toBe(true);
    expect(result.quote.periodStatus).toBe('SHORT_DURATION_APPROVED');
    expect(result.quote.billingMode).toBe('DAILY');
    expect(result.quote.rentalAmount).toBe(350000);
  });

  it('requires paymentPlan on new booking requests instead of using the legacy fallback', async () => {
    const input = { ...baseDraft(), paymentPlan: undefined };
    await expect(service.checkAvailability(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes OCCUPIED units regardless of any planned date', async () => {
    await prisma.storageUnit.updateMany({ where: { storageTypeId: productId }, data: { status: 'OCCUPIED' } });
    const result = await service.checkAvailability(baseDraft());
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('OCCUPIED');
  });

  it('excludes MAINTENANCE units and rejects quantity above remaining inventory', async () => {
    await prisma.storageUnit.updateMany({ where: { storageTypeId: productId, unitNumber: { in: unitNumbers.slice(0, 2) } }, data: { status: 'MAINTENANCE' } });
    const result = await service.checkAvailability({ ...baseDraft(), quantity: 2 });
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('INSUFFICIENT_INVENTORY');
  });

  it('creates an idempotent guest inquiry with a protected lookup token', async () => {
    const input = { ...baseDraft(), fullName: 'Guest Test', phone: '0900000001', email: `guest-${runId}@example.test`, monthlyUnitPrice: 1, depositAmount: 1, quotedTotalAmount: 1 };
    const first = await service.createInquiry(input);
    const second = await service.createInquiry(input);
    expect(first.id).toMatch(/^WDPQ-/);
    expect(second.id).toBe(first.id);
    expect(first.persistence).toBe('DATABASE');
    expect(first.quote).toMatchObject({ monthlyUnitPrice: 1500000, billingMode: 'MONTHLY', termMonths: 3, depositAmount: 1500000, quotedTotalAmount: 6000000 });
    const stored = await prisma.contactInquiry.findUniqueOrThrow({ where: { inquiryCode: first.id } });
    expect(stored.quoteSnapshot).toMatchObject({ monthlyUnitPrice: 1500000, quotedTotalAmount: 6000000 });
    await expect(service.getInquiry(first.id, undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.getInquiry(first.id, first.accessToken)).id).toBe(first.id);
  });

  it('rejects pay-now while final pricing and gateway are unavailable', async () => {
    await expect(service.createInquiry({ ...baseDraft(), paymentChoice: 'pay-now', fullName: 'Guest Test', phone: '0900000001', email: `pay-${runId}@example.test` })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an idempotent authenticated PENDING reservation without allocating a unit', async () => {
    const first = await service.createReservation(user, { ...baseDraft(), monthlyUnitPrice: 1, depositAmount: 1, quotedTotalAmount: 1 });
    const second = await service.createReservation(user, baseDraft());
    expect(first.id).toMatch(/^WDP-/);
    expect(second.id).toBe(first.id);
    expect(first.unitAssignment).toBeNull();
    expect(first.persistence).toBe('DATABASE');
    expect(first.quote).toMatchObject({ monthlyUnitPrice: 1500000, billingMode: 'MONTHLY', termMonths: 3, rentalAmount: 4500000, depositAmount: 1500000, quotedTotalAmount: 6000000 });
    expect((await service.checkAvailability(baseDraft())).available).toBe(true);
  });

  it('lets a manager list and view PENDING reservations without allocating units', async () => {
    const created = await service.createReservation(user, { ...baseDraft(), note: 'manager-list' });
    const list = await service.listManagerReservations(1, 20);
    expect(list.items.some((item) => item.id === created.id)).toBe(true);
    const detail = await service.getManagerReservation(created.id);
    expect(detail.status).toBe('PENDING');
    expect(detail.allocatedUnits).toHaveLength(0);
    expect(await prisma.reservationUnit.count({ where: { reservation: { reservationCode: created.id } } })).toBe(0);
  });

  it('confirms atomically and allocates multiple nearby physical units', async () => {
    const created = await service.createReservation(user, { ...baseDraft(), quantity: 2, adjacencyPreference: true, note: 'allocate-two' });
    const confirmed = await service.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.allocatedUnits).toHaveLength(2);
    expect(confirmed.allocatedUnits.map((unit) => unit.position)).toEqual([1, 2]);
    expect(await prisma.reservationUnit.count({ where: { reservation: { reservationCode: created.id } } })).toBe(2);
    const contracts = await prisma.rentalContract.findMany({ where: { reservation: { reservationCode: created.id } }, orderBy: { contractCode: 'asc' } });
    expect(contracts).toHaveLength(2);
    expect(contracts.map((contract) => contract.contractCode)).toEqual([`${created.id}-C01`, `${created.id}-C02`]);
    expect(contracts.every((contract) => contract.status === 'PENDING_PAYMENT')).toBe(true);
    expect(contracts.map((contract) => contract.reservationUnitId)).toEqual(expect.arrayContaining((await prisma.reservationUnit.findMany({ where: { reservationId: contracts[0].reservationId } })).map((unit) => unit.id)));
    expect(await prisma.storageUnit.count({ where: { id: { in: confirmed.allocatedUnits.map((unit) => unit.unitId) }, status: 'AVAILABLE' } })).toBe(2);
    const invoices = await prisma.invoice.findMany({ where: { reservation: { reservationCode: created.id } } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ type: 'INITIAL', status: 'OPEN', rentalAmount: 3000000n, depositAmount: 3000000n, totalAmount: 6000000n });

    await service.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager);
    expect(await prisma.rentalContract.count({ where: { reservation: { reservationCode: created.id } } })).toBe(2);
    expect(await prisma.invoice.count({ where: { reservation: { reservationCode: created.id } } })).toBe(1);

    const cancelled = await service.updateManagerReservationStatus(created.id, { status: 'CANCELLED' }, manager);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.allocatedUnits.every((unit) => unit.releasedAt !== null)).toBe(true);
  });

  it('keeps the historical pricing snapshot immutable during Manager confirmation', async () => {
    const created = await service.createReservation(user, { ...baseDraft(), note: 'immutable-pricing' });
    const before = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id } });
    await prisma.storageType.update({ where: { id: productId }, data: { monthlyRate: 9999999 } });
    try {
      await service.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager);
      const after = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id } });
      expect(after.quoteSnapshot).toEqual(before.quoteSnapshot);
      expect(after.quoteSnapshot).toMatchObject({ monthlyUnitPrice: 1500000, quotedTotalAmount: 6000000 });
      const contract = await prisma.rentalContract.findFirstOrThrow({ where: { reservationId: after.id } });
      expect(contract.startDate.toISOString().slice(0, 10)).toBe(created.startDate);
      expect(contract.endDate.toISOString().slice(0, 10)).toBe(created.endDateExclusive);
    } finally {
      await prisma.storageType.update({ where: { id: productId }, data: { monthlyRate: 1500000 } });
    }
  });

  it('rechecks availability and rolls back without partial allocation when inventory became insufficient', async () => {
    const created = await service.createReservation(user, { ...baseDraft(), quantity: 2, note: 'rollback-insufficient' });
    await prisma.storageUnit.updateMany({
      where: { storageTypeId: productId, unitNumber: { in: unitNumbers.slice(0, 2) } },
      data: { status: 'MAINTENANCE' },
    });
    await expect(service.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager)).rejects.toBeInstanceOf(ConflictException);
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id }, include: { units: true } });
    expect(stored.status).toBe('PENDING');
    expect(stored.units).toHaveLength(0);
    expect(await prisma.rentalContract.count({ where: { reservationId: stored.id } })).toBe(0);
    expect(await prisma.invoice.count({ where: { reservationId: stored.id } })).toBe(0);
  });

  it('never allocates OCCUPIED or MAINTENANCE units during confirmation', async () => {
    const created = await service.createReservation(user, { ...baseDraft(), note: 'physical-status-filter' });
    await prisma.storageUnit.update({ where: { unitNumber: unitNumbers[0] }, data: { status: 'OCCUPIED' } });
    await prisma.storageUnit.update({ where: { unitNumber: unitNumbers[1] }, data: { status: 'MAINTENANCE' } });
    const confirmed = await service.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager);
    expect(confirmed.allocatedUnits).toHaveLength(1);
    expect(confirmed.allocatedUnits[0].unitNumber).toBe(unitNumbers[2]);
  });

  it('rejects an overlapping confirmation and preserves the second reservation as PENDING', async () => {
    const first = await service.createReservation(user, { ...baseDraft(), quantity: 2, note: 'conflict-first' });
    const second = await service.createReservation(user, { ...baseDraft(), quantity: 2, note: 'conflict-second' });
    await service.updateManagerReservationStatus(first.id, { status: 'CONFIRMED' }, manager);
    await expect(service.updateManagerReservationStatus(second.id, { status: 'CONFIRMED' }, manager)).rejects.toBeInstanceOf(ConflictException);
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: second.id }, include: { units: true } });
    expect(stored.status).toBe('PENDING');
    expect(stored.units).toHaveLength(0);
  });

  it('blocks non-manager status changes and supports the normalized terminal flow', async () => {
    const rejected = await service.createReservation(user, { ...baseDraft(), note: 'reject-me' });
    await expect(service.updateManagerReservationStatus(rejected.id, { status: 'REJECTED' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.updateManagerReservationStatus(rejected.id, { status: 'REJECTED' }, manager)).status).toBe('REJECTED');
    await expect(service.updateManagerReservationStatus(rejected.id, { status: 'CONFIRMED' }, manager)).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks overlapping confirmed allocations for the complete interval', async () => {
    const created = await service.createReservation(user, baseDraft());
    const reservation = await prisma.reservation.update({ where: { reservationCode: created.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId: productId }, take: 2, orderBy: { unitNumber: 'asc' } });
    await prisma.reservationUnit.createMany({ data: units.map((unit) => ({ reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: new Date(created.startDate), plannedEndDate: new Date(created.endDateExclusive) })) });
    const conflict = await service.checkAvailability({ ...baseDraft(), quantity: 2 });
    expect(conflict.available).toBe(false);
    expect(conflict.reasonCode).toBe('CONFLICT');
    const adjacent = await service.checkAvailability({ ...baseDraft(), startDate: created.endDateExclusive, quantity: 3 });
    expect(adjacent.available).toBe(true);
  });

  it('keeps reservations private to their owner', async () => {
    const created = await service.createReservation(user, baseDraft());
    expect(await service.listReservations(user.id)).toHaveLength(1);
    await expect(service.getReservation({ ...user, id: 'another-user' }, created.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.getReservation(user, created.id)).id).toBe(created.id);
  });
});
