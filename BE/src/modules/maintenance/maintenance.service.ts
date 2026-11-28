import { recordTaskEvent } from '../dispatch/task-exception.js';
import { assertCanStartDirectWork, workPhase } from '../dispatch/work-phase.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import { evidencePhotos } from '../../evidence-photos.js';
import { appendEvidenceLink } from '../facility-access/operational-evidence.js';
import { businessToday } from '../../business-date.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertAssignmentVersion, physicalHandoff } from '../facility-access/operational-assignment.js';
import { assertTaskFacility, facilityScope } from '../facility-access/task-access.js';
import { assertAssignmentAccess } from '../facility-access/facility-access.service.js';
import { validateMaintenancePhotos, type MaintenanceUpload } from './maintenance-photo.js';
import { validateRepairAttachments, type RepairUploads } from './maintenance-repair-attachment.js';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type MaintenanceRequest } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { maintenanceAmount, maintenanceAuditDetail, maintenanceCost, maintenanceCostEvidence } from './maintenance-cost.js';

type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'COMPLETED';
export const maintenancePriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const maintenanceCategories = ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'ACCESS_CREDENTIAL', 'FACILITY_EQUIPMENT', 'UTILITIES', 'SECURITY', 'OTHER'] as const;
const commonAreas = ['CORRIDOR', 'ENTRANCE', 'SECURITY', 'UTILITIES', 'OTHER'] as const;
type MaintenancePriority = typeof maintenancePriorities[number];
type MaintenanceCategory = typeof maintenanceCategories[number];
type RentalImpact = 'NO_IMPACT' | 'AFFECTED' | 'UNKNOWN';
type ViewMode = 'FACILITY_STAFF' | 'FACILITY_MANAGER';
type RepairPlanFields = Pick<MaintenanceRequest, 'surveyResult' | 'repairPlan' | 'repairMethod'>;

export interface MaintenanceListQuery {
  page: number;
  limit: number;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  category?: MaintenanceCategory;
  assignedToMe?: boolean;
  search?: string;
  facilityId?: string;
}

