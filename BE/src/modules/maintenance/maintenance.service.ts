import { recordTaskEvent } from '../dispatch/task-exception.js';
import { assertCanStartDirectWork, workPhase } from '../dispatch/work-phase.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import { appendEvidenceLink } from '../facility-access/operational-evidence.js';
import { businessToday } from '../../business-date.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertAssignmentVersion, physicalHandoff } from '../facility-access/operational-assignment.js';
import { assertTaskFacility, facilityScope } from '../facility-access/task-access.js';
import { assertAssignmentAccess } from '../facility-access/facility-access.service.js';
import { validateMaintenancePhotos, type MaintenanceUpload } from './maintenance-photo.js';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'COMPLETED';
export const maintenancePriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const maintenanceCategories = ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'ACCESS_CREDENTIAL', 'FACILITY_EQUIPMENT', 'UTILITIES', 'SECURITY', 'OTHER'] as const;
const commonAreas = ['CORRIDOR', 'ENTRANCE', 'SECURITY', 'UTILITIES', 'OTHER'] as const;
type MaintenancePriority = typeof maintenancePriorities[number];
type MaintenanceCategory = typeof maintenanceCategories[number];
type RentalImpact = 'NO_IMPACT' | 'AFFECTED' | 'UNKNOWN';
type ViewMode = 'FACILITY_STAFF' | 'FACILITY_MANAGER';

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
    const record = await this.prisma.maintenanceRequest.findFirst({ where: this.detailScope(id, actor), include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu bảo trì.');
    return this.toMaintenance(record, 'FACILITY_STAFF', actor.id);
  }

  async getManager(id: string, actor:PublicUser) {
    managerReservationScope(actor);

    const record = await this.prisma.maintenanceRequest.findFirst({ where: this.detailScope(id, actor), include: this.include(true) });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu bảo trì.');
    return this.toMaintenance(record, 'FACILITY_MANAGER');
  }

  private detailScope(id: string, actor: PublicUser): Prisma.MaintenanceRequestWhereInput {
    return { AND: [
      { OR: [{ id }, { maintenanceCode: id }] },
      maintenanceFacilityScope(actor),
      ...(actor.role === 'FACILITY_STAFF' ? [{ OR: [
        { assignedStaffUserId: actor.id },
        { source: 'MANUAL' as const, reportedByUserId: actor.id },
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

  assign(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const staffUserId = this.requiredText(input.staffUserId, 100, 'staffUserId');
    return this.transition(id, key, 'ASSIGN', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      const staff = await assertAssignmentAccess(tx, actor, staffUserId, current);
      if (!staff || staff.role !== 'FACILITY_STAFF' || staff.accountStatus !== 'ACTIVE') throw new BadRequestException('Chỉ giao bảo trì cho nhân viên đang hoạt động.');
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
      this.assertUnitMaintenance(current);
      await assertCanStartDirectWork(tx, actor.id, 'maintenance', current.id);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), lastAction: 'START', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_STAFF');
  }

  completeWork(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    this.requiredText(input.workNote, 4000, 'workNote');
    const workNote = this.requiredText(appendEvidenceLink(input.workNote, input.evidenceLink), 4000, 'workNote');
    return this.transition(id, key, 'COMPLETE_WORK', async (tx, current, safeKey) => {
      if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ Staff được hoàn tất công việc được giao.');
      if (current.status !== 'IN_PROGRESS') throw new ConflictException(`Chỉ maintenance IN_PROGRESS mới có thể gửi xác minh; trạng thái hiện tại là ${current.status}.`);
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới có thể hoàn tất công việc này.');
      this.assertUnitMaintenance(current);
      const facilityId = current.commonAreaFacilityId ?? current.storageUnit?.storageType.facility.id;
      await recordTaskEvent(tx, actor, 'TASK_STAFF_COMPLETED', 'maintenance', current.id,
        { ...(facilityId && { facilityId }), nextStatus: 'AWAITING_VERIFICATION' });
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'AWAITING_VERIFICATION', workCompletedAt: new Date(), workNote, lastAction: 'COMPLETE_WORK', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'FACILITY_STAFF');
  }

  verify(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.optionalText(input?.note, 4000, 'note');
    return this.transition(id, key, 'VERIFY', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể xác minh; trạng thái hiện tại là ${current.status}.`);
      this.assertUnitMaintenance(current);
      await this.replaceBlocks(tx, current.id, current.commonAreaFacilityId ?? current.storageUnit?.storageType.facility.id, [], actor, 'VERIFIED');
      await this.auditIncident(tx, actor, current.id, 'INCIDENT_VERIFIED', { note });
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
          lastAction: 'VERIFY', lastActionIdempotencyKey: safeKey,
        },
        include: this.include(),
      });
    }, actor, 'FACILITY_MANAGER');
  }

  rejectVerification(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.requiredText(input.note, 4000, 'note');
    return this.transition(id, key, 'REJECT_VERIFICATION', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể bị trả lại; trạng thái hiện tại là ${current.status}.`);
      this.assertUnitMaintenance(current);
      await this.auditIncident(tx, actor, current.id, 'INCIDENT_VERIFICATION_REJECTED', { note });
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
    const where: Prisma.MaintenanceRequestWhereInput = {
      ...maintenanceFacilityScope(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(assignedStaffUserId ? { assignedStaffUserId } : {}),
      ...(query.search ? { AND: [{ OR: [
        { maintenanceCode: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { locationNote: { contains: query.search, mode: 'insensitive' } },
        { incidentBlocks: { some: { releasedAt: null, storageUnit: {
          storageType: { facility: facilityScope(actor) },
          unitNumber: { contains: query.search, mode: 'insensitive' },
        } } } },
        { storageUnit: { is: { OR: [
          { unitNumber: { contains: query.search, mode: 'insensitive' } },
          { floor: { contains: query.search, mode: 'insensitive' } },
          { zone: { contains: query.search, mode: 'insensitive' } },
        ] } } },
      ] }] } : {}),
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include(mode === 'FACILITY_MANAGER') }),
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
      assignedStaff: record.assignedStaff, startedAt: record.startedAt?.toISOString() ?? null,
      workCompletedAt: record.workCompletedAt?.toISOString() ?? null, workNote: record.workNote,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    };
    const relatedReturn = record.returnInspection?.returnRequest;
    if (mode === 'FACILITY_STAFF') return staffDetailId ? {
      ...base, verificationNote: record.verificationNote, verifiedBy: record.verifiedBy,
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      ...(relatedReturn?.assignedStaffUserId === staffDetailId
        ? { returnContext: { returnRequest: { id: relatedReturn.id, returnCode: relatedReturn.returnCode } } } : {}),
    } : base;
    const bookings = affectedBookings(record.incidentBlocks, base.facility?.id);
    return {
      ...base, reportedBy: record.reportedBy, verificationNote: record.verificationNote, verifiedBy: record.verifiedBy,
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
        if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue;
        if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(message);
        throw error;
      }
    }
    throw new ConflictException(message);
  }
}
