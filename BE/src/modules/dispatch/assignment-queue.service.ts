import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertFacility } from '../facility-access/facility-access.service.js';
import { assertAssignmentVersion } from '../facility-access/operational-assignment.js';
import { taskFacilityId } from '../facility-access/task-access.js';
import { assignmentReference } from '../auth/staff-directory.controller.js';
import { readUnitHandoverDraft } from '../appointments/handover-report.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { isTransferSubject } from '../transfers/transfer-intake.js';
import type { WorkKind } from './work-phase.js';

type Db = Prisma.TransactionClient;
const tables = {
  appointments: 'HandoverAppointment', transfers: 'TransferRequest', returns: 'ReturnRequest',
  'support-requests': 'SupportRequest', maintenance: 'MaintenanceRequest', 'damage-claims': 'DamageClaim',
} as const;

@Injectable()
export class AssignmentQueueService {
  constructor(private readonly prisma: PrismaService) {}

  release(actor: PublicUser, taskType: string, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được đưa nhiệm vụ về hàng chờ.');
    if (!Object.hasOwn(tables, taskType)) throw new BadRequestException('Loại nhiệm vụ không hợp lệ.');
    const kind = taskType as WorkKind;
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 500) throw new BadRequestException('Nhập lý do đưa việc về hàng chờ.');
    if (typeof input.expectedAssignedStaffUserId !== 'string' || !input.expectedAssignedStaffUserId) {
      throw new BadRequestException('Cần thông tin nhân viên đang phụ trách.');
    }

    return this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM ${Prisma.raw('"' + tables[kind] + '"')} WHERE id = ${id} FOR UPDATE`);
      if (!locked.length) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      const reference = await assignmentReference(tx, kind, id);
      if (!reference) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      const facilityId = await taskFacilityId(tx, reference);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      await assertFacility(tx, actor, facilityId);
      const released = await this.unassign(tx, kind, id, input);
      await recordAssignment(tx, actor, kind, id, released, null, { facilityId, reason, source: 'MANAGER_QUEUE' });
      return { id, assignedStaffUserId: null };
    });
  }

  private valid(input: Record<string, unknown>, current: string | null, safe: boolean) {
    assertAssignmentVersion(input, current);
    if (!current || !safe) throw new ConflictException('Nhiệm vụ đã bắt đầu hoặc cần quản lý chuyển giao trực tiếp.');
    return current;
  }

  private async unassign(tx: Db, kind: WorkKind, id: string, input: Record<string, unknown>) {
    switch (kind) {
      case 'appointments': {
        const row = await tx.handoverAppointment.findUniqueOrThrow({ where: { id } });
        const previous = this.valid(input, row.assignedStaffUserId,
          ['REQUESTED', 'CONFIRMED'].includes(row.status) && !readUnitHandoverDraft(row.handoverReport).unitProgress.length);
        await tx.handoverAppointment.update({ where: { id }, data: { assignedStaffUserId: null, assignedAt: null, assignedByUserId: null } });
        return previous;
      }
      case 'returns': {
        const row = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
        const previous = this.valid(input, row.assignedStaffUserId, row.status === 'REQUESTED' && !row.inspectionStartedAt);
        await tx.returnRequest.update({ where: { id }, data: { assignedStaffUserId: null } });
        return previous;
      }
      case 'transfers': {
        const row = await tx.transferRequest.findUniqueOrThrow({ where: { id } });
        const report = row.handoverReport;
        const markerOnly = report && typeof report === 'object' && !Array.isArray(report)
          && report.stagedHandover === true && Object.keys(report).length === 1;
        const previous = this.valid(input, row.assignedStaffUserId,
          !row.closurePlanId && ['REQUESTED', 'APPROVED'].includes(row.status) && (!report || !!markerOnly));
        await tx.transferRequest.update({ where: { id }, data: { assignedStaffUserId: null } });
        return previous;
      }
      case 'support-requests': {
        const row = await tx.supportRequest.findUniqueOrThrow({ where: { id } });
        const previous = this.valid(input, row.assignedStaffUserId,
          ['OPEN', 'ASSIGNED'].includes(row.status) && !row.startedAt && row.subject !== EARLY_RETURN_SUBJECT && !isTransferSubject(row.subject));
        await tx.supportRequest.update({ where: { id }, data: { assignedStaffUserId: null, status: 'OPEN', lastAction: null, lastActionIdempotencyKey: null } });
        return previous;
      }
      case 'maintenance': {
        const row = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id } });
        const previous = this.valid(input, row.assignedStaffUserId, row.status === 'OPEN' && !row.startedAt);
        await tx.maintenanceRequest.update({ where: { id }, data: { assignedStaffUserId: null, lastAction: null, lastActionIdempotencyKey: null } });
        return previous;
      }
      case 'damage-claims': {
        const row = await tx.damageClaim.findUniqueOrThrow({ where: { id } });
        const previous = this.valid(input, row.assignedStaffId, ['REPORTED', 'INVESTIGATING'].includes(row.status) && !row.staffFacts);
        await tx.damageClaim.update({ where: { id }, data: { assignedStaffId: null } });
        return previous;
      }
    }
  }
}
