// Database-free regression checks. Never constructs a Prisma connection or starts the sweep timer.
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingService } from './booking.service.js';

function fixture({ paid = 0n, pendingPayment = false, released = false, status = 'CONFIRMED' } = {}) {
  const allocation = { reservationStatus: status, expiresAt: new Date(Date.now() - 60_000), releasedAt: released ? new Date() : null as Date | null };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'unit-1', unitNumber: 'A1', floor: '1', zone: 'A', row: 1, position: 1 }]),
    storageUnit: { findMany: vi.fn().mockResolvedValue([{ id: 'unit-1' }]), count: vi.fn().mockResolvedValue(0) },
    renewalRequest: { findMany: vi.fn().mockResolvedValue([]) },
    reservation: {
      findMany: vi.fn().mockImplementation(async () => paid > 0n || pendingPayment ? [] : [{ id: 'held' }]),
      updateMany: vi.fn().mockImplementation(async () => { allocation.reservationStatus = 'EXPIRED'; return { count: 1 }; }),
    },
    reservationUnit: {
      findMany: vi.fn().mockImplementation(async ({ where }) => {
        if (allocation.releasedAt || allocation.reservationStatus !== where.reservation.status) return [];
        // Emulate Prisma's optional deadline filter against a still-live allocation.
        const alternatives = where.reservation.OR as { expiresAt: null | { gt: Date } }[] | undefined;
        if (alternatives && !alternatives.some(filter => filter.expiresAt === null ? allocation.expiresAt === null : allocation.expiresAt > filter.expiresAt.gt)) return [];
        return [{ storageUnitId: 'unit-1' }];
      }),
      updateMany: vi.fn().mockImplementation(async () => { allocation.releasedAt = new Date(); return { count: 1 }; }),
      createMany: vi.fn(),
    },
    onlinePaymentTransaction: { updateMany: vi.fn() },
    paymentSubmission: { updateMany: vi.fn() },
    invoice: { updateMany: vi.fn() },
    rentalContract: { updateMany: vi.fn() },
  };
  const inventory = { assertQuoteAvailable: vi.fn(), releasePurchases: vi.fn() };
  const service = new BookingService(db as never, undefined, undefined, undefined, inventory as never);
  const draft = { productId: 'type-1', periodMode: 'dates', startDate: '2099-01-01', endDate: '2099-02-01', quantity: 1 };
  const availability = () => Reflect.get(service, 'checkAvailabilityForDraft').call(service, db, draft, { periodStatus: 'PRICED', services: [] });
  const expire = () => Reflect.get(service, 'expireUnpaidAutomaticReservations').call(service, db);
  return { service, db, allocation, availability, expire };
}

describe('Booking allocation expiration without database', () => {
  it('keeps a partially paid confirmed allocation blocked after its hold deadline', async () => {
    const test = fixture({ paid: 100000n });
    await test.expire();
    expect(test.db.reservationUnit.updateMany).not.toHaveBeenCalled();
    expect(await test.availability()).toMatchObject({ available: false, reasonCode: 'CONFLICT' });
  });

  it('keeps an allocation blocked while VNPay is still within its processing window', async () => {
    const test = fixture({ pendingPayment: true });
    await test.expire();
    expect(test.db.reservation.updateMany).not.toHaveBeenCalled();
    expect(await test.availability()).toMatchObject({ available: false });
  });

  it('does not promise availability before an expired allocation is actually released', async () => {
    expect(await fixture().availability()).toMatchObject({ available: false });
  });

  it('makes unpaid stock available after the expiration sweep releases its allocation', async () => {
    const test = fixture();
    await test.expire();
    expect(test.db.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'VOID', balanceDue: 0n } }));
    expect(test.db.rentalContract.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }));
    expect(await test.availability()).toMatchObject({ available: true });
  });

  it('ignores allocations already released or attached to expired reservations', async () => {
    expect(await fixture({ released: true }).availability()).toMatchObject({ available: true });
    expect(await fixture({ status: 'EXPIRED' }).availability()).toMatchObject({ available: true });
  });

  it('checks still-held allocations again when choosing physical units for confirmation', async () => {
    const test = fixture({ paid: 100000n });
    vi.spyOn(test.service as never, 'checkAvailabilityForDraft' as never).mockResolvedValue({ available: true, endDateExclusive: '2099-02-01', quote: { services: [] } } as never);
    const reservation = { id: 'new', quantity: 1, units: [], storageTypeId: 'type-1', periodMode: 'CUSTOM_DATES', startDate: new Date('2099-01-01'), endDate: new Date('2099-02-01'), quoteSnapshot: {}, adjacentPreference: false };
    await expect(Reflect.get(test.service, 'confirmReservation').call(test.service, test.db, reservation)).rejects.toBeInstanceOf(ConflictException);
    expect(test.db.reservationUnit.createMany).not.toHaveBeenCalled();
  });
});
