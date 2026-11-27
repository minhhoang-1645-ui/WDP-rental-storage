import { assertTaskNotEscalated, pendingTaskException, recordTaskEvent } from './task-exception.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { SupportPriority } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertFacility, facilityIds } from '../facility-access/facility-access.service.js';
import { assertAssignmentVersion } from '../facility-access/operational-assignment.js';
import { reservationScope, returnTaskScope, supportTaskScope, taskFacilityId, transferTaskScope } from '../facility-access/task-access.js';
import { assignmentReference } from '../auth/staff-directory.controller.js';
import { readUnitHandoverDraft } from '../appointments/handover-report.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { isTransferSubject, transferSubjectFilter } from '../transfers/transfer-intake.js';
import { transferWork, type WorkKind } from './work-phase.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { ReturnsService } from '../returns/returns.service.js';
import { assertRoutineAccess } from '../facilities/facility-safety.js';
import { vietnamLocalTime } from '../operations/facility-hours.js';

type Db = Prisma.TransactionClient;
const tables = {
  appointments: 'HandoverAppointment', transfers: 'TransferRequest', returns: 'ReturnRequest',
  'support-requests': 'SupportRequest', maintenance: 'MaintenanceRequest', 'damage-claims': 'DamageClaim',
} as const;

const selfClaimKinds = ['appointments', 'returns', 'transfers', 'support-requests'] as const;
type SelfClaimKind = typeof selfClaimKinds[number];
type QueueItem = { kind: SelfClaimKind; id: string; code: string; status: string; reference: string; customerHint: string; unit?: string; destinationUnit?: string; scheduledAt?: Date | null; priority?: SupportPriority };
const reservation = { select: { reservationCode: true, customer: { select: { fullName: true } } } } as const;
const customerHint = (name: string) => name.trim().split(/\s+/).map(part => Array.from(part)[0] ?? '').join('.');
const unitLabel = (rows: { storageUnit: { unitNumber: string } }[]) =>
  [...new Set(rows.map(row => row.storageUnit.unitNumber))].sort().join(', ') || undefined;
