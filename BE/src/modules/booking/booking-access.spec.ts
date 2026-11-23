import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import type { PublicUser } from '../auth/auth.types.js';

describe('reservation customer access', () => {
  it.each(['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const)('rejects %s before validating or querying inventory', async role => {
    const findUnique = vi.fn();
    const service = new BookingService({ reservation: { findUnique } } as never);
    await expect(service.createReservation({ id: 'actor', role } as PublicUser, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('scopes Staff booking lookups to their handover and closes the shared customer lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new BookingService({ reservation: { findFirst } } as never);
    const staff = { id: 'actor', role: 'FACILITY_STAFF' } as PublicUser;
    await expect(service.getReservation(staff, 'reservation')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getManagerReservation('reservation', staff)).rejects.toThrow();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { OR: [{ id: 'reservation' }, { reservationCode: 'reservation' }] },
      { appointments: { some: { assignedStaffUserId: staff.id, status: { in: ['REQUESTED', 'CONFIRMED'] } } } },
    ] } }));
    await expect(service.updateManagerReservationStatus('reservation', { status: 'CONFIRMED' }, staff)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('does not grant Staff a reservation decision through the inquiry route', async () => {
    const service = new BookingService({
      contactInquiry: { findFirst: vi.fn().mockResolvedValue(null) },
      reservation: { findFirst: vi.fn().mockResolvedValue({ id: 'reservation' }) },
    } as never);
    const staff = { id: 'actor', role: 'FACILITY_STAFF' } as PublicUser;
    await expect(service.updateManagerInquiry('reservation', { status: 'CONFIRMED' }, staff)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
