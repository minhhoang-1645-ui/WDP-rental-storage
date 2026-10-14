import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { GuestBookingService } from './guest-booking.service.js';

describe('GuestBookingService email delivery', () => {
  it('uses the normalized stored guest email and never exposes the stored token hash', async () => {
    const record = {
      id: 'guest-booking-id',
      bookingCode: 'WDPG-2026-EMAIL',
      fullName: 'Nguyen Van A',
      email: 'customer@gmail.com',
      storageTypeId: 'storage-id',
      quantity: 1,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      paymentPlan: 'PAY_MONTHLY',
      quoteSnapshot: { rentalAmount: 1000000, discountAmount: 0, depositAmount: 500000, estimatedInitialAmountDue: 1500000 },
      availabilitySnapshot: {},
      claimTokenHash: 'stored-secret-token-hash',
      claimTokenExpiresAt: new Date('2026-10-15T00:00:00.000Z'),
      status: 'PENDING_VERIFICATION',
      storageType: { id: 'storage-id', code: 'SMALL-STD', name: 'Kho nhỏ tiêu chuẩn', condition: 'STANDARD' },
      services: [],
    };
    const prisma = {
      guestBookingRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(record),
      },
      storageType: { findUniqueOrThrow: vi.fn().mockResolvedValue({ facilityId: 'facility-id' }) },
    };
    const booking = { checkAvailability: vi.fn().mockResolvedValue({ available: true, message: 'Còn kho', quote: record.quoteSnapshot }) };
    const email = { sendBookingClaim: vi.fn().mockResolvedValue({ delivered: true, adapter: 'smtp' }) };
    const service = new GuestBookingService(prisma as never, booking as never, email as never, new ConfigService({ GUEST_CLAIM_TOKEN_TTL_MINUTES: '60' }));

    const result = await service.create({ fullName: record.fullName, email: ' CUSTOMER@GMAIL.COM ', phone: '0900000000', storageTypeId: record.storageTypeId, quantity: 1, startDate: '2026-11-01', endDate: '2026-12-01', paymentPlan: 'PAY_MONTHLY', services: [] }, 'guest-booking-email-test');

    expect(email.sendBookingClaim).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@gmail.com', paymentPlan: 'PAY_MONTHLY', claimToken: expect.any(String) }));
    expect(JSON.stringify(result)).not.toContain('stored-secret-token-hash');
    expect(result).not.toHaveProperty('claimToken');
    expect(result).not.toHaveProperty('claimTokenHash');
  });
});
