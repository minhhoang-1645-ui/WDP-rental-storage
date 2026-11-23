import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest, PublicUser } from '../auth/auth.types.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OverstayController } from './overstay.controller.js';

function setup(role: PublicUser['role'], _unusedLegacyFlag: boolean) {
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { rentalContract: { count, findMany } } as unknown as PrismaService;
  const request: AuthenticatedRequest = { headers: {}, user: { role, id: 'staff-1' } as PublicUser };
  return { count, findMany, controller: new OverstayController(prisma), request };
}

describe('overdue physical storage scope', () => {
  it('uses the same physical and Staff assignment filters for rows and totals', async () => {
    const { count, findMany, controller, request } = setup('FACILITY_STAFF', true);
    await controller.list(request, '2');
    const activeReturn = {
      assignedStaffUserId: 'staff-1', physicallyReturnedAt: null,
      status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] },
    };
    const where = {
      status: 'ACTIVE', endDate: { lte: expect.any(Date) },
      reservationUnit: { releasedAt: null }, AND: [expect.objectContaining({reservation:expect.objectContaining({facility:expect.any(Object)})})],
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 25, take: 25 }));
    expect(findMany.mock.calls[0][0].include.returnInspections.where).toEqual({ returnRequest: activeReturn });
  });

  it('uses task access regardless of the removed unit-assignment flag', async () => {
    const { count, controller, request } = setup('FACILITY_STAFF', false);
    await expect(controller.list(request)).resolves.toMatchObject({ total: 0, items: [] });
    expect(count).toHaveBeenCalled();
  });

  it('looks up open returns of each contract for Manager without a Staff assignee filter', async () => {
    const { count, findMany, controller, request } = setup('FACILITY_MANAGER', true);
    await controller.list(request);
    expect(count.mock.calls[0][0].where).not.toHaveProperty('OR');
    expect(findMany.mock.calls[0][0].include.returnInspections.where.returnRequest).toMatchObject({
      assignedStaffUserId: undefined, physicallyReturnedAt: null, status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] },
    });
  });
});
