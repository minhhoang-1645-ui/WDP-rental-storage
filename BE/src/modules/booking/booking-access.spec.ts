import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import type { PublicUser } from '../auth/auth.types.js';

describe('reservation customer access', () => {
  it.each(['STAFF', 'MANAGER', 'ADMIN'] as const)('rejects %s before validating or querying inventory', async role => {
    const findUnique = vi.fn();
    const service = new BookingService({ reservation: { findUnique } } as never);
    await expect(service.createReservation({ id: 'actor', role } as PublicUser, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
