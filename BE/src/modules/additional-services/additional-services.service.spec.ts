import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { BookingService } from '../booking/booking.service.js';
import { BillingService } from '../billing/billing.service.js';
import { AdditionalServicesService } from './additional-services.service.js';

const addMonths = (value: string, months: number) => { const date = new Date(`${value}T00:00:00.000Z`); const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months); date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate())); return date.toISOString().slice(0, 10); };

describe('Additional Products & Rental Services V1', () => {
  let prisma: PrismaService;
  let catalog: AdditionalServicesService;
  let pricing: PricingService;
  const marker = randomUUID().slice(0, 8).toUpperCase();
  let purchaseId: string;
  let rentalId: string;
  let dailyRentalId: string;
  let inactiveId: string;
  let customerId: string;
  const reservationIds: string[] = [];
  const startDate = '2032-11-01';
  const endDate = '2033-02-01';

  beforeAll(async () => {
    prisma = new PrismaService(); await prisma.$connect(); catalog = new AdditionalServicesService(prisma); pricing = new PricingService(prisma);
    purchaseId = (await catalog.create({ code: `PADLOCK_${marker}`, name: 'Padlock test', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 200000 })).id;
    rentalId = (await catalog.create({ code: `SHELF_${marker}`, name: 'Shelf test', kind: 'RENTAL', billingUnit: 'MONTH', unitPrice: 100000 })).id;
    dailyRentalId = (await catalog.create({ code: `DOLLY_${marker}`, name: 'Dolly test', kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 60000 })).id;
    inactiveId = (await catalog.create({ code: `INACTIVE_${marker}`, name: 'Inactive test', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 50000, isActive: false })).id;
    await prisma.additionalServiceInventory.update({ where: { additionalServiceId: purchaseId }, data: { stockOnHand: 20 } });
    await prisma.additionalServiceInventory.update({ where: { additionalServiceId: rentalId }, data: { rentalCapacity: 20 } });
    await prisma.additionalServiceInventory.update({ where: { additionalServiceId: dailyRentalId }, data: { rentalCapacity: 20 } });
    await prisma.additionalServiceInventory.update({ where: { additionalServiceId: inactiveId }, data: { stockOnHand: 20 } });
    customerId = (await prisma.user.create({ data: { email: `addon-${marker}@example.test`, fullName: 'Addon Customer', role: 'CUSTOMER', passwordHash: 'test-only-hash' } })).id;
  });

  afterAll(async () => { if (reservationIds.length) { await prisma.invoice.deleteMany({ where: { reservationId: { in: reservationIds } } }); await prisma.rentalContract.deleteMany({ where: { reservationId: { in: reservationIds } } }); await prisma.reservationService.deleteMany({ where: { reservationId: { in: reservationIds } } }); await prisma.reservationUnit.deleteMany({ where: { reservationId: { in: reservationIds } } }); await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } }); } await prisma.additionalService.deleteMany({ where: { id: { in: [purchaseId, rentalId, dailyRentalId, inactiveId].filter(Boolean) } } }); if (customerId) await prisma.user.deleteMany({ where: { id: customerId } }); await prisma.$disconnect(); });

  it('public catalog exposes billing unit for active and hides inactive add-ons', async () => { const items = await catalog.publicCatalog(); expect(items.find((item) => item.id === purchaseId)).toMatchObject({ billingUnit: 'ONE_TIME' }); expect(items.find((item) => item.id === rentalId)).toMatchObject({ billingUnit: 'MONTH' }); expect(items.find((item) => item.id === dailyRentalId)).toMatchObject({ billingUnit: 'DAY' }); expect(items.some((item) => item.id === inactiveId)).toBe(false); });
  it('manager creates catalog records with compatible billing units', async () => { expect(await catalog.managerGet(purchaseId)).toMatchObject({ kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 200000, isActive: true }); expect(await catalog.managerGet(rentalId)).toMatchObject({ kind: 'RENTAL', billingUnit: 'MONTH', unitPrice: 100000, isActive: true }); expect(await catalog.managerGet(dailyRentalId)).toMatchObject({ kind: 'RENTAL', billingUnit: 'DAY', unitPrice: 60000, isActive: true }); });
  it('prices PURCHASE once by quantity and never changes deposit', async () => { const quote = await pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PREPAID', services: [{ serviceId: purchaseId, quantity: 2, unitPrice: 1 }] }); expect(quote).toMatchObject({ purchaseAddOnAmount: 400000, rentalAddOnAmount: 0, addOnTotalAmount: 400000, depositAmount: 1500000 }); expect(quote.quotedTotalAmount).toBe(quote.rentalAmount + quote.depositAmount + 400000); });
  it('prices a two-month RENTAL interval independently from three-month storage', async () => { const quote = await pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PREPAID', services: [{ serviceId: rentalId, quantity: 1, serviceStartDate: startDate, serviceEndDate: addMonths(startDate, 2) }] }); expect(quote).toMatchObject({ rentalAddOnAmount: 200000, purchaseAddOnAmount: 0, depositAmount: 1500000 }); expect(quote.discountAmount).toBe(225000); });
  it('prices DAY rental by exact days and quantity', async () => { const quote = await pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PAY_MONTHLY', services: [{ serviceId: dailyRentalId, quantity: 2, serviceStartDate: startDate, serviceEndDate: '2032-11-04' }] }); expect(quote.services[0]).toMatchObject({ billingUnit: 'DAY', amount: 360000 }); expect(quote.rentalAddOnAmount).toBe(360000); });
  it('rejects incompatible PURCHASE and RENTAL billing units', async () => { await expect(catalog.create({ code: `BAD_PURCHASE_${marker}`, name: 'Invalid purchase', kind: 'PURCHASE', billingUnit: 'DAY', unitPrice: 1000 })).rejects.toBeInstanceOf(BadRequestException); await expect(catalog.create({ code: `BAD_RENTAL_${marker}`, name: 'Invalid rental', kind: 'RENTAL', billingUnit: 'ONE_TIME', unitPrice: 1000 })).rejects.toBeInstanceOf(BadRequestException); });
  it('supports RENTAL starting later and excludes it from initial PAY_MONTHLY amount', async () => { const quote = await pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PAY_MONTHLY', services: [{ serviceId: rentalId, quantity: 1, serviceStartDate: addMonths(startDate, 1), serviceEndDate: endDate }] }); expect(quote.rentalAddOnAmount).toBe(200000); expect(quote.estimatedInitialAmountDue).toBe(3000000); });
  it('rejects RENTAL before or after the storage interval', async () => { await expect(pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PAY_MONTHLY', services: [{ serviceId: rentalId, quantity: 1, serviceStartDate: '2032-10-01', serviceEndDate: startDate }] })).rejects.toBeInstanceOf(BadRequestException); await expect(pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PAY_MONTHLY', services: [{ serviceId: rentalId, quantity: 1, serviceStartDate: endDate, serviceEndDate: '2033-03-01' }] })).rejects.toBeInstanceOf(BadRequestException); });
  it('rejects inactive services and ignores client-supplied prices', async () => { await expect(pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PREPAID', services: [{ serviceId: inactiveId, quantity: 1 }] })).rejects.toBeInstanceOf(BadRequestException); const quote = await pricing.quote({ storageTypeId: 'sm-b12', quantity: 1, startDate, endDate, paymentPlan: 'PREPAID', services: [{ serviceId: purchaseId, quantity: 1, unitPrice: 1, amount: 1 }] }); expect(quote.purchaseAddOnAmount).toBe(200000); });
  it('snapshots add-ons and bills PURCHASE once plus RENTAL only in overlapping cycles', async () => { const booking = new BookingService(prisma); const billing = new BillingService(prisma); const created = await booking.createReservation({ id: customerId, email: `addon-${marker}@example.test`, fullName: 'Addon Customer', phone: '', role: 'CUSTOMER' }, { productId: 'sm-b12', startDate, periodMode: 'duration', durationMonths: 3, quantity: 1, adjacencyPreference: false, addonIds: [], services: [{ serviceId: purchaseId, quantity: 1 }, { serviceId: rentalId, quantity: 1, serviceStartDate: startDate, serviceEndDate: addMonths(startDate, 2) }], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY' }); const dbReservation = await prisma.reservation.findUniqueOrThrow({ where: { reservationCode: created.id } }); reservationIds.push(dbReservation.id); await booking.updateManagerReservationStatus(created.id, { status: 'CONFIRMED' }, { id: customerId, email: 'manager@example.test', fullName: 'Manager', phone: '', role: 'MANAGER' }); const initial = await prisma.invoice.findFirstOrThrow({ where: { reservationId: dbReservation.id, type: 'INITIAL' } }); expect(initial).toMatchObject({ rentalAmount: 1500000n, depositAmount: 1500000n, serviceAmount: 300000n, totalAmount: 3300000n }); expect(await prisma.reservationService.count({ where: { reservationId: dbReservation.id } })).toBe(2); await prisma.rentalContract.updateMany({ where: { reservationId: dbReservation.id }, data: { status: 'ACTIVE', activatedAt: new Date() } }); await prisma.$transaction((tx) => billing.ensureRecurringInvoices(tx, dbReservation.id)); const recurring = await prisma.invoice.findMany({ where: { reservationId: dbReservation.id, type: 'RECURRING' }, orderBy: { billingCycle: 'asc' } }); expect(recurring.map((invoice) => invoice.serviceAmount)).toEqual([100000n, 0n]); });
});
