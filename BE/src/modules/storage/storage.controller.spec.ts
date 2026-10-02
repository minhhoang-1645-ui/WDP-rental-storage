import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingService } from '../booking/booking.service.js';
import { StorageController } from './storage.controller.js';

const customer = { id: 'customer', fullName: 'Customer', email: 'customer@example.com', phone: '0901234567', role: 'CUSTOMER' as const };
const start = () => { const date = new Date(); date.setUTCDate(date.getUTCDate() + 30); return date.toISOString().slice(0, 10); };

describe('Shared storage and booking inventory', () => {
  let booking: BookingService;
  let storage: StorageController;
  beforeEach(() => { booking = new BookingService(); storage = new StorageController(booking); });

  it('serves catalog details from the same products and sizes used by booking', () => {
    const catalog = booking.getCatalog();
    for (const item of catalog.products) {
      expect(storage.get(item.id).name).toBe(item.name);
      expect(catalog.sizes.find(size => size.id === item.sizeId)?.dimensions).toBe(item.dimensions);
    }
    expect(storage.list({}).items).toHaveLength(catalog.products.length);
  });

  it('removes a booked unit for overlapping searches but keeps adjacent periods available', () => {
    const query = { size: 'small', type: 'standard', date: start(), duration: '1' };
    expect(storage.list(query).items.map(item => item.id)).toEqual(['sm-b12']);
    const reservation = booking.createReservation(customer, { productId: 'sm-b12', startDate: query.date, durationMonths: 1, quantity: 1 });
    expect(storage.list(query).items).toHaveLength(0);
    expect(storage.list(query).checkedPeriod).toBe(true);
    expect(storage.list({ ...query, date: reservation.endDateExclusive }).items.map(item => item.id)).toEqual(['sm-b12']);
  });

  it('does not promise availability when dates or duration are unspecified', () => {
    expect(storage.list({ size: 'small', type: 'climate' }).checkedPeriod).toBe(false);
    expect(storage.list({ date: start(), duration: 'flexible' }).checkedPeriod).toBe(false);
  });

  it('does not block inventory for a guest contact inquiry', () => {
    booking.createInquiry({ productId: 'sm-b12', startDate: start(), durationMonths: 1, quantity: 1, ...customer });
    expect(storage.list({ size: 'small', type: 'standard', date: start(), duration: '1' }).items).toHaveLength(1);
  });

  it('rejects invalid filters and impossible dates, including categories with no matches', () => {
    for (const query of [{ size: 'unknown' }, { type: 'unknown' }, { duration: '2' }, { date: ['2030-01-01'] }, { date: '2099-02-30', size: 'locker', type: 'climate' }]) {
      expect(() => storage.list(query)).toThrow(BadRequestException);
    }
    expect(() => storage.get('missing')).toThrow(NotFoundException);
    expect(() => booking.checkAvailability(null as never)).toThrow(BadRequestException);
  });
});
