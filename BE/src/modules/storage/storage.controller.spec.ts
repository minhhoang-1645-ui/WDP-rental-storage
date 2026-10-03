import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BookingService } from '../booking/booking.service.js';
import { StorageController } from './storage.controller.js';

const start = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 45);
  return date.toISOString().slice(0, 10);
};

describe('Shared storage catalog and database inventory', () => {
  let prisma: PrismaService;
  let booking: BookingService;
  let storage: StorageController;

  beforeAll(async () => {
    process.env.INQUIRY_LOOKUP_SECRET ??= 'test-inquiry-secret-that-is-at-least-32-characters';
    prisma = new PrismaService();
    await prisma.$connect();
    booking = new BookingService(prisma);
    storage = new StorageController(booking);
  });

  afterAll(async () => prisma.$disconnect());

  it('serves storage detail and booking catalog from the same database records', async () => {
    const catalog = await booking.getCatalog();
    expect(catalog.products.length).toBeGreaterThanOrEqual(6);
    for (const item of catalog.products) {
      expect((await storage.get(item.id)).name).toBe(item.name);
      expect(catalog.sizes.find((size) => size.id === item.sizeId)?.dimensions).toBe(item.dimensions);
    }
    expect((await storage.list({})).items).toHaveLength(catalog.products.length);
  });

  it('filters by product type and full-period availability', async () => {
    const result = await storage.list({ size: 'small', type: 'standard', date: start(), duration: '1' });
    expect(result.checkedPeriod).toBe(true);
    expect(result.items.map((item) => item.id)).toContain('sm-b12');
  });

  it('does not promise availability when dates or duration are unspecified', async () => {
    expect((await storage.list({ size: 'small', type: 'climate' })).checkedPeriod).toBe(false);
    expect((await storage.list({ date: start(), duration: 'flexible' })).checkedPeriod).toBe(false);
  });

  it('does not block inventory for a guest contact inquiry', async () => {
    const email = `catalog-${randomUUID()}@example.test`;
    try {
      await booking.createInquiry({ productId: 'sm-b12', startDate: start(), periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', fullName: 'Catalog Guest', phone: '0900000002', email });
      const result = await storage.list({ size: 'small', type: 'standard', date: start(), duration: '1' });
      expect(result.items.map((item) => item.id)).toContain('sm-b12');
    } finally {
      await prisma.contactInquiry.deleteMany({ where: { email } });
    }
  });

  it('rejects invalid filters, impossible dates and missing products', async () => {
    for (const query of [{ size: 'unknown' }, { type: 'unknown' }, { duration: '2' }, { date: ['2030-01-01'] }, { date: '2099-02-30', size: 'locker', type: 'climate' }]) {
      await expect(storage.list(query)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(storage.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(booking.checkAvailability(null as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
