import 'dotenv/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
});

describe('BookingService with PostgreSQL persistence', () => {
  let prisma: PrismaService;
  let service: BookingService;
  let user: PublicUser;

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
      },
    });
    await prisma.storageUnit.createMany({ data: unitNumbers.map((unitNumber, index) => ({ storageTypeId: productId, unitNumber, row: 1, position: index + 1 })) });
    const stored = await prisma.user.create({ data: { id: userId, fullName: 'Test Customer', email: `${runId}@example.test`, phone: '0900000000', role: 'CUSTOMER', passwordHash: 'test-only' } });
    user = { id: stored.id, fullName: stored.fullName, email: stored.email, phone: stored.phone ?? '', role: stored.role };
    service = new BookingService(prisma);
  });

  afterEach(async () => {
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId: productId } });
    await prisma.contactInquiry.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId: productId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
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

  it('supports custom periods shorter than one month without inventing a rate', async () => {
    const result = await service.checkAvailability({ ...baseDraft(), periodMode: 'dates', durationMonths: undefined, endDate: futureDate(67) });
    expect(result.available).toBe(true);
    expect(result.quote.periodStatus).toBe('SHORT_DURATION_UNDECIDED');
    expect(result.quote.rentalSubtotal).toBeNull();
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
    const input = { ...baseDraft(), fullName: 'Guest Test', phone: '0900000001', email: `guest-${runId}@example.test` };
    const first = await service.createInquiry(input);
    const second = await service.createInquiry(input);
    expect(first.id).toMatch(/^WDPQ-/);
    expect(second.id).toBe(first.id);
    expect(first.persistence).toBe('DATABASE');
    await expect(service.getInquiry(first.id, undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.getInquiry(first.id, first.accessToken)).id).toBe(first.id);
  });

  it('rejects pay-now while final pricing and gateway are unavailable', async () => {
    await expect(service.createInquiry({ ...baseDraft(), paymentChoice: 'pay-now', fullName: 'Guest Test', phone: '0900000001', email: `pay-${runId}@example.test` })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an idempotent authenticated PENDING reservation without allocating a unit', async () => {
    const first = await service.createReservation(user, baseDraft());
    const second = await service.createReservation(user, baseDraft());
    expect(first.id).toMatch(/^WDP-/);
    expect(second.id).toBe(first.id);
    expect(first.unitAssignment).toBeNull();
    expect(first.persistence).toBe('DATABASE');
    expect((await service.checkAvailability(baseDraft())).available).toBe(true);
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
