import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BookingService } from '../booking/booking.service.js';
import { ActiveRentalsService } from './active-rentals.service.js';
import { deriveOverdueState } from './overdue-state.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `overdue-facility-${runId}`;
const storageTypeId = `overdue-product-${runId}`;
const customerId = `overdue-customer-${runId}`;
const otherCustomerId = `overdue-other-${runId}`;
const managerId = `overdue-manager-${runId}`;
const unitCodes = [1, 2, 3, 4].map((value) => `OVERDUE-${runId}-${value}`);

describe('Overdue Rental V1', () => {
  let prisma: PrismaService;
  let rentals: ActiveRentalsService;
  let booking: BookingService;

  const dateAt = (days: number) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  };
  const iso = (value: Date) => value.toISOString().slice(0, 10);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    rentals = new ActiveRentalsService(prisma);
    booking = new BookingService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `OVERDUE-${runId}`, name: 'Overdue test', address: 'Test only' } });
    await prisma.storageType.create({ data: {
      id: storageTypeId, facilityId, code: `OD-${runId}`, name: 'Overdue product', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Test', condition: 'STANDARD',
      widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: '20', suitableItems: ['Boxes'],
      image: 'https://example.test/overdue.jpg', imageAlt: 'Test', floor: 'Ground', access: 'Test', features: ['Test'], monthlyRate: 1500000,
    } });
    await prisma.storageUnit.createMany({ data: unitCodes.map((unitNumber, index) => ({ storageTypeId, unitNumber, floor: 'Ground', zone: 'O', row: 1, position: index + 1 })) });
    await prisma.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, fullName: 'Overdue Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: otherCustomerId, email: `${otherCustomerId}@example.test`, fullName: 'Future Private Customer', role: 'CUSTOMER', passwordHash: 'secret-hash' },
      { id: managerId, email: `${managerId}@example.test`, fullName: 'Overdue Manager', role: 'MANAGER', passwordHash: 'secret-hash' },
    ] });
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.updateMany({ where: { storageTypeId }, data: { status: 'AVAILABLE' } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { invoice: { reservation: { storageTypeId } } } });
    await prisma.invoice.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.renewalRequest.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.rentalContract.deleteMany({ where: { reservation: { storageTypeId } } });
    await prisma.reservationUnit.deleteMany({ where: { storageUnit: { storageTypeId } } });
    await prisma.reservation.deleteMany({ where: { storageTypeId } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.delete({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId, managerId] } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  async function rental(options: { quantity?: number; endDate?: Date; status?: 'ACTIVE' | 'READY_FOR_HANDOVER' | 'PENDING_PAYMENT'; customer?: string } = {}) {
    const quantity = options.quantity ?? 1;
    const endDate = options.endDate ?? dateAt(-1);
    const status = options.status ?? 'ACTIVE';
    const reference = `WDP-OD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const reservation = await prisma.reservation.create({ data: {
      reservationCode: reference, customerId: options.customer ?? customerId, facilityId, storageTypeId, quantity,
      startDate: dateAt(-180), endDate, periodMode: 'DURATION', durationMonths: 6,
      availabilitySnapshot: {}, quoteSnapshot: { currency: 'VND', billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 6, quantity, monthlyUnitPrice: 1500000 } as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `overdue-${randomUUID()}`,
    } });
    const units = await prisma.storageUnit.findMany({ where: { storageTypeId, status: 'AVAILABLE' }, orderBy: { unitNumber: 'asc' }, take: quantity });
    for (const [index, unit] of units.entries()) {
      const allocation = await prisma.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: reservation.startDate, plannedEndDate: endDate } });
      await prisma.rentalContract.create({ data: {
        contractCode: `${reference}-C${String(index + 1).padStart(2, '0')}`, reservationId: reservation.id, reservationUnitId: allocation.id,
        status, startDate: reservation.startDate, endDate, activatedAt: status === 'ACTIVE' ? dateAt(-180) : null,
      } });
      await prisma.storageUnit.update({ where: { id: unit.id }, data: { status: status === 'ACTIVE' ? 'OCCUPIED' : 'AVAILABLE' } });
    }
    return { reservation, units };
  }

  async function futureAllocation(storageUnitId: string, startDate = dateAt(0), endDate = dateAt(30)) {
    const future = await prisma.reservation.create({ data: {
      reservationCode: `WDP-NEXT-${randomUUID().slice(0, 8).toUpperCase()}`, customerId: otherCustomerId, facilityId, storageTypeId, quantity: 1,
      startDate, endDate, periodMode: 'DURATION', durationMonths: 1, availabilitySnapshot: {}, quoteSnapshot: {} as Prisma.InputJsonValue,
      status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `overdue-future-${randomUUID()}`,
    } });
    const allocation = await prisma.reservationUnit.create({ data: { reservationId: future.id, storageUnitId, plannedStartDate: startDate, plannedEndDate: endDate } });
    return { future, allocation };
  }

  it('derives ACTIVE before end and OVERDUE exactly at the exclusive end boundary deterministically', () => {
    const end = new Date('2027-05-10T00:00:00.000Z');
    expect(deriveOverdueState(end, new Date('2027-05-09T23:59:59.999Z'))).toMatchObject({ isOverdue: false, overdueSince: null, rentalState: 'ACTIVE' });
    expect(deriveOverdueState(end, new Date('2027-05-10T00:00:00.000Z'))).toMatchObject({ effectiveEndDate: '2027-05-10', isOverdue: true, overdueSince: '2027-05-10', rentalState: 'OVERDUE' });
  });

  it('exposes overdue without mutating ACTIVE contracts, OCCUPIED units, invoices or recurring cycles', async () => {
    const { reservation, units } = await rental();
    const beforeInvoices = await prisma.invoice.count({ where: { reservationId: reservation.id } });
    const view = await rentals.getCustomerRental(customerId, reservation.id);
    expect(view).toMatchObject({ isOverdue: true, rentalState: 'OVERDUE', effectiveEndDate: iso(reservation.endDate), contractCount: 1, unitCount: 1 });
    expect(view.contracts[0]).toMatchObject({ status: 'ACTIVE', unit: { status: 'OCCUPIED' } });
    expect(await prisma.rentalContract.count({ where: { reservationId: reservation.id, status: 'ACTIVE' } })).toBe(1);
    expect((await prisma.storageUnit.findUniqueOrThrow({ where: { id: units[0].id } })).status).toBe('OCCUPIED');
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(beforeInvoices);
  });

  it('does not classify READY_FOR_HANDOVER or PENDING_PAYMENT contracts as overdue Active Rentals', async () => {
    await rental({ status: 'READY_FOR_HANDOVER' });
    await rental({ status: 'PENDING_PAYMENT' });
    expect((await rentals.listManagerRentals({ page: 1, limit: 20, overdue: true })).total).toBe(0);
  });

  it('uses completed-renewal effective endDate and keeps approved-pending-payment rental overdue at the old endDate', async () => {
    const completed = await rental({ endDate: dateAt(30) });
    await prisma.renewalRequest.create({ data: {
      renewalCode: `WDPR-DONE-${runId}`, reservationId: completed.reservation.id, status: 'COMPLETED', previousEndDate: dateAt(-1), requestedEndDate: dateAt(30), termMonths: 1,
      paymentPlan: 'PREPAID', quoteSnapshot: {} as Prisma.InputJsonValue, requestedByUserId: customerId, idempotencyKey: `done-${randomUUID()}`,
    } });
    expect((await rentals.getCustomerRental(customerId, completed.reservation.id)).isOverdue).toBe(false);

    const waiting = await rental({ endDate: dateAt(0) });
    const renewal = await prisma.renewalRequest.create({ data: {
      renewalCode: `WDPR-WAIT-${runId}`, reservationId: waiting.reservation.id, status: 'APPROVED_PENDING_PAYMENT', previousEndDate: dateAt(0), requestedEndDate: dateAt(90), termMonths: 3,
      paymentPlan: 'PAY_MONTHLY', quoteSnapshot: {} as Prisma.InputJsonValue, requestedByUserId: customerId, activeKey: waiting.reservation.id, idempotencyKey: `wait-${randomUUID()}`,
    } });
    const view = await rentals.getCustomerRental(customerId, waiting.reservation.id);
    expect(view).toMatchObject({ isOverdue: true, pendingRenewal: { renewalCode: renewal.renewalCode, status: 'APPROVED_PENDING_PAYMENT' } });
    expect((await prisma.renewalRequest.findUniqueOrThrow({ where: { id: renewal.id } })).status).toBe('APPROVED_PENDING_PAYMENT');

    const completedPast = await rental({ endDate: dateAt(-1) });
    await prisma.renewalRequest.create({ data: {
      renewalCode: `WDPR-PAST-${runId}`, reservationId: completedPast.reservation.id, status: 'COMPLETED', previousEndDate: dateAt(-31), requestedEndDate: dateAt(-1), termMonths: 1,
      paymentPlan: 'PREPAID', quoteSnapshot: {} as Prisma.InputJsonValue, requestedByUserId: customerId, idempotencyKey: `past-${randomUUID()}`,
    } });
    expect((await rentals.getCustomerRental(customerId, completedPast.reservation.id)).isOverdue).toBe(true);
  });

  it('keeps overdue occupied units unavailable even when contractual endDate has passed', async () => {
    await rental();
    await prisma.storageUnit.updateMany({ where: { storageTypeId, status: 'AVAILABLE' }, data: { status: 'MAINTENANCE' } });
    const availability = await booking.checkAvailability({ productId: storageTypeId, startDate: iso(dateAt(0)), periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' });
    expect(availability).toMatchObject({ available: false, reasonCode: 'OCCUPIED' });
  });

  it('filters overdue rentals for Customer, Manager and Staff at reservation level with quantity > 1', async () => {
    const overdue = await rental({ quantity: 3 });
    await rental({ endDate: dateAt(30) });
    const customer = await rentals.listCustomerRentals(customerId, { page: 1, limit: 20, overdue: true });
    const manager = await rentals.listManagerRentals({ page: 1, limit: 20, overdue: true });
    const staff = await rentals.listStaffRentals({ page: 1, limit: 20, overdue: false });
    expect(customer.total).toBe(1);
    expect(customer.items[0]).toMatchObject({ reservationId: overdue.reservation.id, quantity: 3, contractCount: 3, unitCount: 3, isOverdue: true });
    expect(customer.items[0].contracts.every((contract: any) => contract.unit.status === 'OCCUPIED')).toBe(true);
    expect(manager.total).toBe(1);
    expect(staff.total).toBe(1);
    expect(staff.items[0]).not.toHaveProperty('historicalPricing');
  });

  it('shows future allocation conflict and private customer context only to Manager', async () => {
    const current = await rental();
    const { future, allocation } = await futureAllocation(current.units[0].id, dateAt(0), dateAt(30));
    const manager = await rentals.getManagerRental(current.reservation.id);
    expect(manager.futureAllocationRisk).toEqual({ hasFutureAllocation: true, hasCurrentAllocationConflict: true });
    expect(manager.contracts[0].unit.nextConfirmedAllocation).toMatchObject({ reservationReference: future.reservationCode, customer: { fullName: 'Future Private Customer' } });
    const staff = await rentals.getStaffRental(current.reservation.id);
    expect(staff.futureAllocationRisk).toEqual({ hasFutureAllocation: true, hasCurrentAllocationConflict: true });
    expect(staff.contracts[0].unit.nextConfirmedAllocation).not.toHaveProperty('customer');
    const customer = await rentals.getCustomerRental(customerId, current.reservation.id);
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toContain('Future Private Customer');
    expect(serialized).not.toContain(`${otherCustomerId}@example.test`);
    expect(serialized).not.toContain(future.reservationCode);
    expect(await prisma.reservation.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({ status: 'CONFIRMED' });
    expect(await prisma.reservationUnit.findUniqueOrThrow({ where: { id: allocation.id } })).toMatchObject({ releasedAt: null });
  });

  it('exposes an upcoming allocation without claiming a current conflict', async () => {
    const current = await rental();
    await futureAllocation(current.units[0].id, dateAt(10), dateAt(40));
    const manager = await rentals.getManagerRental(current.reservation.id);
    expect(manager.futureAllocationRisk).toEqual({ hasFutureAllocation: true, hasCurrentAllocationConflict: false });
    expect(manager.contracts[0].unit.nextConfirmedAllocation.startDate).toBe(iso(dateAt(10)));
  });

  it('surfaces inconsistent ACTIVE contract end dates instead of normalizing them', async () => {
    const current = await rental({ quantity: 2 });
    const contract = await prisma.rentalContract.findFirstOrThrow({ where: { reservationId: current.reservation.id } });
    await prisma.rentalContract.update({ where: { id: contract.id }, data: { endDate: dateAt(1) } });
    await expect(rentals.getManagerRental(current.reservation.id)).rejects.toMatchObject({ response: { code: 'ACTIVE_RENTAL_END_DATE_MISMATCH' } });
    expect(await prisma.rentalContract.count({ where: { reservationId: current.reservation.id, status: 'ACTIVE' } })).toBe(2);
  });
});
