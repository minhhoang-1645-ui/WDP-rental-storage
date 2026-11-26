import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, StaffShift } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertAssignmentAccess, assertFacility, facilityIds } from '../facility-access/facility-access.service.js';
import { affectedWork } from './shift-impact.js';
import { staffDirectWork } from './work-phase.js';

type Db = Prisma.TransactionClient;
const details = {
  staff: { select: { id: true, fullName: true } },
  facility: { select: { id: true, name: true } },
} satisfies Prisma.StaffShiftInclude;

const parseInstant = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('Thời gian cần có ngày, giờ và múi giờ.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException('Thời gian không hợp lệ.');
  return date;
};

const readId = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new BadRequestException('Chọn cơ sở và nhân viên.');
  return value.trim();
};

function range(from: unknown, to: unknown) {
  const start = parseInstant(from);
  const end = parseInstant(to);
  if (start >= end) throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
  return [start, end] as const;
}

@Injectable()
export class StaffShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: PublicUser, from: unknown, to: unknown, facilityId?: string) {
    const [startsAt, endsAt] = range(from, to);
    const allowed = await facilityIds(this.prisma, actor);
    if (facilityId) await assertFacility(this.prisma, actor, facilityId);
    const now = new Date();
    const items = await this.prisma.staffShift.findMany({
      where: {
        facilityId: facilityId || { in: allowed },
        ...(actor.role === 'FACILITY_STAFF' ? { staffUserId: actor.id } : {}),
        startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      },
      include: { ...details, staff: { select: { ...details.staff.select, role: true, accountStatus: true,
        facilityAccess: { where: { revokedAt: null }, select: { facilityId: true } } } } },
      orderBy: [{ startsAt: 'asc' }, { staffUserId: 'asc' }, { id: 'asc' }],
    });
    return {
      serverTime: now,
      items: await Promise.all(items.map(async item => {
        const attendance = item.status !== 'SCHEDULED' ? item.status : item.checkedOutAt ? 'CHECKED_OUT'
          : item.endsAt <= now ? 'ENDED' : !item.checkedInAt ? 'NOT_CHECKED_IN' : item.breakStartedAt ? 'ON_BREAK' : 'PRESENT';
        const authorized = item.staff.role === 'FACILITY_STAFF' && item.staff.accountStatus === 'ACTIVE'
          && item.staff.facilityAccess.some(grant => grant.facilityId === item.facilityId);
        const work = authorized && attendance === 'PRESENT' ? await staffDirectWork(this.prisma, item.staffUserId, now) : [];
        return { ...item, staff: { id: item.staff.id, fullName: item.staff.fullName }, attendance,
          availability: !authorized ? 'UNAVAILABLE' : attendance === 'PRESENT' ? work.length ? 'BUSY' : 'AVAILABLE' : attendance,
          pendingHandover: actor.role === 'FACILITY_MANAGER' && (!authorized || ['ENDED', 'CHECKED_OUT', 'ON_LEAVE', 'ABSENT'].includes(attendance))
            ? await affectedWork(this.prisma, item) : [] };
      })),
    };
  }

  plan(actor: PublicUser, input: Record<string, unknown>, id?: string) {
    const facilityId = readId(input.facilityId);
    const staffUserId = readId(input.staffUserId);
    const [startsAt, endsAt] = range(input.startsAt, input.endsAt);
    return this.prisma.$transaction(async tx => {
      // Shift writes and attendance serialize on the same User rows across facilities.
      const before = id ? await this.find(tx, id) : undefined;
      await this.lockUsers(tx, [actor.id, staffUserId, ...(before ? [before.staffUserId] : [])]);
      const current = id ? await this.find(tx, id) : undefined;
      if (current) {
        await assertFacility(tx, actor, current.facilityId);
        this.checkRevision(current, input.revision);
        if (current.facilityId !== facilityId) throw new BadRequestException('Không thể chuyển ca sang cơ sở khác.');
        if (current.status !== 'SCHEDULED' || current.checkedInAt || current.endsAt <= new Date()) throw new ConflictException('Ca này không còn chỉnh sửa được.');
      }
      await assertAssignmentAccess(tx, actor, staffUserId, { commonAreaFacilityId: facilityId });
      if (endsAt <= new Date()) throw new BadRequestException('Không thể xếp ca đã kết thúc.');
      const conflict = await tx.staffShift.findFirst({ where: {
        staffUserId, status: 'SCHEDULED', id: id ? { not: id } : undefined,
        startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      }, select: { id: true } });
      if (conflict) throw new ConflictException('Nhân viên đã có ca trùng giờ.');
      const data = { facilityId, staffUserId, startsAt, endsAt };
      const updated = current
        ? await tx.staffShift.update({ where: { id: current.id }, data: { ...data, revision: { increment: 1 } }, include: details })
        : await tx.staffShift.create({ data, include: details });
      const affected = current && (current.staffUserId !== staffUserId || +current.startsAt !== +startsAt || +current.endsAt !== +endsAt)
        ? await affectedWork(tx, current, updated) : [];
      await this.audit(tx, actor, current ? 'CHANGE_SHIFT' : 'CREATE_SHIFT', updated, current, affected.map(item => item.id));
      return { shift: updated, affected };
    });
  }

  mark(actor: PublicUser, id: string, input: Record<string, unknown>) {
    const status = input.status;
    if (status !== 'CANCELLED' && status !== 'ON_LEAVE' && status !== 'ABSENT') throw new BadRequestException('Chọn cách ghi nhận ca.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 500) throw new BadRequestException('Nhập lý do từ 1 đến 500 ký tự.');
    return this.prisma.$transaction(async tx => {
      const before = await this.find(tx, id);
      await this.lockUsers(tx, [actor.id, before.staffUserId]);
      const current = await this.find(tx, id);
      await assertFacility(tx, actor, current.facilityId);
      this.checkRevision(current, input.revision);
      if (current.status !== 'SCHEDULED' || current.checkedOutAt) throw new ConflictException('Ca này đã được ghi nhận.');
      if (status === 'CANCELLED' && (current.checkedInAt || current.endsAt <= new Date())) throw new ConflictException('Chỉ hủy ca chưa xác nhận vào làm và chưa hết giờ.');
      if (status === 'ABSENT' && current.startsAt > new Date()) throw new ConflictException('Chưa đến giờ bắt đầu ca.');
      if (status === 'ABSENT' && current.checkedInAt) throw new ConflictException('Nhân viên đã xác nhận vào ca.');
      const updated = await tx.staffShift.update({
        where: { id }, data: {
          status, reason, revision: { increment: 1 },
          ...(current.checkedInAt ? { checkedOutAt: new Date(), breakStartedAt: null } : {}),
        }, include: details,
      });
      const affected = await affectedWork(tx, current);
      await this.audit(tx, actor, 'CHANGE_SHIFT_STATUS', updated, current, affected.map(item => item.id));
      return { shift: updated, affected };
    });
  }

  attend(actor: PublicUser, id: string, action: 'CHECK_IN' | 'CHECK_OUT' | 'START_BREAK' | 'END_BREAK', revision?: unknown) {
    return this.prisma.$transaction(async tx => {
      await this.lockUsers(tx, [actor.id]);
      const current = await this.find(tx, id);
      if (current.staffUserId !== actor.id) throw new NotFoundException('Không tìm thấy ca làm.');
      await assertFacility(tx, actor, current.facilityId);
      if (action === 'CHECK_IN' && current.checkedInAt || action === 'CHECK_OUT' && current.checkedOutAt) return current;
      const now = new Date();
      if (current.status !== 'SCHEDULED') throw new ConflictException('Ca này không còn hiệu lực.');
      if (action === 'CHECK_IN') {
        if (now < current.startsAt || now >= current.endsAt) throw new ConflictException('Chỉ xác nhận vào làm trong khung giờ của ca.');
        const active = await tx.staffShift.findFirst({ where: {
          staffUserId: actor.id, status: 'SCHEDULED', id: { not: id },
          checkedInAt: { not: null }, checkedOutAt: null, endsAt: { gt: now },
        }, select: { id: true } });
        if (active) throw new ConflictException('Bạn đang có ca làm chưa kết thúc.');
      } else if (!current.checkedInAt) throw new ConflictException('Bạn chưa xác nhận vào ca này.');
      if (action === 'START_BREAK' || action === 'END_BREAK') {
        if (current.checkedOutAt || now >= current.endsAt) throw new ConflictException('Ca này đã kết thúc.');
        if ((action === 'START_BREAK') === Boolean(current.breakStartedAt)) return current;
        if (revision !== undefined) this.checkRevision(current, revision);
        if (action === 'START_BREAK' && (await staffDirectWork(tx, actor.id, now)).some(task => task.phase === 'IN_PROGRESS'
          && ['appointments', 'transfers', 'returns', 'maintenance', 'damage-claims'].includes(task.kind))) {
          throw new ConflictException('Hoàn thành bước đang thực hiện hoặc chuyển giao cho quản lý trước khi tạm nghỉ.');
        }
      }
      const updated = await tx.staffShift.update({ where: { id }, data: {
        ...(action === 'CHECK_IN' ? { checkedInAt: now } : action === 'CHECK_OUT' ? { checkedOutAt: now, breakStartedAt: null }
          : { breakStartedAt: action === 'START_BREAK' ? now : null }),
        revision: { increment: 1 },
      } });
      const affected = action === 'CHECK_OUT' ? await affectedWork(tx, current) : [];
      await this.audit(tx, actor, action, updated, current, affected.map(item => item.id));
      return updated;
    });
  }

  private async find(tx: Db, id: string) {
    const current = await tx.staffShift.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy ca làm.');
    return current;
  }

  private async lockUsers(tx: Db, ids: string[]) {
    await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE', [...new Set(ids)]);
  }

  private checkRevision(shift: StaffShift, revision: unknown) {
    if (shift.revision !== revision) throw new ConflictException('Ca vừa thay đổi. Tải lại lịch trước khi lưu.');
  }

  private async audit(tx: Db, actor: PublicUser, action: string, shift: StaffShift, before?: StaffShift, affected: string[] = []) {
    const snapshot = (value: StaffShift) => ({
      staffUserId: value.staffUserId, status: value.status, startsAt: value.startsAt.toISOString(), endsAt: value.endsAt.toISOString(),
      checkedInAt: value.checkedInAt?.toISOString() ?? null, checkedOutAt: value.checkedOutAt?.toISOString() ?? null,
      breakStartedAt: value.breakStartedAt?.toISOString() ?? null, reason: value.reason,
    });
    await tx.auditEvent.create({ data: {
      category: 'ACTIVITY', action, resource: 'staff-shifts', resourceId: shift.id,
      route: actor.role === 'FACILITY_MANAGER' ? '/manager/shifts' : '/staff/shifts',
      method: before ? 'PATCH' : 'POST', outcome: 'SUCCESS', httpStatus: before ? 200 : 201,
      actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role,
      metadata: { facilityId: shift.facilityId, before: before ? snapshot(before) : null, after: snapshot(shift), affected },
    } });
  }
}
