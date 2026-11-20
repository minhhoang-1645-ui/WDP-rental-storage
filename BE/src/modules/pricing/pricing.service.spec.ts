import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PricingService } from './pricing.service.js';

const futureDate = (days = 60) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const addDays = (startDate: string, days: number) => {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const addMonths = (startDate: string, months: number) => {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const day = start.getUTCDate();
  const result = new Date(start);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInMonth));
  return result.toISOString().slice(0, 10);
};

describe('PricingService V1', () => {
  let prisma: PrismaService;
  let service: PricingService;
  const startDate = futureDate();
  const missingPriceId = `missing-price-${randomUUID().slice(0, 8)}`;
  const missingPriceCode = `MP-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PricingService(prisma);
    const facility = await prisma.facility.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    await prisma.storageType.create({
      data: {
        id: missingPriceId,
        facilityId: facility.id,
        code: missingPriceCode,
        name: 'Missing Price Test',
        sizeId: 'small',
        sizeName: 'Kho nhỏ',
        kicker: 'Test only',
        condition: 'STANDARD',
        widthCm: 100,
        lengthCm: 100,
        heightCm: 100,
        roomEquivalent: 'Test',
        capacity: 'Test',
        boxCount: 'Test',
        suitableItems: [],
        image: 'https://example.test/missing-price.jpg',
        imageAlt: 'Test',
        floor: 'Test',
        access: 'Test',
        features: [],
        monthlyRate: null,
        minRentalDays: 7,
        allowDailyRental: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.storageType.deleteMany({ where: { id: missingPriceId } });
    await prisma.$disconnect();
  });

  const quote = (storageTypeId: string, endDate: string, paymentPlan: 'PAY_MONTHLY' | 'PREPAID' = 'PAY_MONTHLY', quantity = 1) => service.quote({ storageTypeId, quantity, startDate, endDate, paymentPlan });

  it('prices Locker for one day with zero deposit and final-VND rounding', async () => {
    const result = await quote('lk-a01', addDays(startDate, 1));
    expect(result).toMatchObject({ billingMode: 'DAILY', billableDays: 1, rentalAmount: 21667, depositAmount: 0, quotedTotalAmount: 21667 });
  });

  it('rejects Small Standard below seven days', async () => {
    await expect(quote('sm-b12', addDays(startDate, 6))).rejects.toMatchObject({ response: { code: 'MINIMUM_RENTAL_TERM' } });
  });

  it('prices Small Standard for seven days and uses rental amount as deposit', async () => {
    const result = await quote('sm-b12', addDays(startDate, 7));
    expect(result).toMatchObject({ billingMode: 'DAILY', billableDays: 7, baseRentalAmount: 350000, rentalAmount: 350000, depositAmount: 350000, quotedTotalAmount: 700000 });
  });

  it('rejects Medium for 29 days and accepts exactly one calendar month', async () => {
    await expect(quote('md-d04', addDays(startDate, 29))).rejects.toBeInstanceOf(BadRequestException);
    const result = await quote('md-d04', addMonths(startDate, 1));
    expect(result).toMatchObject({ billingMode: 'MONTHLY', termMonths: 1, rentalAmount: 2900000, depositAmount: 2900000, quotedTotalAmount: 5800000 });
  });

  it.each([
    [3, 'PREPAID', 5],
    [3, 'PAY_MONTHLY', 0],
    [6, 'PREPAID', 10],
    [12, 'PREPAID', 15],
    [2, 'PREPAID', 0],
  ] as const)('applies the approved discount for %i months with %s', async (months, paymentPlan, discountPercent) => {
    const result = await quote('sm-b12', addMonths(startDate, months), paymentPlan);
    expect(result.discountPercent).toBe(discountPercent);
    expect(result.discountAmount).toBe(Math.round(result.baseRentalAmount * discountPercent / 100));
    expect(result.depositAmount).toBe(1500000);
  });

  it('multiplies rental and deposit by quantity without discounting the deposit', async () => {
    const result = await quote('sm-b12', addMonths(startDate, 6), 'PREPAID', 2);
    expect(result).toMatchObject({ baseRentalAmount: 18000000, discountAmount: 1800000, rentalAmount: 16200000, depositAmount: 3000000, quotedTotalAmount: 19200000 });
  });

  it('rejects unsupported mixed monthly terms instead of prorating', async () => {
    await expect(quote('sm-b12', addDays(addMonths(startDate, 1), 8))).rejects.toMatchObject({ response: { code: 'UNSUPPORTED_RENTAL_TERM' } });
  });

  it('returns 404 for an unknown StorageType', async () => {
    await expect(quote('missing-storage-type', addMonths(startDate, 1))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never converts missing pricing configuration into zero', async () => {
    await expect(quote(missingPriceId, addDays(startDate, 7))).rejects.toMatchObject({ response: { code: 'PRICING_UNAVAILABLE' } });
  });
});
