import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFacility, facilityIds } from '../facility-access/facility-access.service.js';
import { reservationScope, returnTaskScope, taskFacilityId, transferTaskScope } from '../facility-access/task-access.js';
import { assessHandoverWindow, readServiceSchedule, serviceWindow } from './service-schedule.js';
import { allowsCustomerAccess, hourSpans } from '../operations/facility-hours.js';
import { readUnitHandoverDraft } from '../appointments/handover-report.js';
import { transferWork } from './work-phase.js';

const calendarAssignee = { select: { id: true, fullName: true } } as const;
const calendarReservation = { reservationCode: true, customer: { select: { fullName: true } } } as const;
const calendarUnit = { select: { unitNumber: true, storageType: { select: { name: true } } } } as const;

function instant(value: unknown) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('Thời gian cần có ngày, giờ và múi giờ.');
  const date = new Date(value);
  if (!Number.isFinite(+date)) throw new BadRequestException('Thời gian không hợp lệ.');
  return date;
}

@Injectable()
export class ServiceCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async staffAgenda(actor: PublicUser, from: unknown, to: unknown) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException();
    const range = { gte: instant(from), lt: instant(to) };
    if (+range.lt <= +range.gte || +range.lt - +range.gte > 7 * 86_400_000) {
      throw new BadRequestException('Chọn khoảng lịch tối đa 7 ngày.');
    }
    const [facilityId] = await facilityIds(this.prisma, actor);
    if (!facilityId) throw new ForbiddenException('Cần được cấp quyền tại một cơ sở.');
    const localUnit = { storageUnit: { storageType: { facilityId } } };
    const [appointments, returns, transfers] = await Promise.all([
      this.prisma.handoverAppointment.findMany({
        where: { reservation: { facilityId, ...reservationScope(actor) }, scheduledAt: range },
        select: { id: true, appointmentCode: true, scheduledAt: true, completedAt: true, cancelledAt: true,
          status: true, handoverReport: true, assignedStaff: calendarAssignee,
          reservation: { select: { ...calendarReservation, units: { where: localUnit,
            select: { storageUnit: calendarUnit, createdAt: true, releasedAt: true } } } } },
      }),
      this.prisma.returnRequest.findMany({
        where: { ...returnTaskScope(actor), inspectionScheduledAt: range, AND: [{ OR: [
          { inspections: { some: localUnit } },
          { inspections: { none: {} }, reservation: { facilityId } },
        ] }] },
        select: { id: true, returnCode: true, status: true, inspectionScheduledAt: true,
          assignedStaff: calendarAssignee, reservation: { select: calendarReservation },
          inspections: { where: localUnit, select: { storageUnit: calendarUnit } } },
      }),
      this.prisma.transferRequest.findMany({
        where: { ...transferTaskScope(actor), AND: [{ fromStorageUnit: { storageType: { facilityId } } }],
          supportRequest: { transferRequestedStartAt: range } },
        select: { id: true, transferCode: true, status: true, assignedStaff: calendarAssignee,
          sourceHandover: true, handoverReport: true, commercialSnapshot: true, customerAcceptedAt: true,
          reservation: { select: calendarReservation }, supportRequest: { select: { transferRequestedStartAt: true } },
          fromStorageUnit: calendarUnit, toStorageUnit: calendarUnit },
      }),
    ]);
    function identity(row: { assignedStaff: { id: string; fullName: string } | null;
      reservation: { reservationCode: string; customer: { fullName: string } } }) {
      const mine = row.assignedStaff?.id === actor.id;
      const name = row.reservation.customer.fullName;
      return { reference: row.reservation.reservationCode,
        customer: mine ? name : name.trim().split(/\s+/).map(part => Array.from(part)[0]).join('.'),
        assignee: row.assignedStaff?.fullName ?? null,
        ownership: mine ? 'mine' : row.assignedStaff ? 'other' : 'unassigned' };
    }
    return { facilityId, items: [
      ...appointments.map(row => {
        const closedAt = row.status === 'COMPLETED' ? row.completedAt ?? row.scheduledAt
          : row.status === 'CANCELLED' ? row.cancelledAt ?? row.scheduledAt : null;
        return { ...identity(row), kind: 'appointments', id: row.id, code: row.appointmentCode,
          status: row.status, scheduledAt: row.scheduledAt,
          inProgress: row.status === 'CONFIRMED' && readUnitHandoverDraft(row.handoverReport).unitProgress.length > 0,
          units: row.reservation.units.filter(unit => closedAt
            ? unit.createdAt <= closedAt && (!unit.releasedAt || unit.releasedAt >= closedAt)
            : !unit.releasedAt).map(unit => unit.storageUnit) };
      }),
      ...returns.map(row => ({ ...identity(row), kind: 'returns', id: row.id, code: row.returnCode,
        status: row.status, scheduledAt: row.inspectionScheduledAt!, inProgress: row.status === 'INSPECTION_IN_PROGRESS',
        units: row.inspections.map(inspection => inspection.storageUnit) })),
      ...transfers.map(row => ({ ...identity(row), kind: 'transfers', id: row.id, code: row.transferCode,
        status: row.status, scheduledAt: row.supportRequest!.transferRequestedStartAt!,
        inProgress: row.status === 'APPROVED' && (Boolean(row.sourceHandover) || transferWork(row).handoverStarted),
        units: row.toStorageUnit ? [row.fromStorageUnit, row.toStorageUnit] : [row.fromStorageUnit] })),
    ].sort((a, b) => +a.scheduledAt - +b.scheduledAt || a.code.localeCompare(b.code)) };
  }

  async agenda(actor: PublicUser, from: unknown, to: unknown) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const range = { gte: instant(from), lt: instant(to) };
    if (range.gte >= range.lt) throw new BadRequestException('Khoảng ngày không hợp lệ.');
    const ids = await facilityIds(this.prisma, actor);
    const reservation = { facilityId: { in: ids } };
    const [appointments, transfers, returns, facilities] = await Promise.all([
      this.prisma.handoverAppointment.findMany({ where: { reservation, scheduledAt: range },
        select: { id: true, appointmentCode: true, status: true, scheduledAt: true,
          reservation: { select: { facilityId: true } }, assignedStaff: { select: { fullName: true } } } }),
      this.prisma.transferRequest.findMany({ where: { ...transferTaskScope(actor), supportRequest: { transferRequestedStartAt: range } },
        select: { id: true, transferCode: true, status: true, assignedStaff: { select: { fullName: true } }, supportRequest: { select: { transferRequestedStartAt: true } } } }),
      this.prisma.returnRequest.findMany({ where: { ...returnTaskScope(actor), inspectionScheduledAt: range },
        select: { id: true, returnCode: true, status: true, inspectionScheduledAt: true,
          reservation: { select: { facilityId: true } }, assignedStaff: { select: { fullName: true } },
          inspections: { take: 1, select: { storageUnit: { select: { storageType: { select: { facilityId: true } } } } } } } }),
      this.prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, serviceSchedule: true, accessHours: true } }),
    ]);
    const schedules = new Map(facilities.map(row => [row.id, {
      windows: readServiceSchedule(row.serviceSchedule), access: hourSpans(row.accessHours),
    }]));
    const booked = [
      ...appointments.filter(row => ['CONFIRMED', 'COMPLETED'].includes(row.status)).map(row => ({
        ...row, facilityId: row.reservation.facilityId, active: row.status === 'CONFIRMED',
      })),
      ...returns.map(row => ({
        ...row, scheduledAt: row.inspectionScheduledAt!, facilityId: row.inspections[0]?.storageUnit.storageType.facilityId ?? row.reservation.facilityId,
        active: row.status === 'REQUESTED',
      })),
    ].map(row => ({ ...row, window: serviceWindow(schedules.get(row.facilityId)?.windows ?? [], row.scheduledAt) }));
    const totals = new Map<string, number>();
    const key = (facilityId: string, start: Date) => facilityId + ':' + +start;
    for (const row of booked) if (row.window) {
      const k = key(row.facilityId, row.window.start);
      totals.set(k, (totals.get(k) ?? 0) + 1);
    }
    const warnings = new Map<string, string>();
    const now = new Date();
    for (const row of booked) {
      if (!row.active || row.scheduledAt < now) continue;
      const schedule = schedules.get(row.facilityId);
      if (schedule?.windows.length && !row.window) warnings.set(row.id, 'Ngoài khung phục vụ hiện tại');
      else if (schedule && !schedule.windows.length && !allowsCustomerAccess(schedule.access, row.scheduledAt))
        warnings.set(row.id, 'Kiểm tra lại giờ khách truy cập kho');
      else if (row.window && (totals.get(key(row.facilityId, row.window.start)) ?? 0) > row.window.capacity) warnings.set(row.id, 'Khung giờ vượt sức chứa hiện tại');
    }
    return { items: [
      ...appointments.map(row => ({ id: row.id, status: row.status, scheduledAt: row.scheduledAt, assignedStaff: row.assignedStaff,
        type: 'appointments', code: row.appointmentCode, proposed: false, warning: warnings.get(row.id) })),
      ...transfers.map(row => ({
        id: row.id, type: 'transfers', code: row.transferCode, scheduledAt: row.supportRequest!.transferRequestedStartAt!,
        status: row.status, assignedStaff: row.assignedStaff, proposed: true,
      })),
      ...returns.map(row => ({ id: row.id, status: row.status, assignedStaff: row.assignedStaff,
        type: 'returns', code: row.returnCode, scheduledAt: row.inspectionScheduledAt!, proposed: false, warning: warnings.get(row.id) })),
    ].sort((a, b) => +a.scheduledAt - +b.scheduledAt || a.id.localeCompare(b.id)) };
  }

  planReturn(actor: PublicUser, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const time = input.scheduledAt === null ? null : instant(input.scheduledAt);
    const expected = input.expectedScheduledAt === null ? null : instant(input.expectedScheduledAt);
    const note = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!note || note.length > 500) throw new BadRequestException('Nhập lý do đổi lịch.');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${id} FOR UPDATE`;
      const row = await tx.returnRequest.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      const facilityId = await taskFacilityId(tx, { returnRequestId: id });
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      await assertFacility(tx, actor, facilityId);
      if (row.status !== 'REQUESTED' || row.inspectionStartedAt
        || (row.inspectionScheduledAt?.getTime() ?? null) !== (expected?.getTime() ?? null)) throw new ConflictException('Lịch kiểm tra đã thay đổi hoặc việc kiểm tra đã bắt đầu.');
      if (time && time <= new Date()) throw new BadRequestException('Chọn giờ kiểm tra trong tương lai.');
      if (time) {
        const decision = await assessHandoverWindow(tx, facilityId, time, { returnId: id });
        if (decision !== 'CONFIRMED' && decision !== 'MANAGER_CONFIRMATION_REQUIRED') {
          throw new ConflictException('Chọn giờ phục vụ còn chỗ.');
        }
      }
      const updated = await tx.returnRequest.update({ where: { id }, data: { inspectionScheduledAt: time }, select: { inspectionScheduledAt: true } });
      await tx.auditEvent.create({ data: {
        category: 'ACTIVITY', action: 'RETURN_INSPECTION_SCHEDULE', resource: 'returns', resourceId: id,
        route: '/manager/service-calendar/returns/:id', method: 'PATCH', outcome: 'SUCCESS', httpStatus: 200,
        actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role,
        metadata: { facilityId, before: expected?.toISOString() ?? null, after: time?.toISOString() ?? null, note },
      } });
      return updated;
    });
  }
}
