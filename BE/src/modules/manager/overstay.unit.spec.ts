import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest, PublicUser } from '../auth/auth.types.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OverstayController } from './overstay.controller.js';

function setup(role: PublicUser['role'], unitAssignmentsEnabled: boolean) {
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { rentalContract: { count, findMany } } as unknown as PrismaService;
  const config = { get: vi.fn().mockReturnValue(String(unitAssignmentsEnabled)) } as unknown as ConfigService;
  const request: AuthenticatedRequest = { headers: {}, user: { role, id: 'staff-1' } as PublicUser };
  return { count, findMany, controller: new OverstayController(prisma, config), request };
}

describe('overdue physical storage scope', () => {
  it('uses the same physical and Staff assignment filters for rows and totals', async () => {
    const { count, findMany, controller, request } = setup('STAFF', true);
    await controller.list(request, '2', 'true');
    const activeReturn = {
      assignedStaffUserId: 'staff-1', physicallyReturnedAt: null,
      status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] },
    };
    const where = {
      status: 'ACTIVE', endDate: { lte: expect.any(Date) }, reservationUnit: { releasedAt: null },
      OR: [
        { reservation: { returns: { some: activeReturn } } },
        { reservationUnit: { storageUnit: { staffAssignments: { some: { staffUserId: 'staff-1', endedAt: null } } } } },
      ],
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 25, take: 25 }));
    expect(findMany.mock.calls[0][0].include.reservation.select.returns.where).toEqual(activeReturn);
  });

  it('queries only assigned return requests when assignment by storage unit is disabled', async () => {
    const { count, controller, request } = setup('STAFF', false);
    await controller.list(request, undefined, 'true');
    const where = count.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(1);
    expect(where.OR[0].reservation.returns.some.assignedStaffUserId).toBe('staff-1');
  });

  it('preserves the existing Manager list and return scope', async () => {
    const { count, findMany, controller, request } = setup('MANAGER', true);
    await controller.list(request, undefined, 'true');
    expect(count.mock.calls[0][0].where).not.toHaveProperty('OR');
    expect(findMany.mock.calls[0][0].include.reservation.select.returns).not.toHaveProperty('where');
  });
});