const unresolvedStatuses: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'];
const repairAttachments = {
  select: { id: true, kind: true, fileName: true, mimeType: true },
  orderBy: [{ kind: 'asc' }, { position: 'asc' }],
} satisfies Prisma.StaffEvidenceSubmissionInclude['repairAttachments'];
const affectedAllocationSelect = {
  reservation: { select: {
    id: true, facilityId: true, reservationCode: true,
    appointments: {
      where: { status: { in: ['REQUESTED', 'CONFIRMED'] } },
      select: { id: true, appointmentCode: true, scheduledAt: true, status: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    },
  } },
} satisfies Prisma.ReservationUnitSelect;
type AffectedAllocation = Prisma.ReservationUnitGetPayload<{ select: typeof affectedAllocationSelect }>;
type IncidentImpactBlock = { storageUnit: { unitNumber: string; reservationUnits?: AffectedAllocation[] } };

function affectedBookings(blocks: IncidentImpactBlock[], facilityId?: string) {
  type Appointment = AffectedAllocation['reservation']['appointments'][number];
  const bookings = new Map<string, { reservationId: string; reservationReference: string; unitCodes: string[]; appointments: Appointment[] }>();
  for (const { storageUnit } of blocks) {
    for (const { reservation } of storageUnit.reservationUnits ?? []) {
      if (!facilityId || reservation.facilityId !== facilityId) continue;
      const existing = bookings.get(reservation.id);
      if (existing) {
        if (!existing.unitCodes.includes(storageUnit.unitNumber)) existing.unitCodes.push(storageUnit.unitNumber);
      } else {
        bookings.set(reservation.id, { reservationId: reservation.id, reservationReference: reservation.reservationCode,
          unitCodes: [storageUnit.unitNumber], appointments: reservation.appointments });
      }
    }
  }
  return [...bookings.values()].sort((left, right) => left.reservationReference.localeCompare(right.reservationReference));
}

export function maintenanceFacilityScope(actor: PublicUser): Prisma.MaintenanceRequestWhereInput {
  return { OR: [
    { storageUnit: { storageType: { facility: facilityScope(actor) } } },
    { commonAreaFacility: facilityScope(actor) },
  ] };
}

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  createManual(input: Record<string, unknown>, key: string | undefined, actor: PublicUser, files: MaintenanceUpload[] = []) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được tạo yêu cầu bảo trì.');
    const parsed = this.manualInput(input, key);
    return this.createManualTransaction({ ...parsed, photos: validateMaintenancePhotos(files) }, actor);
  }

  listReportFacilities(actor: PublicUser) {
    return this.prisma.facility.findMany({
      where: facilityScope(actor), select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async listReportUnits(actor: PublicUser, query: MaintenanceListQuery) {
    const { page, limit, search } = query;
    if (query.facilityId) await assertTaskFacility(this.prisma, actor, { commonAreaFacilityId: query.facilityId });
    const where = { storageType: { facility: { ...facilityScope(actor), ...(query.facilityId ? { id: query.facilityId } : {}) } }, ...(search ? { unitNumber: { contains: search, mode: 'insensitive' as const } } : {}) };
    const [total, items] = await Promise.all([this.prisma.storageUnit.count({ where }), this.prisma.storageUnit.findMany({
      where, skip: (page - 1) * limit, take: limit,
      select: { id: true, unitNumber: true, status: true, storageType: { select: { facility: { select: { id: true, name: true } } } } },
      orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }],
    })]);
    return { page, limit, total, items: items.map(({ unitNumber, ...unit }) => ({ ...unit, unitCode: unitNumber })) };
  }

  async listAssessmentUnits(id: string, actor: PublicUser, query: MaintenanceListQuery) {
    const report = await this.getManager(id, actor);
    if (!report.facility?.id) throw new NotFoundException('Không tìm thấy cơ sở của phiếu.');
    return this.listReportUnits(actor, { ...query, facilityId: report.facility.id });
  }

  listStaff(query: MaintenanceListQuery, actor: PublicUser) {
    return this.list(query, 'FACILITY_STAFF', actor.id,actor);
  }

  async listReportedByStaff(query: MaintenanceListQuery, actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được xem báo cáo của mình.');
    const { facilityId, search } = query;
    if (facilityId) await assertTaskFacility(this.prisma, actor, { commonAreaFacilityId: facilityId });
    const match = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    const where: Prisma.MaintenanceRequestWhereInput = {
      source: 'MANUAL', reportedByUserId: actor.id,
      AND: [
        maintenanceFacilityScope(actor),
        ...(facilityId ? [{ OR: [{ commonAreaFacilityId: facilityId }, { storageUnit: { storageType: { facilityId } } }] }] : []),
        ...(match ? [{ OR: [{ maintenanceCode: match }, { storageUnit: { unitNumber: match } }] }] : []),
      ],
    };
    const [total, records] = await Promise.all([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        select: {
          id: true, maintenanceCode: true, category: true, priority: true, status: true, createdAt: true,
          rentalImpact: true, activeKey: true, incidentBlocks: { where: { releasedAt: null }, select: { id: true }, take: 1 },
          commonArea: true, locationNote: true, commonAreaFacility: { select: { name: true } },
          workNote: true, verificationNote: true, verifiedAt: true,
          reportedBy: { select: { fullName: true } }, assignedStaff: { select: { fullName: true } },
          verifiedBy: { select: { fullName: true } },
          storageUnit: { select: { unitNumber: true, storageType: { select: { facility: { select: { name: true } } } } } },
        },
      }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map(({ storageUnit, commonAreaFacility, activeKey, incidentBlocks, ...record }) => ({
      ...record, blocksUnit: Boolean(activeKey || incidentBlocks.length),
      unitCode: storageUnit?.unitNumber ?? null, facility: commonAreaFacility ?? storageUnit?.storageType.facility,
    })) };
  }

  listManager(query: MaintenanceListQuery, actor:PublicUser, assignedStaffUserId?: string) {
    managerReservationScope(actor);

    return this.list(query, 'FACILITY_MANAGER', assignedStaffUserId,actor);
  }

  async getStaff(id: string, actor: PublicUser) {
    const record = await this.prisma.maintenanceRequest.findFirst({ where: this.detailScope(id, actor),
      include: { ...this.include(), evidenceSubmissions: { where: { staffUserId: actor.id },
        include: { repairAttachments },
        omit: { maintenanceSubmissionKey: true }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }] } } });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu bảo trì.');
    const view = this.toMaintenance(record, 'FACILITY_STAFF', actor.id);
    const hasCurrentRole = record.assignedStaffUserId === actor.id || record.reportedByUserId === actor.id;
    return { ...view, ...(hasCurrentRole ? { workPhotos: record.workPhotos ?? [] } : { workPhotos: [], workNote: null }),
      evidenceSubmissions: record.evidenceSubmissions };
  }

  async getManager(id: string, actor:PublicUser) {
    managerReservationScope(actor);

    const record = await this.prisma.maintenanceRequest.findFirst({ where: this.detailScope(id, actor),
      include: { ...this.include(true), evidenceSubmissions: {
        include: { repairAttachments },
        omit: { maintenanceSubmissionKey: true }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }] } } });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu bảo trì.');
    const history = await this.prisma.auditEvent.findMany({
      where: { resource: 'maintenance', resourceId: record.id, action: { in: [
        'MAINTENANCE_REPAIR_PLANNED', 'TASK_ASSIGNMENT', 'TASK_STAFF_COMPLETED', 'INCIDENT_VERIFIED',
        'INCIDENT_VERIFICATION_REJECTED', 'INCIDENT_CLOSED_WITHOUT_REPAIR', 'MAINTENANCE_COST_ADJUSTED',
      ] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, action: true, actorName: true, createdAt: true, metadata: true },
    });
    return {
      ...this.toMaintenance(record, 'FACILITY_MANAGER'),
      workPhotos: record.workPhotos ?? [], evidenceSubmissions: record.evidenceSubmissions,
      history: history.map(({ metadata, ...event }) => ({
        ...event, metadata: event.action.startsWith('MAINTENANCE_') ? maintenanceAuditDetail(event.action, metadata)
          : metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { note: metadata.note } : {},
      })),
    };
  }

  private detailScope(id: string, actor: PublicUser): Prisma.MaintenanceRequestWhereInput {
    return { AND: [
      { OR: [{ id }, { maintenanceCode: id }] },
      maintenanceFacilityScope(actor),
      ...(actor.role === 'FACILITY_STAFF' ? [{ OR: [
        { assignedStaffUserId: actor.id },
        { source: 'MANUAL' as const, reportedByUserId: actor.id },
        { evidenceSubmissions: { some: { staffUserId: actor.id } } },
      ] }] : []),
    ] };
  }

  async getPhoto(id: string, photoId: string, actor: PublicUser) {
    const photo = await this.prisma.maintenancePhoto.findFirst({
      where: { id: photoId, maintenanceRequest: this.detailScope(id, actor) },
      select: { bytes: true, mimeType: true },
    });
    if (!photo) throw new NotFoundException('Không tìm thấy ảnh sự cố.');
    return photo;
  }

  async getRepairAttachment(id: string, submissionId: string, attachmentId: string, actor: PublicUser) {
    const file = await this.prisma.maintenanceRepairAttachment.findFirst({
      where: { id: attachmentId, submission: {
        id: submissionId,
        maintenanceRequest: this.detailScope(id, actor),
        ...(actor.role === 'FACILITY_STAFF' ? { staffUserId: actor.id } : {}),
      } },
      select: { bytes: true, mimeType: true, fileName: true },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp của lần sửa chữa.');
    return file;
  }

  assign(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const staffUserId = this.requiredText(input.staffUserId, 100, 'staffUserId');
    return this.transition(id, key, 'ASSIGN', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      const staff = await assertAssignmentAccess(tx, actor, staffUserId, current);
      if (!staff || staff.role !== 'FACILITY_STAFF' || staff.accountStatus !== 'ACTIVE') throw new BadRequestException('Chỉ giao bảo trì cho nhân viên đang hoạt động.');
      this.assertRepairPlan(current);
      assertAssignmentVersion(input, current.assignedStaffUserId);
      if (current.assignedStaffUserId === staff.id) return current;
      await recordAssignment(tx,actor,"maintenance",current.id,current.assignedStaffUserId,staff.id,
        { ...physicalHandoff(input, Boolean(current.assignedStaffUserId && current.status === 'IN_PROGRESS')), facilityId: staff.facilityId });
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { assignedStaffUserId: staff.id, lastAction: 'ASSIGN', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_MANAGER');
  }

  updatePriority(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const priority = input.priority;
    if (!maintenancePriorities.includes(priority as MaintenancePriority)) throw new BadRequestException('Mức ưu tiên không hợp lệ.');
    return this.transition(id, key, 'PRIORITY', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { priority: priority as MaintenancePriority, lastAction: 'PRIORITY', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_MANAGER');
  }

  holdUnsafeUnit(id: string, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'HOLD_UNSAFE_UNIT', async (tx, current, safeKey) => {
      if (!current.storageUnitId) throw new BadRequestException('Chọn phạm vi ô bị ảnh hưởng.');
      return this.assessBlocks(tx, current, [current.storageUnitId], actor, 'HOLD_UNSAFE_UNIT', safeKey);
    }, actor, 'FACILITY_MANAGER');
  }

  assess(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const unitIds = this.unitIds(input.affectedUnitIds);
    if (input.affectedUnitIds === undefined) throw new BadRequestException('Cần gửi phạm vi đánh giá.');
    const expected = input.expectedAffectedUnitIds === undefined ? undefined : this.unitIds(input.expectedAffectedUnitIds);
    return this.transition(id, key, 'ASSESS_BOOKING_IMPACT', (tx, current, safeKey) => {
      if (expected && JSON.stringify(expected) !== JSON.stringify(current.incidentBlocks.map((block: { storageUnitId: string }) => block.storageUnitId).sort())) {
        throw new ConflictException('Phạm vi khóa vừa thay đổi. Tải lại phiếu trước khi đánh giá.');
      }
      return this.assessBlocks(tx, current, unitIds, actor, 'ASSESS_BOOKING_IMPACT', safeKey);
    }, actor, 'FACILITY_MANAGER');
  }

  private async assessBlocks(tx: Prisma.TransactionClient, current: any, unitIds: string[], actor: PublicUser, action: string, safeKey: string) {
    this.assertUnresolved(current);
    if (current.storageUnitId && unitIds.some(id => id !== current.storageUnitId)) {
      throw new BadRequestException('Phiếu ô kho chỉ áp dụng cho ô được báo.');
    }
    const facilityId = current.commonAreaFacilityId ?? current.storageUnit?.storageType.facility.id;
    await this.replaceBlocks(tx, current.id, facilityId, unitIds, actor);
    return tx.maintenanceRequest.update({
      where: { id: current.id }, data: { lastAction: action, lastActionIdempotencyKey: safeKey }, include: this.include(),
    });
  }

  private async replaceBlocks(tx: Prisma.TransactionClient, incidentId: string, facilityId: string, wanted: string[], actor: PublicUser, reason = 'ASSESS') {
    const existing = await tx.incidentUnitBlock.findMany({
      where: { maintenanceRequestId: incidentId, releasedAt: null }, select: { id: true, storageUnitId: true },
    });
    const currentIds = new Set(existing.map(block => block.storageUnitId));
    const added = wanted.filter(id => !currentIds.has(id));
    const removed = existing.filter(block => !wanted.includes(block.storageUnitId));
    const touched = [...added, ...removed.map(block => block.storageUnitId)].sort();
    for (const id of touched) {
      const changed = await tx.storageUnit.updateMany({
        where: { id, storageType: { facilityId } }, data: { bookingSafetyVersion: { increment: 1 } },
      });
      if (!changed.count) throw new BadRequestException('Phạm vi ảnh hưởng có ô không thuộc cơ sở của phiếu.');
    }
    if (removed.length) await tx.incidentUnitBlock.updateMany({
      where: { id: { in: removed.map(block => block.id) } }, data: { releasedAt: new Date() },
    });
    if (added.length) await tx.incidentUnitBlock.createMany({
      data: added.map(storageUnitId => ({ maintenanceRequestId: incidentId, storageUnitId })),
    });
    if (added.length || removed.length || reason !== 'REPORT') await this.auditIncident(tx, actor, incidentId, 'INCIDENT_BOOKING_SCOPE', {
      reason, facilityId, blockedUnitIds: wanted, addedUnitIds: added, releasedUnitIds: removed.map(block => block.storageUnitId),
    });
  }

  private auditIncident(tx: Prisma.TransactionClient, actor: PublicUser, id: string, action: string, metadata: Prisma.InputJsonObject) {
    return tx.auditEvent.create({ data: {
      category: 'ACTIVITY', action, outcome: 'SUCCESS', resource: 'maintenance', resourceId: id,
      actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role,
      method: 'POST', route: '/maintenance/' + id, httpStatus: 200, metadata,
    } });
  }

  start(id: string, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'START', async (tx, current, safeKey) => {
      if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ Staff được bắt đầu công việc được giao.');
      if (current.status !== 'OPEN') throw new ConflictException(`Chỉ maintenance OPEN mới có thể bắt đầu; trạng thái hiện tại là ${current.status}.`);
      if (!current.assignedStaffUserId) throw new ConflictException({ code: 'MAINTENANCE_ASSIGNMENT_REQUIRED', message: 'Manager phải giao Staff trước khi bắt đầu.' });
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới có thể bắt đầu công việc này.');
      this.assertRepairPlan(current);
      this.assertUnitMaintenance(current);
      await assertCanStartDirectWork(tx, actor.id, 'maintenance', current.id);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), lastAction: 'START', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_STAFF');
  }

  completeWork(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser, files: RepairUploads = {}) {
    this.requiredText(input.workNote, 4000, 'workNote');
    const workNote = this.requiredText(appendEvidenceLink(input.workNote, input.evidenceLink), 4000, 'workNote');
    const workPhotos = evidencePhotos(input.workPhotos);
    const actualCostVnd = maintenanceAmount(input.actualCostVnd, 'Chi phí thực tế');
    const costEvidenceLinks = maintenanceCostEvidence(input.costEvidenceLinks);
    const attachments = validateRepairAttachments(files);
    return this.transition(id, key, 'COMPLETE_WORK', async (tx, current, safeKey) => {
      if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ Staff được hoàn tất công việc được giao.');
      const submitted = await tx.staffEvidenceSubmission.findUnique({ where: { maintenanceSubmissionKey: safeKey } });
      if (submitted) {
        if (submitted.maintenanceRequestId !== current.id || submitted.staffUserId !== actor.id) {
          throw new ConflictException('Idempotency-Key đã được dùng cho lần sửa chữa khác.');
        }
        return current;
      }
      if (current.status !== 'IN_PROGRESS') throw new ConflictException(`Chỉ maintenance IN_PROGRESS mới có thể gửi xác minh; trạng thái hiện tại là ${current.status}.`);
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới có thể hoàn tất công việc này.');
      this.assertRepairPlan(current);
      this.assertUnitMaintenance(current);
      const facilityId = current.commonAreaFacilityId ?? current.storageUnit?.storageType.facility.id;
      await recordTaskEvent(tx, actor, 'TASK_STAFF_COMPLETED', 'maintenance', current.id,
        { ...(facilityId && { facilityId }), nextStatus: 'AWAITING_VERIFICATION' });
      const now = new Date();
      if (actualCostVnd !== null || costEvidenceLinks.length || attachments.some(file => file.kind === 'RECEIPT')) {
        await this.auditIncident(tx, actor, current.id, 'MAINTENANCE_COST_PROPOSED', {
          actualVnd: actualCostVnd?.toFixed(0) ?? null, evidenceLinks: costEvidenceLinks,
        });
      }
      const actualTotal = actualCostVnd == null ? current.actualCostVnd
        : (current.actualCostVnd ?? new Prisma.Decimal(0)).plus(actualCostVnd);
      this.assertCostLimit(actualTotal);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: {
          status: 'AWAITING_VERIFICATION', workCompletedAt: now, workNote, workPhotos, lastAction: 'COMPLETE_WORK', lastActionIdempotencyKey: safeKey,
          actualCostVnd: actualTotal,
          costEvidenceLinks: [...new Set([...(current.costEvidenceLinks ?? []), ...costEvidenceLinks])],
          evidenceSubmissions: { create: {
            staffUserId: actor.id, staffName: actor.fullName, note: workNote, photos: workPhotos, recordedAt: now,
            maintenanceSubmissionKey: safeKey, maintenanceCostVnd: actualCostVnd, maintenanceCostLinks: costEvidenceLinks,
              ...(attachments.length ? { repairAttachments: { create: attachments } } : {}),
          } },
        },
        include: this.include(),
      });
    }, actor, 'FACILITY_STAFF');
  }

  planRepair(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const surveyResult = this.requiredText(input.surveyResult, 4000, 'Kết quả khảo sát');
    const repairPlan = this.requiredText(input.repairPlan, 4000, 'Phương án sửa chữa');
    const repairMethod = input.repairMethod;
    if (repairMethod !== 'INTERNAL' && repairMethod !== 'EXTERNAL') {
      throw new BadRequestException('Chọn sửa chữa nội bộ hoặc thuê ngoài.');
    }
    return this.transition(id, key, 'PLAN_REPAIR', async (tx, current, safeKey) => {
      if (current.status === 'COMPLETED' || current.costConfirmedAt) throw new ConflictException('Phiếu đã hoàn tất.');
      if (input.expectedUpdatedAt !== current.updatedAt.toISOString()) throw new ConflictException('Phiếu vừa thay đổi. Tải lại trước khi lưu.');
      await this.auditIncident(tx, actor, current.id, 'MAINTENANCE_REPAIR_PLANNED', {
        surveyResult, repairPlan, repairMethod,
        before: { surveyResult: current.surveyResult, repairPlan: current.repairPlan, repairMethod: current.repairMethod },
      });
      return tx.maintenanceRequest.update({ where: { id: current.id }, data: {
        surveyResult, repairPlan, repairMethod,
        lastAction: 'PLAN_REPAIR', lastActionIdempotencyKey: safeKey,
      }, include: this.include() });
    }, actor, 'FACILITY_MANAGER');
  }

  confirmCost(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'CONFIRM_COST', async (tx, current, safeKey) => {
      if (current.costConfirmedAt) throw new ConflictException('Chi phí của phiếu đã được xác nhận.');
      if (current.status !== 'COMPLETED' || current.actualCostVnd == null) {
        throw new ConflictException('Cần nghiệm thu đạt và có chi phí thực tế do Staff ghi nhận.');
      }
      const cost = maintenanceCost(current);
      if (input.expectedActualVnd !== cost.actualVnd) {
        throw new ConflictException('Chi phí đã thay đổi. Tải lại trước khi xác nhận.');
      }
      const proposals = await tx.staffEvidenceSubmission.findMany({
        where: { maintenanceRequestId: current.id, maintenanceCostVnd: { not: null } },
        select: { id: true, maintenanceCostVnd: true },
      });
      const selected = input.submissionIds;
      if ((proposals.length || selected !== undefined) && (!Array.isArray(selected) || (proposals.length > 0 && selected.length === 0) || new Set(selected).size !== selected.length ||
        selected.some(id => typeof id !== 'string' || !proposals.some(proposal => proposal.id === id)))) {
        throw new BadRequestException('Chọn các khoản chi phí hợp lệ của phiếu này.');
      }
      const approved = proposals.filter(proposal => Array.isArray(selected) && selected.includes(proposal.id));
      const approvedIds = approved.map(proposal => proposal.id);
      const actualCostVnd = approved.length
        ? approved.reduce((sum, proposal) => sum.plus(proposal.maintenanceCostVnd!), new Prisma.Decimal(0))
        : current.actualCostVnd;
      const costConfirmedAt = new Date();
      const confirmed = maintenanceCost({ ...current, actualCostVnd, costConfirmedAt });
      await this.auditIncident(tx, actor, current.id, 'MAINTENANCE_COST_CONFIRMED', {
        ...confirmed, proposedVnd: cost.actualVnd, approvedIds,
      });
      return tx.maintenanceRequest.update({ where: { id: current.id }, data: {
        actualCostVnd, confirmedCostSubmissionIds: approvedIds,
        costConfirmedAt, costConfirmedByUserId: actor.id,
        lastAction: 'CONFIRM_COST', lastActionIdempotencyKey: safeKey,
      }, include: this.include() });
    }, actor, 'FACILITY_MANAGER');
  }

  adjustCost(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const reason = this.requiredText(input.reason, 4000, 'Lý do điều chỉnh');
    const amount = maintenanceAmount(input.actualCostVnd, 'Chi phí sau điều chỉnh');
    if (amount === null) throw new BadRequestException('Nhập chi phí sau điều chỉnh.');
    return this.transition(id, key, 'ADJUST_COST', async (tx, current, safeKey) => {
      if (!current.costConfirmedAt || current.actualCostVnd == null) throw new ConflictException('Phiếu chưa có chi phí được xác nhận.');
      if (input.expectedUpdatedAt !== current.updatedAt.toISOString()) throw new ConflictException('Phiếu vừa thay đổi. Tải lại trước khi lưu.');
      if (amount.eq(current.actualCostVnd)) throw new BadRequestException('Chi phí sau điều chỉnh phải khác số đã xác nhận.');
      await this.auditIncident(tx, actor, current.id, 'MAINTENANCE_COST_ADJUSTED', {
        before: maintenanceCost(current), after: maintenanceCost({ ...current, actualCostVnd: amount }),
        firstConfirmedAt: current.costConfirmedAt.toISOString(), reason,
      });
      return tx.maintenanceRequest.update({ where: { id: current.id }, data: {
        actualCostVnd: amount, lastAction: 'ADJUST_COST', lastActionIdempotencyKey: safeKey,
      }, include: this.include() });
    }, actor, 'FACILITY_MANAGER');
  }

  private assertCostLimit(amount: Prisma.Decimal | null) {
    if (amount?.gt('999999999999999999')) throw new BadRequestException('Tổng chi phí vượt giới hạn 18 chữ số VND.');
  }

  async costHistory(id: string, actor: PublicUser) {
    const report = await this.getManager(id, actor);
    const events = await this.prisma.auditEvent.findMany({
      where: { resource: 'maintenance', resourceId: report.id,
        action: { in: ['MAINTENANCE_REPAIR_PLANNED', 'MAINTENANCE_COST_PROPOSED', 'MAINTENANCE_COST_CONFIRMED', 'MAINTENANCE_COST_RETURNED', 'MAINTENANCE_COST_ADJUSTED'] } },
      select: { id: true, action: true, actorName: true, createdAt: true, metadata: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return events.map(event => ({ ...event, metadata: maintenanceAuditDetail(event.action, event.metadata) }));
  }

  verify(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.optionalText(input?.note, 4000, 'note');
    return this.transition(id, key, 'VERIFY', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể xác minh; trạng thái hiện tại là ${current.status}.`);
      this.assertRepairReadyForReview(current);
      if (input.safetyVerified !== true) throw new BadRequestException('Hãy xác nhận đã kiểm tra an toàn.');
      return this.finishMaintenance(tx, current, actor, note, safeKey, 'VERIFY');
    }, actor, 'FACILITY_MANAGER');
  }

  closeWithoutRepair(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const surveyResult = this.requiredText(input.surveyResult, 4000, 'Kết quả kiểm tra hiện trạng');
    const reason = this.requiredText(input.reason, 4000, 'Lý do không cần sửa chữa');
    if (input.safetyVerified !== true) throw new BadRequestException('Hãy xác nhận đã kiểm tra an toàn.');
    return this.transition(id, key, 'CLOSE_WITHOUT_REPAIR', async (tx, current, safeKey) => {
      if (current.status !== 'OPEN' || current.startedAt) {
        throw new ConflictException('Phiếu đã bắt đầu xử lý. Hãy ghi nhận kết quả và nghiệm thu.');
      }
      return this.finishMaintenance(tx, current, actor, reason, safeKey, 'CLOSE_WITHOUT_REPAIR', surveyResult);
    }, actor, 'FACILITY_MANAGER');
  }

  private async finishMaintenance(tx: Prisma.TransactionClient, current: any, actor: PublicUser, note: string | null,
    safeKey: string, action: 'VERIFY' | 'CLOSE_WITHOUT_REPAIR', surveyResult?: string) {
    this.assertUnitMaintenance(current);
    await this.replaceBlocks(tx, current.id, current.commonAreaFacilityId ?? current.storageUnit?.storageType.facility.id,
      [], actor, action === 'VERIFY' ? 'VERIFIED' : action);
    await this.auditIncident(tx, actor, current.id, action === 'VERIFY' ? 'INCIDENT_VERIFIED' : 'INCIDENT_CLOSED_WITHOUT_REPAIR',
      { note, safetyVerified: true, ...(surveyResult === undefined ? {} : { surveyResult }) });
    if (current.activeKey && current.storageUnit?.status === 'MAINTENANCE') {
      const occupied = await tx.rentalContract.count({ where: {
        status: 'ACTIVE', reservationUnit: { storageUnitId: current.storageUnitId, releasedAt: null },
      } });
      if (occupied) throw new ConflictException('Kho vẫn còn hợp đồng đang sử dụng. Kiểm tra phân bổ trước khi nghiệm thu.');
      const today = businessToday();
      const held = await tx.reservationUnit.count({ where: {
        storageUnitId: current.storageUnitId, releasedAt: null,
        OR: [{ incomingTransfer: { status: 'APPROVED' } }, {
          reservation: { status: 'CONFIRMED' }, plannedStartDate: { lte: today }, plannedEndDate: { gt: today },
        }],
      } });
      const changed = await tx.storageUnit.updateMany({ where: { id: current.storageUnitId, status: 'MAINTENANCE' }, data: { status: held ? 'RESERVED' : 'AVAILABLE' } });
      if (changed.count !== 1) throw new ConflictException('StorageUnit không còn ở trạng thái MAINTENANCE.');
    }
    return tx.maintenanceRequest.update({
      where: { id: current.id },
      data: {
        status: 'COMPLETED', activeKey: null, verifiedByUserId: actor.id, verifiedAt: new Date(), verificationNote: note,
        ...(surveyResult === undefined ? {} : { surveyResult }),
        lastAction: action, lastActionIdempotencyKey: safeKey,
      },
      include: this.include(),
    });
  }

  rejectVerification(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.requiredText(input.note, 4000, 'note');
    return this.transition(id, key, 'REJECT_VERIFICATION', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể bị trả lại; trạng thái hiện tại là ${current.status}.`);
      this.assertRepairReadyForReview(current);
      this.assertUnitMaintenance(current);
      await this.auditIncident(tx, actor, current.id, 'INCIDENT_VERIFICATION_REJECTED', { note });
      const latest = await tx.staffEvidenceSubmission.findFirst({
        where: { maintenanceRequestId: current.id, maintenanceSubmissionKey: { not: null } },
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (latest) await tx.staffEvidenceSubmission.update({
        where: { id: latest.id }, data: { maintenanceRejectedAt: new Date(), maintenanceRejectionReason: note },
      });
      if (current.actualCostVnd != null || current.costEvidenceLinks?.length) {
        await this.auditIncident(tx, actor, current.id, 'MAINTENANCE_COST_RETURNED', {
          ...maintenanceCost(current), evidenceLinks: current.costEvidenceLinks, note,
        });
      }
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', verificationNote: note, lastAction: 'REJECT_VERIFICATION', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_MANAGER');
  }

  private async createManualTransaction(parsed: ReturnType<MaintenanceService['manualInput']> & { photos: ReturnType<typeof validateMaintenancePhotos> }, actor: PublicUser) {
    const retry = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.maintenanceRequest.findUnique({ where: { createIdempotencyKey: parsed.idempotencyKey }, include: this.include() });
      if (!existing) return null;
      await assertTaskFacility(tx, actor, existing);
      return this.assertCreateRetry(existing, parsed, actor);
    };
    try {
      return await this.serializable(async (tx) => {
        const result = await retry(tx);
        if (result) return result;
        const facilityId = await assertTaskFacility(tx, actor, parsed);
        if (parsed.facilityId && parsed.facilityId !== facilityId) throw new BadRequestException('Ô kho không thuộc cơ sở đã chọn.');
        const created = await tx.maintenanceRequest.create({
          data: {
            maintenanceCode: this.code(), storageUnitId: parsed.storageUnitId,
            commonAreaFacilityId: parsed.commonAreaFacilityId, commonArea: parsed.commonArea, locationNote: parsed.locationNote,
            source: 'MANUAL', category: parsed.category, priority: parsed.priority, rentalImpact: parsed.rentalImpact,
            reportedAffectedUnitIds: parsed.affectedUnitIds,
            description: parsed.description, reportedByUserId: actor.id, createIdempotencyKey: parsed.idempotencyKey,
            photos: { create: parsed.photos },
          },
          include: this.include(),
        });
        if (!parsed.affectedUnitIds.length) return this.toMaintenance(created, 'FACILITY_STAFF');
        await this.replaceBlocks(tx, created.id, facilityId, parsed.affectedUnitIds, actor, 'REPORT');
        const resultWithBlocks = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: created.id }, include: this.include() });
        return this.toMaintenance(resultWithBlocks, 'FACILITY_STAFF');
      }, 'Không thể gửi đồng thời báo cáo. Vui lòng thử lại.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const result = await this.prisma.$transaction(retry);
        if (result) return result;
      }
      throw error;
    }
  }

  private async transition(
    id: string,
    key: string | undefined,
    action: string,
    operation: (tx: Prisma.TransactionClient, current: any, safeKey: string) => Promise<any>,
    actor: PublicUser,
    role: 'FACILITY_STAFF' | 'FACILITY_MANAGER',
  ) {
    const managerAction = role === 'FACILITY_MANAGER';
    const permitted = managerAction ? actor.role === 'FACILITY_MANAGER' : actor.role === 'FACILITY_STAFF';
    if (!permitted) throw new ForbiddenException(managerAction ? 'Chỉ quản lý cơ sở được thực hiện thao tác này.' : 'Chỉ Staff được thực hiện thao tác này.');
    const safeKey = this.idempotencyKey(key);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MaintenanceRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.maintenanceRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy maintenance case.');
      await assertTaskFacility(tx,actor,current);
      if (current.activeKey && current.storageUnitId) {
        const units = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT "status" FROM "StorageUnit" WHERE "id" = ${current.storageUnitId} FOR UPDATE`);
        if (current.storageUnit && units[0]) Object.assign(current.storageUnit, { status: units[0].status });
      }
      if (role === 'FACILITY_STAFF' && current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ nhân viên được giao mới có thể xử lý bảo trì.');
      if (current.lastAction === action && current.lastActionIdempotencyKey === safeKey) return this.toMaintenance(current, role);
      const reused = await tx.maintenanceRequest.findUnique({ where: { lastActionIdempotencyKey: safeKey }, select: { id: true } });
      if (reused) throw new ConflictException('Idempotency-Key đã được dùng cho thao tác maintenance khác.');
      const updated = await operation(tx, current, safeKey);
      return this.toMaintenance(updated, role);
    }, 'Maintenance case vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.');
  }

  private async list(query: MaintenanceListQuery, mode: ViewMode, assignedStaffUserId: string|undefined, actor:PublicUser) {
    const search = query.search ? { contains: query.search, mode: 'insensitive' as const } : undefined;
    const where: Prisma.MaintenanceRequestWhereInput = {
      ...maintenanceFacilityScope(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(assignedStaffUserId && mode !== 'FACILITY_STAFF' ? { assignedStaffUserId } : {}),
      AND: [
        ...(assignedStaffUserId && mode === 'FACILITY_STAFF' ? [{ OR: [
          { assignedStaffUserId }, { source: 'MANUAL' as const, reportedByUserId: assignedStaffUserId },
          { evidenceSubmissions: { some: { staffUserId: assignedStaffUserId } } },
        ] }] : []),
        ...(search ? [{ OR: [
          { maintenanceCode: search },
          { description: search },
          { locationNote: search },
          { incidentBlocks: { some: { releasedAt: null, storageUnit: {
            storageType: { facility: facilityScope(actor) },
            unitNumber: search,
          } } } },
          { storageUnit: { is: { OR: [{ unitNumber: search }, { floor: search }, { zone: search }] } } },
        ] }] : []),
      ],
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: {
        ...this.include(mode === 'FACILITY_MANAGER'),
        ...(mode === 'FACILITY_STAFF' ? { evidenceSubmissions: { where: { staffUserId: actor.id }, select: { recordedAt: true, staffUserId: true } } } : {}),
      } }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toMaintenance(record, mode, undefined, false)) };
  }

  private include(managerImpact = false): Prisma.MaintenanceRequestInclude {
    return {
      commonAreaFacility: { select: { id: true, name: true } },
      incidentBlocks: {
        where: { releasedAt: null },
        select: { storageUnitId: true, storageUnit: { select: {
          unitNumber: true,
          ...(managerImpact ? { reservationUnits: {
            where: { releasedAt: null, plannedEndDate: { gt: businessToday() }, reservation: { status: 'CONFIRMED' } },
            select: affectedAllocationSelect,
          } } : {}),
        } } },
      },
      photos: { select: { id: true, digest: true }, orderBy: { position: 'asc' } },
      storageUnit: {
        include: {
          storageType: { include: { facility: { select: { id: true, name: true } } } },
          reservationUnits: {
            where: { releasedAt: null, reservation: { status: 'CONFIRMED' }, plannedStartDate: { gt: new Date() } },
            include: { reservation: { select: { id: true, reservationCode: true } } },
            orderBy: [{ plannedStartDate: 'asc' }, { id: 'asc' }],
          },
        },
      },
      reportedBy: { select: { id: true, fullName: true, role: true } },
      assignedStaff: { select: { id: true, fullName: true, role: true, accountStatus: true } },
      verifiedBy: { select: { id: true, fullName: true, role: true } },
      costConfirmedBy: { select: { fullName: true } },
      returnInspection: { include: { returnRequest: { select: { id: true, returnCode: true, assignedStaffUserId: true } } } },
    };
  }

  private toMaintenance(record: any, mode: ViewMode, staffDetailId?: string, includeAffectedDetails = true) {
    const future = (record.storageUnit?.reservationUnits ?? []).map((allocation: any) => ({
      reservationId: allocation.reservation.id,
      reservationReference: allocation.reservation.reservationCode,
      startDate: this.isoDate(allocation.plannedStartDate),
      endDate: this.isoDate(allocation.plannedEndDate),
    }));
    const base = {
      facility: record.commonAreaFacility ?? record.storageUnit?.storageType.facility,
      id: record.id, maintenanceCode: record.maintenanceCode, status: record.status, priority: record.priority, category: record.category,
      source: record.source, description: record.description, commonArea: record.commonArea, locationNote: record.locationNote,
      rentalImpact: record.rentalImpact,
      closedWithoutRepair: record.lastAction === 'CLOSE_WITHOUT_REPAIR',
      blocksUnit: Boolean(record.activeKey || record.incidentBlocks.length),
      legacyBookingHold: Boolean(record.activeKey),
      affectedUnits: record.incidentBlocks.map((block: { storageUnitId: string; storageUnit: { unitNumber: string } }) => ({
        id: block.storageUnitId, unitCode: block.storageUnit.unitNumber,
      })),
      photos: record.photos.map(({ id }: { id: string }) => ({ id })),
      unit: record.storageUnit ? {
        id: record.storageUnit.id, unitCode: record.storageUnit.unitNumber, status: record.storageUnit.status,
        floor: record.storageUnit.floor, zone: record.storageUnit.zone, row: record.storageUnit.row, position: record.storageUnit.position,
        storageType: { id: record.storageUnit.storageType.id, code: record.storageUnit.storageType.code, name: record.storageUnit.storageType.name },
      } : null,
      coordination: workPhase('maintenance', record),
      repairPlanReady: this.hasRepairPlan(record),
      reportedBy: record.reportedBy,
      ...(record.evidenceSubmissions ? { evidenceSubmissions: record.evidenceSubmissions } : {}),
      assignedStaff: record.assignedStaff, startedAt: record.startedAt?.toISOString() ?? null,
      workCompletedAt: record.workCompletedAt?.toISOString() ?? null, workNote: record.workNote,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    };
    const relatedReturn = record.returnInspection?.returnRequest;
    const repair = {
      surveyResult: record.surveyResult, method: record.repairMethod, plan: record.repairPlan,
    };
    const costs = {
      ...maintenanceCost(record), evidenceLinks: record.costEvidenceLinks ?? [],
      confirmedSubmissionIds: record.confirmedCostSubmissionIds ?? [],
      confirmedBy: record.costConfirmedBy?.fullName ?? null,
      confirmedAt: record.costConfirmedAt?.toISOString() ?? null,
    };
    if (mode === 'FACILITY_STAFF') return staffDetailId ? {
      ...base, verificationNote: record.verificationNote, verifiedBy: record.verifiedBy,
      ...(record.assignedStaffUserId === staffDetailId ? { repair, costs } : {}),
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      ...(relatedReturn?.assignedStaffUserId === staffDetailId
        ? { returnContext: { returnRequest: { id: relatedReturn.id, returnCode: relatedReturn.returnCode } } } : {}),
    } : base;
    const bookings = affectedBookings(record.incidentBlocks, base.facility?.id);
    return {
      ...base, repair, costs, verificationNote: record.verificationNote, verifiedBy: record.verifiedBy,
      affectedBookingCount: bookings.length,
      affectedAppointmentCount: bookings.reduce((count, booking) => count + booking.appointments.length, 0),
      ...(includeAffectedDetails ? { affectedBookings: bookings } : {}),
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      returnContext: record.returnInspection ? {
        inspectionId: record.returnInspection.id, result: record.returnInspection.result, issueType: record.returnInspection.issueType,
        conditionNote: record.returnInspection.conditionNote, issueNote: record.returnInspection.issueNote,
        returnRequest: { id: relatedReturn.id, returnCode: relatedReturn.returnCode },
      } : null,
      hasFutureAllocation: future.length > 0, nextConfirmedAllocation: future[0] ?? null, futureAllocations: future,
    };
  }

  private manualInput(input: Record<string, unknown>, key: string | undefined) {
    const storageUnitId = this.optionalText(input.storageUnitId, 100, 'Mã ô kho');
    const facilityId = this.optionalText(input.facilityId, 100, 'Mã cơ sở');
    const commonArea = this.optionalText(input.commonArea, 30, 'Khu vực chung');
    const locationNote = this.optionalText(input.locationNote, 500, 'Mô tả vị trí');
    if (storageUnitId ? commonArea || locationNote : !facilityId || !commonAreas.includes(commonArea as typeof commonAreas[number])) {
      throw new BadRequestException('Chọn một ô kho hoặc vị trí tại khu vực chung.');
    }
    if (commonArea === 'OTHER' && !locationNote) throw new BadRequestException('Mô tả vị trí khi chọn khu vực khác.');
    const commonAreaFacilityId = storageUnitId ? null : facilityId;
    const rentalImpact = (input.rentalImpact ?? 'UNKNOWN') as RentalImpact;
    if (!['NO_IMPACT', 'AFFECTED', 'UNKNOWN'].includes(rentalImpact)) throw new BadRequestException('Chọn mức ảnh hưởng đến khả năng cho thuê.');
    const scope = this.unitIds(input.affectedUnitIds);
    if (storageUnitId && scope.length) throw new BadRequestException('Phiếu ô kho chỉ áp dụng cho ô được báo.');
    if (rentalImpact === 'NO_IMPACT' && scope.length) throw new BadRequestException('Báo cáo không ảnh hưởng không được khóa ô kho.');
    const affectedUnitIds = rentalImpact === 'NO_IMPACT' ? [] : storageUnitId ? [storageUnitId] : scope;
    if (rentalImpact !== 'NO_IMPACT' && !affectedUnitIds.length) throw new BadRequestException('Chọn các ô có thể bị ảnh hưởng tại khu vực chung.');
    this.requiredText(input.description, 4000, 'description');
    const description = this.requiredText(appendEvidenceLink(input.description, input.evidenceLink), 4000, 'description');
    const category = input.category;
    const priority = input.priority ?? 'MEDIUM';
    if (!maintenanceCategories.includes(category as MaintenanceCategory)) throw new BadRequestException('Loại sự cố không hợp lệ.');
    if (!maintenancePriorities.includes(priority as MaintenancePriority)) throw new BadRequestException('Mức ưu tiên không hợp lệ.');
    return { storageUnitId, facilityId, commonAreaFacilityId, commonArea, locationNote, description, rentalImpact, affectedUnitIds, category: category as MaintenanceCategory, priority: priority as MaintenancePriority, idempotencyKey: this.idempotencyKey(key) };
  }

  private unitIds(value: unknown): string[] {
    let ids = value ?? [];
    if (typeof value === 'string') {
      try { ids = JSON.parse(value); }
      catch { throw new BadRequestException('Danh sách ô bị ảnh hưởng không hợp lệ.'); }
    }
    if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 100)) {
      throw new BadRequestException('Danh sách ô bị ảnh hưởng không hợp lệ.');
    }
    return [...new Set(ids as string[])].sort();
  }

  private assertCreateRetry(record: any, parsed: ReturnType<MaintenanceService['manualInput']> & { photos: ReturnType<typeof validateMaintenancePhotos> }, actor: PublicUser) {
    if (record.source !== 'MANUAL' || record.storageUnitId !== parsed.storageUnitId || record.commonAreaFacilityId !== parsed.commonAreaFacilityId
      || record.commonArea !== parsed.commonArea || record.locationNote !== parsed.locationNote || record.category !== parsed.category
      || record.description !== parsed.description || record.reportedByUserId !== actor.id
      || (record.rentalImpact ?? 'UNKNOWN') !== parsed.rentalImpact
      || (record.rentalImpact !== null && JSON.stringify(record.reportedAffectedUnitIds) !== JSON.stringify(parsed.affectedUnitIds))
      || (parsed.facilityId && parsed.facilityId !== (record.commonAreaFacilityId ?? record.storageUnit?.storageType.facility.id))
      || record.photos.length !== parsed.photos.length || parsed.photos.some((photo, index) => photo.digest !== record.photos[index].digest)) {
      throw new ConflictException('Idempotency-Key đã được dùng cho maintenance request khác.');
    }
    return this.toMaintenance(record, actor.role === 'FACILITY_STAFF' ? 'FACILITY_STAFF' : 'FACILITY_MANAGER');
  }

  private assertUnresolved(record: any) {
    if (!unresolvedStatuses.includes(record.status)) throw new ConflictException('Maintenance đã hoàn tất và không thể thay đổi.');
  }

  private hasRepairPlan(record: RepairPlanFields) {
    return Boolean(record.surveyResult?.trim() && record.repairPlan?.trim()
      && (record.repairMethod === 'INTERNAL' || record.repairMethod === 'EXTERNAL'));
  }

  private assertRepairPlan(record: RepairPlanFields) {
    if (!this.hasRepairPlan(record)) throw new ConflictException({
      code: 'MAINTENANCE_REPAIR_PLAN_REQUIRED',
      message: 'Vui lòng hoàn thành khảo sát và lưu phương án xử lý trước khi tiếp tục.',
    });
  }

  private assertRepairReadyForReview(record: RepairPlanFields & Pick<MaintenanceRequest, 'workCompletedAt' | 'workNote'>) {
    this.assertRepairPlan(record);
    if (!record.workCompletedAt || !record.workNote?.trim()) throw new ConflictException('Cần có kết quả sửa chữa do Staff gửi.');
  }

  private assertUnitMaintenance(record: any) {
    if (!record.activeKey || !record.storageUnit) return;
    if (record.storageUnit.status === 'MAINTENANCE') return;
    if (record.source === 'MANUAL' && ['AVAILABLE', 'OCCUPIED', 'RESERVED'].includes(record.storageUnit.status)) return;
    throw new ConflictException('Trạng thái kho đã thay đổi. Kiểm tra lại hồ sơ bảo trì.');
  }

  private async identity(id: string) {
    const record = await this.prisma.maintenanceRequest.findFirst({ where: { OR: [{ id }, { maintenanceCode: id }] }, select: { id: true } });
    if (!record) throw new NotFoundException('Không tìm thấy maintenance case.');
    return record;
  }

  private activeKey(unitId: string) { return `MAINTENANCE:${unitId}`; }
  private code() { return `WDP-MNT-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`; }
  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }

  private requiredText(value: unknown, maximum: number, label: string) {
    if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > maximum) throw new BadRequestException(`${label} phải dài từ 3–${maximum} ký tự.`);
    return value.trim();
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim() || null;
  }

  private idempotencyKey(value: string | undefined) {
    const key = value?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return key;
  }

  private isPrismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        const meta = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' ? error.meta : undefined;
        const adapter = meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
        const sqlState = adapter?.cause?.originalCode ?? meta?.code;
        const conflict = this.isPrismaCode(error, 'P2034') || sqlState === '40001' || sqlState === '40P01';
        if (conflict && attempt < 2) continue;
        if (conflict) throw new ConflictException(message);
        throw error;
      }
    }
    throw new ConflictException(message);
  }
}