const routineSupport = {
  closurePlanId: null, escalatedAt: null, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter,
  category: { in: ['LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'UNIT_ISSUE', 'OTHER'] },
} satisfies Prisma.SupportRequestWhereInput;
const openSupport = {
  ...routineSupport, status: 'OPEN', startedAt: null, customerWaitReason: null,
} satisfies Prisma.SupportRequestWhereInput;
const approvedMove = {
  status: 'APPROVED', closurePlanId: null, reason: { not: 'OPERATIONAL_RELOCATION' },
  approvedByUserId: { not: null }, approvedAt: { not: null }, toStorageUnitId: { not: null },
  toReservationUnitId: { not: null },
} satisfies Prisma.TransferRequestWhereInput;

@Injectable()
export class AssignmentQueueService {
  constructor(private readonly prisma: PrismaService, private readonly appointments: AppointmentsService,
    private readonly returns: ReturnsService) {}

  async list(actor: PublicUser, schedule = false) {
    if (actor.role !== 'FACILITY_STAFF' && actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const [facilityId] = await facilityIds(this.prisma, actor);
    if (!facilityId) return { items: [] };
    const now = new Date();
    const day = vietnamLocalTime(now).date;
    const from = new Date(day + 'T00:00:00+07:00');
    const today = { gte: from, lt: new Date(+from + 86_400_000) };
    const unassigned = schedule ? {} : { assignedStaffUserId: null };
    const localUnit = { storageUnit: { storageType: { facilityId } } };
    const unitNumber = { storageUnit: { select: { unitNumber: true } } } as const;
    const [appointments, returns, support, transfers] = await Promise.all([
      this.prisma.handoverAppointment.findMany({ where: { ...unassigned, status: 'CONFIRMED',
        scheduledAt: schedule ? today : { lte: now }, reservation: reservationScope(actor) },
        select: { id: true, status: true, appointmentCode: true, scheduledAt: true, reservation: { select: {
          ...reservation.select, units: { where: { ...localUnit, releasedAt: null }, select: unitNumber },
        } } } }),
      this.prisma.returnRequest.findMany({ where: { ...returnTaskScope(actor), ...unassigned, status: 'REQUESTED',
        ...(schedule ? { inspectionScheduledAt: today } : { AND: [{ OR: [{ inspectionScheduledAt: null }, { inspectionScheduledAt: { lte: now } }] }] }) },
        select: { id: true, status: true, returnCode: true, inspectionScheduledAt: true, reservation,
          inspections: { where: localUnit, select: unitNumber } } }),
      this.prisma.supportRequest.findMany({ where: { AND: [supportTaskScope(actor), schedule ? { ...routineSupport, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } : openSupport], ...unassigned,
        ...(schedule ? { createdAt: today } : {}) },
        select: { id: true, status: true, supportCode: true, priority: true, reservation, storageUnit: { select: { unitNumber: true } } } }),
      schedule ? [] : this.prisma.transferRequest.findMany({ where: { ...transferTaskScope(actor), ...unassigned, ...approvedMove },
        select: { id: true, status: true, transferCode: true, reservation,
          fromStorageUnit: { select: { unitNumber: true } }, toStorageUnit: { select: { unitNumber: true } } } }),
    ]);
    const items: QueueItem[] = [
      ...appointments.map((r): QueueItem => ({ kind: 'appointments', id: r.id, code: r.appointmentCode, status: r.status, reference: r.reservation.reservationCode, customerHint: customerHint(r.reservation.customer.fullName), unit: unitLabel(r.reservation.units), scheduledAt: r.scheduledAt })),
      ...returns.map((r): QueueItem => ({ kind: 'returns', id: r.id, code: r.returnCode, status: r.status, reference: r.reservation.reservationCode, customerHint: customerHint(r.reservation.customer.fullName), unit: unitLabel(r.inspections), scheduledAt: r.inspectionScheduledAt })),
      ...support.map((r): QueueItem => ({ kind: 'support-requests', id: r.id, code: r.supportCode, status: r.status, reference: r.reservation.reservationCode, customerHint: customerHint(r.reservation.customer.fullName), unit: r.storageUnit?.unitNumber, priority: r.priority })),
      ...transfers.map((r): QueueItem => ({ kind: 'transfers', id: r.id, code: r.transferCode, status: r.status, reference: r.reservation.reservationCode, customerHint: customerHint(r.reservation.customer.fullName), unit: r.fromStorageUnit.unitNumber, destinationUnit: r.toStorageUnit?.unitNumber })),
    ];
    const ready: QueueItem[] = [];
    for (const item of items) {
      if (!schedule) {
        try {
          await this.assertClaimReady(this.prisma, item.kind, item.id, facilityId, now);
        } catch (error) {
          if (error instanceof ConflictException || error instanceof NotFoundException) continue;
          throw error;
        }
      }
      ready.push(item);
    }
    return { items: ready.sort((a, b) => +(a.scheduledAt ?? now) - +(b.scheduledAt ?? now) || a.code.localeCompare(b.code)) };
  }

  async claim(actor: PublicUser, taskType: string, id: string) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên cơ sở được tự nhận việc.');
    if (!(selfClaimKinds as readonly string[]).includes(taskType)) throw new ForbiddenException('Công việc này cần quản lý phân công.');
    const kind = taskType as SelfClaimKind;
    return this.prisma.$transaction(async tx => {
      const found = await tx.$queryRaw<{ id: string; assignedStaffUserId: string | null }[]>(
        Prisma.sql`SELECT id, "assignedStaffUserId" FROM ${Prisma.raw('"' + tables[kind] + '"')} WHERE id = ${id} FOR UPDATE`);
      if (!found.length) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      const reference = await assignmentReference(tx, kind, id);
      if (!reference) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      const facilityId = await taskFacilityId(tx, reference);
      await assertFacility(tx, actor, facilityId);
      if (found[0].assignedStaffUserId) throw new ConflictException('Công việc đã có người phụ trách. Hãy làm mới hàng chờ.');
      const assignedAt = new Date();
      await this.assertClaimReady(tx, kind, id, facilityId, assignedAt);
      const assignedStaffUserId = actor.id;
      switch (kind) {
        case 'appointments':
          await tx.handoverAppointment.update({ where: { id }, data: { assignedStaffUserId, assignedAt, assignedByUserId: actor.id } });
          break;
        case 'returns':
          await tx.returnRequest.update({ where: { id }, data: { assignedStaffUserId } });
          break;
        case 'transfers':
          await tx.transferRequest.update({ where: { id }, data: { assignedStaffUserId } });
          break;
        case 'support-requests':
          await tx.supportRequest.update({ where: { id }, data: { assignedStaffUserId, status: 'ASSIGNED', lastAction: 'CLAIM', lastActionIdempotencyKey: null } });
      }
      await recordAssignment(tx, actor, kind, id, null, assignedStaffUserId, { source: 'SELF_CLAIM', facilityId, assignedAt: assignedAt.toISOString() });
      return { id, assignedStaffUserId, assignedAt };
    }, { isolationLevel: 'ReadCommitted' });
  }

  private async assertClaimReady(tx: Db, kind: SelfClaimKind, id: string, facilityId: string, now: Date) {
    if (kind === 'appointments' || kind === 'returns') await assertTaskNotEscalated(tx, kind, id);
    switch (kind) {
      case 'appointments': return this.appointments.assertClaimReady(tx, id, now);
      case 'returns': return this.returns.assertClaimReady(tx, id, now);
      case 'support-requests': {
        const row = await tx.supportRequest.findFirst({ where: { id, ...openSupport }, select: { id: true } });
        if (!row) throw new ConflictException('Yêu cầu hỗ trợ cần quản lý phân công hoặc không còn chờ nhận.');
        return;
      }
      case 'transfers': {
        const row = await tx.transferRequest.findFirst({ where: { id, ...approvedMove }, include: {
          fromStorageUnit: { select: { status: true, storageTypeId: true } },
          toStorageUnit: { select: { status: true, storageTypeId: true, storageType: { select: { facilityId: true } },
            incidentBlocks: { where: { releasedAt: null }, take: 1 }, maintenanceRequests: { where: { activeKey: { not: null } }, take: 1 } } },
          toReservationUnit: { select: { storageUnitId: true, reservationId: true, releasedAt: true, plannedEndDate: true } },
          fromReservationUnit: { select: { releasedAt: true } },
          rentalContract: { select: { status: true, reservationUnitId: true } },
        } });
        if (!row?.toStorageUnitId || row.fromStorageUnit.status !== 'OCCUPIED'
          || row.rentalContract.status !== 'ACTIVE' || row.rentalContract.reservationUnitId !== row.fromReservationUnitId
          || row.fromReservationUnit.releasedAt || row.toStorageUnit?.storageType.facilityId !== facilityId
          || row.toStorageUnit.storageTypeId !== row.fromStorageUnit.storageTypeId || row.toStorageUnit.status !== 'RESERVED' || row.toStorageUnit.incidentBlocks.length || row.toStorageUnit.maintenanceRequests.length
          || row.toReservationUnit?.storageUnitId !== row.toStorageUnitId || row.toReservationUnit.reservationId !== row.reservationId
          || row.toReservationUnit.releasedAt || !row.toReservationUnit.plannedEndDate
          || vietnamLocalTime(row.toReservationUnit.plannedEndDate).date <= vietnamLocalTime(now).date
          || row.commercialSnapshot && (!row.customerAcceptedAt || !(row.commercialSnapshot as { adjustmentTerms?: { invoiceId?: string } }).adjustmentTerms?.invoiceId)
          || transferWork(row).problemPending || transferWork(row).awaitingCustomer) {
          throw new ConflictException('Chuyển kho chưa được duyệt, chưa giữ kho hợp lệ hoặc cần quản lý xử lý.');
        }
        await assertRoutineAccess(tx, [row.fromStorageUnitId, row.toStorageUnitId]);
      }
    }
  }

  async coordination(actor: PublicUser) {
    const [facilityId] = await facilityIds(this.prisma, actor);
    if (!facilityId) return { changes: [] };
    const observed = await this.prisma.auditEvent.findMany({ where: { category: 'ACTIVITY', outcome: 'SUCCESS',
      action: { in: ['TASK_ASSIGNMENT', 'TASK_ESCALATED', 'TASK_RESUMED'] },
      metadata: { path: ['facilityId'], equals: facilityId }, resourceId: { not: null } },
      distinct: ['resource', 'resourceId'], select: { resource: true, resourceId: true } });
    if (!observed.length) return { changes: [] };
    const events = await this.prisma.auditEvent.findMany({ where: { category: 'ACTIVITY', outcome: 'SUCCESS',
      action: { in: ['TASK_ASSIGNMENT', 'TASK_ESCALATED', 'TASK_RESUMED'] },
      OR: observed.map(row => ({ resource: row.resource, resourceId: row.resourceId })) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['resource', 'resourceId', 'action'],
      select: { action: true, resource: true, resourceId: true, metadata: true, actorRole: true, createdAt: true, id: true } });
    const changes = new Map<string, { kind: string; id: string; selfClaimedBy?: string; managerAssignedTo?: string; exception?: string }>();
    const visitedException = new Set<string>();
    for (const event of events) {
      const id = event.resourceId!;
      const kind = event.resource;
      const key = kind + ':' + id;
      const item = changes.get(key) ?? { kind, id };
      const metadata = event.metadata as { facilityId?: string; source?: string; assignedStaffUserId?: string; reason?: string } | null;
      if (event.action === 'TASK_ASSIGNMENT') {
        if (metadata?.facilityId === facilityId && metadata.assignedStaffUserId) {
          if (metadata.source === 'SELF_CLAIM') item.selfClaimedBy = metadata.assignedStaffUserId;
          else if (event.actorRole === 'FACILITY_MANAGER') item.managerAssignedTo = metadata.assignedStaffUserId;
        }
      } else if (event.action !== 'TASK_ASSIGNMENT' && !visitedException.has(key)) {
        visitedException.add(key);
        if (event.action === 'TASK_ESCALATED' && metadata?.facilityId === facilityId) item.exception = metadata.reason;
      }
      changes.set(key, item);
    }
    return { changes: [...changes.values()].filter(item => item.selfClaimedBy || item.managerAssignedTo || item.exception) };
  }

  exception(actor: PublicUser, taskType: string, id: string, input: Record<string, unknown>, resume: boolean) {
    if (actor.role !== (resume ? 'FACILITY_MANAGER' : 'FACILITY_STAFF')) throw new ForbiddenException();
    if (taskType !== 'appointments' && taskType !== 'returns') throw new BadRequestException('Dùng chức năng xử lý ngoại lệ tại hồ sơ này.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 500) throw new BadRequestException('Nhập lý do xử lý vướng mắc.');
    return this.prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ status: string; assignedStaffUserId: string | null }[]>(
        Prisma.sql`SELECT status::text, "assignedStaffUserId" FROM ${Prisma.raw('"' + tables[taskType] + '"')} WHERE id = ${id} FOR UPDATE`);
      if (!row) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      const reference = await assignmentReference(tx, taskType, id);
      if (!reference) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      const facilityId = await taskFacilityId(tx, reference);
      await assertFacility(tx, actor, facilityId);
      if (!resume && row.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ người phụ trách được báo vướng mắc.');
      if (!(taskType === 'appointments' ? ['REQUESTED', 'CONFIRMED'] : ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND']).includes(row.status)) {
        throw new ConflictException('Nhiệm vụ đã qua bước xử lý của nhân viên.');
      }
      if (taskType === 'returns' && (await tx.returnRequest.findUnique({ where: { id }, select: { physicallyReturnedAt: true } }))?.physicallyReturnedAt) {
        throw new ConflictException('Đã hoàn tất kiểm tra vật lý.');
      }
      const pending = await pendingTaskException(tx, taskType, id);
      if (resume !== Boolean(pending)) throw new ConflictException(resume ? 'Hồ sơ không có vướng mắc cần xử lý.' : 'Hồ sơ đã chuyển quản lý.');
      await recordTaskEvent(tx, actor, resume ? 'TASK_RESUMED' : 'TASK_ESCALATED', taskType, id, { facilityId, reason });
      return { id, waitingForManager: !resume };
    });
  }

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
