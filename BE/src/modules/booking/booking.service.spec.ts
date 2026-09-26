import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const user: PublicUser = {
  id: 'customer-1',
  fullName: 'Nguyễn Văn A',
  email: 'customer@example.com',
  phone: '0900000000',
  role: 'CUSTOMER',
};

const futureDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
};

const shortEndDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 37);
  return date.toISOString().slice(0, 10);
};

const baseDraft = () => ({
  productId: 'sm-b12',
  startDate: futureDate(),
  periodMode: 'duration',
  durationMonths: 3,
  quantity: 1,
  adjacencyPreference: false,
  addonIds: [],
  paymentChoice: 'pay-later',
});

describe('BookingService', () => {
  it('accepts the approved small standard product for one unit', () => {
    const service = new BookingService();
    const result = service.checkAvailability(baseDraft());
    expect(result.available).toBe(true);
    expect(result.quote.status).toBe('QUOTE_REQUIRED');
    expect(result.quote.periodStatus).toBe('APPROVED_DURATION');
  });

  it('marks short date ranges as undecided pricing without inventing daily rates', () => {
    const service = new BookingService();
    const result = service.checkAvailability({ ...baseDraft(), periodMode: 'dates', durationMonths: undefined, endDate: shortEndDate() });
    expect(result.available).toBe(true);
    expect(result.quote.periodStatus).toBe('SHORT_DURATION_UNDECIDED');
    expect(result.quote.rentalSubtotal).toBeNull();
  });

  it('does not claim unapproved multi-unit inventory', () => {
    const service = new BookingService();
    const result = service.checkAvailability({ ...baseDraft(), quantity: 2, adjacencyPreference: true });
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('DEMO_INVENTORY_UNCONFIGURED');
  });

  it('does not release a physically occupied unit based on a contract date', () => {
    const service = new BookingService();
    service.setPhysicalOccupancyForTesting('sm-b12', true);
    const result = service.checkAvailability(baseDraft());
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('OCCUPIED');

    service.setPhysicalOccupancyForTesting('sm-b12', false);
    expect(service.checkAvailability(baseDraft()).available).toBe(true);
  });
  it('creates a guest inquiry, prevents duplicate submissions and keeps it unguaranteed', () => {
    const service = new BookingService();
    const inquiry = service.createInquiry({ ...baseDraft(), fullName: 'Khách Demo', phone: '0900000000', email: 'guest@example.com' });
    expect(inquiry.status).toBe('PENDING_CONTACT');
    expect(inquiry.inventoryGuarantee).toBe(false);
    expect(() => service.createInquiry({ ...baseDraft(), fullName: 'Khách Demo', phone: '0900000000', email: 'guest@example.com' })).toThrow(ConflictException);
  });

  it('rejects pay-now until gateway and final amount exist', () => {
    const service = new BookingService();
    expect(() => service.createInquiry({ ...baseDraft(), paymentChoice: 'pay-now', fullName: 'Khách Demo', phone: '0900000000', email: 'pay@example.com' })).toThrow(BadRequestException);
  });

  it('creates an authenticated PENDING reservation and blocks overlap', () => {
    const service = new BookingService();
    const draft = { ...baseDraft(), productId: 'lk-a01' };
    const created = service.createReservation(user, draft);
    expect(created.status).toBe('PENDING');
    expect(created.unitAssignment).toBeNull();
    expect(created.paymentStatus).toBe('NOT_STARTED');
    expect(() => service.createReservation(user, draft)).toThrow(ConflictException);
  });

  it('keeps reservations private to their owner', () => {
    const service = new BookingService();
    service.createReservation(user, { ...baseDraft(), productId: 'lg-f02', durationMonths: 12 });
    expect(service.listReservations(user.id)).toHaveLength(1);
    expect(service.listReservations('another-user')).toHaveLength(0);
  });
});
