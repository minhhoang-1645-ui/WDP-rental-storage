import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';

export const operationalAssignee = { id: true, fullName: true, role: true, accountStatus: true } as const;

export function assertTaskAssignee(actor: PublicUser, assignedStaffUserId: string | null | undefined) {
  if (actor.role !== 'STAFF' || assignedStaffUserId !== actor.id) {
    throw new ForbiddenException('Chỉ nhân viên được giao mới có thể xử lý công việc này.');
  }
}

export function managerAssignmentInput(actor: PublicUser, input: Record<string, unknown>) {
  if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được phân công.');
  const id = typeof input.staffUserId === 'string' ? input.staffUserId.trim() : '';
  if (!id || id.length > 120) throw new BadRequestException('Cần chọn nhân viên.');
  return id;
}

export async function assertActiveAssignee(tx: Prisma.TransactionClient, id: string) {
  const staff = await tx.user.findFirst({ where: { id, role: 'STAFF', accountStatus: 'ACTIVE' }, select: { id: true } });
  if (!staff) throw new BadRequestException('Chỉ giao việc cho nhân viên đang hoạt động.');
}
