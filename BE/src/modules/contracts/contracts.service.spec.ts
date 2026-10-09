import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BookingService } from '../booking/booking.service.js';
import { ContractsService } from './contracts.service.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `contract-facility-${runId}`;
const productId = `contract-product-${runId}`;
const unitNumbers = [1, 2].map((index) => `CONTRACT-${runId}-${index}`);
const customerId = `contract-customer-${runId}`;
const otherCustomerId = `contract-other-${runId}`;
const dateAfter = (days: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

describe('ContractsService with PostgreSQL persistence', () => {
  let prisma: PrismaService;
  let booking: BookingService;
  let contracts: ContractsService;
  let customer: PublicUser;
  const manager: PublicUser = {
    id: `contract-manager-${runId}`,
    fullName: 'Contract Manager',
    email: `contract-manager-${runId}@example.test`,
    phone: '0900000100',
    role: 'MANAGER',
  };

  const draft = (quantity = 1) => ({
    productId,
    startDate: dateAfter(90),
    periodMode: 'duration',
    durationMonths: 1,
    quantity,
    adjacencyPreference: false,
    addonIds: [],
    paymentChoice: 'pay-later',
    paymentPlan: 'PAY_MONTHLY' as const,
  });

  beforeAll(async () => {
    process.env.INQUIRY_LOOKUP_SECRET ??= 'test-inquiry-secret-that-is-at-least-32-characters';
    prisma = new PrismaService();
    await prisma.$connect();
    contracts = new ContractsService(prisma);
    booking = new BookingService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `CONTRACT-${runId}`, name: 'Contract test facility', address: 'Test only' } });
    await prisma.storageType.create({
      data: {
        id: productId,
        facilityId,
        code: `CT-${runId}`,
        name: 'Contract test storage',
        sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test only', condition: 'STANDARD',
        widthCm: 150, lengthCm: 200, heightCm: 240,
        roomEquivalent: 'Test room', capacity: 'Test capacity', boxCount: '20 thùng', suitableItems: ['Boxes'],
        image: 'https://example.test/storage.jpg', imageAlt: 'Test storage', floor: 'Test floor', access: 'Test access', features: ['Test'],
        monthlyRate: 1000000,
      },
    });
    await prisma.storageUnit.createMany({ data: unitNumbers.map((unitNumber, index) => ({ storageTypeId: productId, unitNumber, row: 1, position: index + 1 })) });
    const stored = await prisma.user.create({ data: { id: customerId, fullName: 'Contract Customer', email: `contract-customer-${runId}@example.test`, phone: '0900000101', role: 'CUSTOMER', passwordHash: 'hash-never-returned' } });
    await prisma.user.create({ data: { id: otherCustomerId, fullName: 'Other Customer', email: `contract-other-${runId}@example.test`, role: 'CUSTOMER', passwordHash: 'hash-never-returned' } });
    customer = { id: stored.id, fullName: stored.fullName, email: stored.email, phone: stored.phone ?? '', role: stored.role };
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId: productId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId: productId } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId: productId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId: productId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId: productId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId: productId } });
    await prisma.storageType.delete({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  async function confirmedReservation(quantity = 1) {
    const created = await booking.createReservation(customer, draft(quantity));
    await booking.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, manager);
    return prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id } });
  }

  it('exposes only the customer contracts and keeps one contract per physical unit', async () => {
    const reservation = await confirmedReservation(2);
    const list = await contracts.listCustomerContracts(customer.id, { page: 1, limit: 20 });
    expect(list.total).toBe(2);
    expect(list.items.map((item) => item.contractCode).sort((left, right) => left.localeCompare(right))).toEqual([`${reservation.reservationCode}-C01`, `${reservation.reservationCode}-C02`]);
    expect(new Set(list.items.map((item) => item.storageUnit.unitCode)).size).toBe(2);
    expect(list.items.every((item) => item.status === 'PENDING_PAYMENT')).toBe(true);
    await expect(contracts.getCustomerContract(otherCustomerId, list.items[0].id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows Manager contract lookup and returns historical reservation pricing without password hashes', async () => {
    const reservation = await confirmedReservation();
    const list = await contracts.listManagerContracts({ page: 1, limit: 20, search: reservation.reservationCode });
    expect(list.total).toBe(1);
    expect(list.items[0].reservation.customer).toMatchObject({ id: customer.id, fullName: 'Contract Customer' });
    expect(JSON.stringify(list.items[0])).not.toContain('hash-never-returned');
    expect(list.items[0].reservationPricing).toMatchObject({ paymentPlan: 'PAY_MONTHLY' });
    const detail = await contracts.getManagerContract(list.items[0].contractCode);
    expect(detail.storageUnit.unitCode).toBe(unitNumbers[0]);
    expect(detail.startDate).toBe(reservation.startDate.toISOString().slice(0, 10));
    expect(detail.endDate).toBe(reservation.endDate.toISOString().slice(0, 10));
  });

  it('does not create a contract for a pending reservation', async () => {
    const created = await booking.createReservation(customer, draft());
    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id } });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id } })).toBe(0);
  });
});
