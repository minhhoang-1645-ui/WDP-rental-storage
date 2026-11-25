import { assertAssignmentAccess, type AssignmentReference } from './facility-access.service.js';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';

export const operationalAssignee = { id: true, fullName: true, role: true, accountStatus: true } as const;

export function assertAssignmentVersion(input: Record<string, unknown>, current: string | null | undefined) {
  const expected = input.expectedAssignedStaffUserId;
  if (expected !== undefined && expected !== null && typeof expected !== 'string') {
    throw new BadRequestException('Phiên bản phân công không hợp lệ.');
  }
  if ((expected ?? null) !== (current ?? null)) {
    throw new ConflictException('Phân công đã thay đổi. Tải lại hồ sơ trước khi lưu.');
  }
}

export function assertTaskAssignee(actor: PublicUser, assignedStaffUserId: string | null | undefined) {
  if (actor.role !== 'FACILITY_STAFF' || assignedStaffUserId !== actor.id) {
    throw new ForbiddenException('Chỉ nhân viên được giao mới có thể xử lý công việc này.');
  }
}

export function managerAssignmentInput(actor: PublicUser, input: Record<string, unknown>) {
  if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được phân công.');
  const id = typeof input.staffUserId === 'string' ? input.staffUserId.trim() : '';
  if (!id || id.length > 120) throw new BadRequestException('Cần chọn nhân viên.');
  return id;
}

export async function assertActiveAssignee(tx: Prisma.TransactionClient, id: string, actor:PublicUser, reference:AssignmentReference) {
  return assertAssignmentAccess(tx,actor,id,reference);
}
