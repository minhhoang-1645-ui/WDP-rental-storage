import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFacility, facilityIds } from '../facility-access/facility-access.service.js';
import { returnTaskScope, taskFacilityId, transferTaskScope } from '../facility-access/task-access.js';
import { assessHandoverWindow, readServiceSchedule, serviceWindow } from './service-schedule.js';

function instant(value: unknown) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('Thời gian cần có ngày, giờ và múi giờ.');
  const date = new Date(value);
  if (!Number.isFinite(+date)) throw new BadRequestException('Thời gian không hợp lệ.');
  return date;
}

@Injectable()
export class ServiceCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async agenda(actor: PublicUser, from: unknown, to: unknown) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const range = { gte: instant(from), lt: instant(to) };
    if (range.gte >= range.lt) throw new BadRequestException('Khoảng ngày không hợp lệ.');
    const ids = await facilityIds(this.prisma, actor);
    const reservation = { facilityId: { in: ids } };
    const [appointments, transfers, returns, facilities, shifts] = await Promise.all([
      this.prisma.handoverAppointment.findMany({ where: { reservation, scheduledAt: range },
        select: { id: true, appointmentCode: true, status: true, scheduledAt: true, assignedStaffUserId: true,
          reservation: { select: { facilityId: true } }, assignedStaff: { select: { fullName: true } } } }),
      this.prisma.transferRequest.findMany({ where: { ...transferTaskScope(actor), supportRequest: { transferRequestedStartAt: range } },
        select: { id: true, transferCode: true, status: true, assignedStaff: { select: { fullName: true } }, supportRequest: { select: { transferRequestedStartAt: true } } } }),
      this.prisma.returnRequest.findMany({ where: { ...returnTaskScope(actor), inspectionScheduledAt: range },
        select: { id: true, returnCode: true, status: true, inspectionScheduledAt: true, assignedStaffUserId: true,
          reservation: { select: { facilityId: true } }, assignedStaff: { select: { fullName: true } },
          inspections: { take: 1, select: { storageUnit: { select: { storageType: { select: { facilityId: true } } } } } } } }),
      this.prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, serviceSchedule: true } }),
      this.prisma.staffShift.findMany({ where: { facilityId: { in: ids }, status: 'SCHEDULED', startsAt: { lt: range.lt }, endsAt: { gt: range.gte },
        staff: { role: 'FACILITY_STAFF', accountStatus: 'ACTIVE' } },
        select: { facilityId: true, staffUserId: true, startsAt: true, endsAt: true, checkedOutAt: true,
          staff: { select: { facilityAccess: { where: { revokedAt: null, facilityId: { in: ids } }, select: { facilityId: true } } } } } }),
    ]);
    const windows = new Map(facilities.map(row => [row.id, readServiceSchedule(row.serviceSchedule)]));
    const booked = [
      ...appointments.filter(row => ['CONFIRMED', 'COMPLETED'].includes(row.status)).map(row => ({
        ...row, facilityId: row.reservation.facilityId, active: row.status === 'CONFIRMED',
      })),
      ...returns.map(row => ({
        ...row, scheduledAt: row.inspectionScheduledAt!, facilityId: row.inspections[0]?.storageUnit.storageType.facilityId ?? row.reservation.facilityId,
        active: row.status === 'REQUESTED',
      })),
    ].map(row => ({ ...row, window: serviceWindow(windows.get(row.facilityId) ?? [], row.scheduledAt) }));
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
      if (!row.window) warnings.set(row.id, 'Ngoài khung phục vụ hiện tại');
      else if ((totals.get(key(row.facilityId, row.window.start)) ?? 0) > row.window.capacity) warnings.set(row.id, 'Khung giờ vượt sức chứa hiện tại');
      else if (!shifts.some(shift => shift.facilityId === row.facilityId && (!row.assignedStaffUserId || row.assignedStaffUserId === shift.staffUserId)
        && shift.staff.facilityAccess.some(access => access.facilityId === row.facilityId)
        && shift.startsAt <= row.scheduledAt && row.scheduledAt < shift.endsAt && (!shift.checkedOutAt || row.scheduledAt < shift.checkedOutAt))) {
        warnings.set(row.id, row.assignedStaffUserId ? 'Staff được giao không còn ca phù hợp' : 'Chưa có ca phù hợp');
      }
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
      if (time && await assessHandoverWindow(tx, facilityId, time, { returnId: id }) !== 'CONFIRMED') {
        throw new ConflictException('Chọn giờ phục vụ còn chỗ và có ca làm phù hợp.');
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
