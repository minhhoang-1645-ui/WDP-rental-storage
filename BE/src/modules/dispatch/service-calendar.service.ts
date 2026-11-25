import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFacility, facilityIds } from '../facility-access/facility-access.service.js';

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
    const [appointments, transfers, returns] = await Promise.all([
      this.prisma.handoverAppointment.findMany({ where: { reservation, scheduledAt: range },
        select: { id: true, appointmentCode: true, status: true, scheduledAt: true, assignedStaff: { select: { fullName: true } } } }),
      this.prisma.transferRequest.findMany({ where: { reservation, supportRequest: { transferRequestedStartAt: range } },
        select: { id: true, transferCode: true, status: true, assignedStaff: { select: { fullName: true } }, supportRequest: { select: { transferRequestedStartAt: true } } } }),
      this.prisma.returnRequest.findMany({ where: { reservation, inspectionScheduledAt: range },
        select: { id: true, returnCode: true, status: true, inspectionScheduledAt: true, assignedStaff: { select: { fullName: true } } } }),
    ]);
    return { items: [
      ...appointments.map(row => ({ ...row, type: 'appointments', code: row.appointmentCode, proposed: false })),
      ...transfers.map(row => ({
        id: row.id, type: 'transfers', code: row.transferCode, scheduledAt: row.supportRequest!.transferRequestedStartAt!,
        status: row.status, assignedStaff: row.assignedStaff, proposed: true,
      })),
      ...returns.map(row => ({ ...row, type: 'returns', code: row.returnCode, scheduledAt: row.inspectionScheduledAt!, proposed: false })),
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
      const row = await tx.returnRequest.findUnique({ where: { id }, include: { reservation: { select: { facilityId: true } } } });
      if (!row) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      const { facilityId } = row.reservation;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      await assertFacility(tx, actor, facilityId);
      if (row.status !== 'REQUESTED' || row.inspectionStartedAt
        || (row.inspectionScheduledAt?.getTime() ?? null) !== (expected?.getTime() ?? null)) throw new ConflictException('Lịch kiểm tra đã thay đổi hoặc việc kiểm tra đã bắt đầu.');
      if (time && time <= new Date()) throw new BadRequestException('Chọn giờ kiểm tra trong tương lai.');
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
