import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma, type DamageClaim, type DamageClaimCompensation } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertActiveAssignee, assertTaskAssignee, managerAssignmentInput, operationalAssignee } from '../unit-staff/operational-assignment.js';
import { businessDate } from '../../business-date.js';

type ClaimRow = DamageClaim & {
  compensation?: (DamageClaimCompensation & { approvedBy?: { fullName: string }; recordedBy?: { fullName: string } | null }) | null;
};

export function claimEvidence(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) throw new BadRequestException('Tối đa 8 liên kết chứng cứ HTTPS.');
  return value.map(link => { if (typeof link !== 'string' || link.length > 2000) throw new BadRequestException('Liên kết chứng cứ không hợp lệ.'); let url: URL; try { url = new URL(link); } catch { throw new BadRequestException('Liên kết chứng cứ không hợp lệ.'); } if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('Chỉ nhận liên kết HTTPS không chứa tài khoản/mật khẩu.'); return url.href; });
}
@Injectable()
export class DamageClaimsService {
  constructor(private readonly prisma: PrismaService) {}
  private text(value: unknown, name: string, min = 3, max = 3000) { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new BadRequestException(`${name}: nhập ${min}–${max} ký tự.`); return value.trim(); }
  async create(actor: PublicUser, input: Record<string, unknown>, key?: string) {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();
    const contractId = this.text(input.rentalContractId, 'Kho đang thuê', 1, 200), description = this.text(input.description, 'Mô tả', 10);
    const date = this.text(input.discoveredOn, 'Ngày phát hiện', 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > businessDate()) throw new BadRequestException('Ngày phát hiện không được ở tương lai và phải hợp lệ.');
    const links = claimEvidence(input.evidenceLinks ?? []), ids = input.storedItemIds;
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new BadRequestException('Danh sách hàng bị ảnh hưởng không hợp lệ.');
    const estimated = input.estimatedValue === null || input.estimatedValue === undefined ? null : input.estimatedValue;
    if (estimated !== null && (typeof estimated !== 'number' || !Number.isSafeInteger(estimated) || estimated < 0)) throw new BadRequestException('Giá trị ước tính phải là số nguyên VND không âm, hoặc để trống.');
    if (!key || !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Cần khóa gửi yêu cầu hợp lệ.');
    const idempotencyKey = createHash('sha256').update(`${actor.id}:${key}`).digest('hex');
    const inputHash = createHash('sha256').update(JSON.stringify([contractId, description, date, estimated, links, [...ids].sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0)])).digest('hex');
    const contract = await this.prisma.rentalContract.findFirst({ where: { id: contractId, reservation: { customerId: actor.id }, status: { in: ['ACTIVE', 'COMPLETED'] } }, include: { reservationUnit: { include: { storageUnit: true } } } });
    if (!contract) throw new NotFoundException('Không tìm thấy kho đã nhận thuộc tài khoản của bạn.');
    const affected = await this.prisma.storedItem.findMany({ where: { id: { in: ids as string[] }, rentalContractId: contract.id, customerUserId: actor.id }, select: { id: true, name: true, unit: true, itemCode: true } });
    if (affected.length !== ids.length) throw new BadRequestException('Có mặt hàng không thuộc hợp đồng đã chọn.');
    const duplicate = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey }, include: this.include('CUSTOMER') });
    if (duplicate) { if (duplicate.inputHash !== inputHash) throw new ConflictException('Khóa gửi đã dùng cho nội dung khác.'); return this.view(duplicate, 'CUSTOMER'); }
    return this.prisma.$transaction(async tx => {
      const row = await tx.damageClaim.create({ data: { claimCode: `NB-SC-${randomBytes(5).toString('hex').toUpperCase()}`, customerId: actor.id, rentalContractId: contract.id, unitCodeSnapshot: contract.reservationUnit.storageUnit.unitNumber, discoveredOn: new Date(date), description, affectedItems: affected, evidenceLinks: links, estimatedValue: estimated === null ? null : BigInt(estimated as number), idempotencyKey, inputHash } });
      return this.view(row, 'CUSTOMER');
    }).catch(async error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retry = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey }, include: this.include('CUSTOMER') });
        if (retry?.inputHash === inputHash) return this.view(retry, 'CUSTOMER');
        throw new ConflictException('Yêu cầu trùng hoặc nội dung đã thay đổi.');
      }
      throw error;
    });
  }
  private scope(actor: PublicUser): Prisma.DamageClaimWhereInput {
    if (actor.role === 'CUSTOMER') return { customerId: actor.id };
    if (actor.role === 'STAFF') return { assignedStaffId: actor.id };
    if (actor.role === 'MANAGER') return {};
    throw new ForbiddenException();
  }

  private include(role: PublicUser['role']) {
    return {
      ...(role === 'CUSTOMER' ? {} : { customer: { select: { fullName: true, phone: true } } }),
      rentalContract: { select: { contractCode: true } },
      ...(role === 'CUSTOMER' ? { compensation: true } : role === 'STAFF' ? {} : { compensation: { include: {
        approvedBy: { select: { fullName: true } },
        recordedBy: { select: { fullName: true } },
      } } }),
    } satisfies Prisma.DamageClaimInclude;
  }

  async list(actor: PublicUser, query: Record<string, unknown>) {
    const page = Number(query.page ?? 1), limit = Number(query.limit ?? 25);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Phân trang không hợp lệ.');
    const where = this.scope(actor);
    if (query.id !== undefined && query.id !== '') where.id = this.text(query.id, 'Mã hồ sơ', 1, 200);
    if (query.search !== undefined && query.search !== '') {
      if (typeof query.search !== 'string' || query.search.length > 100) throw new BadRequestException('Từ khóa tối đa 100 ký tự.');
      const search = query.search.trim();
      if (search) {
        const match = { contains: search, mode: 'insensitive' as const };
        where.OR = [{ description: match }, { unitCodeSnapshot: match }, { claimCode: match },
          ...(actor.role === 'CUSTOMER' ? [] : [{ customer: { fullName: match } }])];
      }
    }
    if (query.stage) where.AND = [this.stage(actor.role, query.stage)];
    const orderBy: Prisma.DamageClaimOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    if (actor.role === 'STAFF') orderBy.unshift({ status: 'asc' });
    const [total, rows] = await Promise.all([
      this.prisma.damageClaim.count({ where }),
      this.prisma.damageClaim.findMany({ where, include: this.include(actor.role), orderBy, skip: (page - 1) * limit, take: limit }),
    ]);
    return { page, limit, total, items: await this.views(actor, rows, typeof where.id === 'string') };
  }

  async get(actor: PublicUser, id: string) {
    const row = await this.prisma.damageClaim.findFirst({ where: { ...this.scope(actor), id }, include: this.include(actor.role) });
    if (!row) throw new NotFoundException('Không tìm thấy hồ sơ sự cố.');
    const [result] = await this.views(actor, [row], true);
    return result;
  }

  private stage(role: PublicUser['role'], stage: unknown): Prisma.DamageClaimWhereInput {
    switch (stage) {
      case 'reported': return { status: 'REPORTED' };
      case 'investigating': return { status: 'INVESTIGATING' };
      case 'decided': return { status: { in: ['APPROVED', 'REJECTED'] } };
      case 'resolved': return { status: 'RESOLVED' };
      case 'unassigned': if (role === 'MANAGER') return { status: { in: ['REPORTED', 'INVESTIGATING'] }, assignedStaffId: null }; break;
      case 'inspection': if (role === 'MANAGER') return { status: { in: ['REPORTED', 'INVESTIGATING'] }, assignedStaffId: { not: null }, staffFacts: null }; break;
      case 'decision': if (role === 'MANAGER') return { status: 'INVESTIGATING', staffFacts: { not: null } }; break;
      case 'notification': if (role === 'MANAGER') return { status: { in: ['APPROVED', 'REJECTED'] }, OR: [{ compensation: null }, { compensation: { is: { paidCompensationAmount: { not: null } } } }] }; break;
      case 'handover': if (role !== 'STAFF') return { compensation: { is: { paidCompensationAmount: null } } }; break;
    }
    throw new BadRequestException('Trạng thái lọc không hợp lệ.');
  }

  async assign(actor: PublicUser, id: string, input: Record<string, unknown>) {
    const staffId = managerAssignmentInput(actor, input);
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      if (!['REPORTED', 'INVESTIGATING'].includes(row.status)) throw new ConflictException('Hồ sơ sự cố đã có quyết định.');
      await assertActiveAssignee(tx, staffId);
      if (row.assignedStaffId === staffId) return this.view(row, 'MANAGER');
      const updated = await tx.damageClaim.update({ where: { id }, data: {
        assignedStaffId: staffId, history: this.history(row, actor, 'ASSIGNED', new Date(), row.status),
      } });
      return this.view(updated, 'MANAGER');
    });
  }

  async action(actor: PublicUser, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'STAFF' && actor.role !== 'MANAGER') throw new ForbiddenException();
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      if (actor.role === 'STAFF') assertTaskAssignee(actor, row.assignedStaffId);
      this.assertVersion(row, input.expectedUpdatedAt);

      const now = new Date();
      if (actor.role === 'STAFF') {
        if (!['REPORTED', 'INVESTIGATING'].includes(row.status)) throw new ForbiddenException('Hồ sơ đã được quản lý quyết định.');
        const staffFacts = this.text(input.staffFacts, 'Ghi nhận thực tế', 10);
        return this.view(await tx.damageClaim.update({ where: { id }, data: {
          status: 'INVESTIGATING', staffFacts, factsRecordedAt: now,
          history: this.history(row, actor, 'INSPECTED', now, 'INVESTIGATING'),
        } }), actor.role);
      }
      let data: Prisma.DamageClaimUpdateInput;
      if (row.status === 'INVESTIGATING' && (input.decision === 'APPROVED' || input.decision === 'REJECTED')) {
        if (!row.staffFacts) throw new ConflictException('Cần ghi nhận thực tế của nhân viên trước khi quyết định.');
        const decision = input.decision;
        const decisionReason = this.text(input.decisionReason, 'Lý do quyết định', 10);
        const amount = input.approvedCompensationAmount;
        if (amount !== null && amount !== undefined) {
          if (decision !== 'APPROVED') throw new BadRequestException('Hồ sơ bị từ chối không phát sinh bồi thường.');
          await tx.damageClaimCompensation.create({ data: {
            damageClaimId: id, approvedCompensationAmount: this.cashAmount(amount), approvalReason: decisionReason, approvedById: actor.id, approvedAt: now,
          } });
        }
        data = { status: decision, decision, decisionReason, reviewedById: actor.id, reviewedAt: now,
          history: this.history(row, actor, 'DECIDED', now, decision) };
      } else if (['APPROVED', 'REJECTED'].includes(row.status) && (input.action === 'resolve' || input.action === 'notify')) {
        const compensation = await tx.damageClaimCompensation.findUnique({ where: { damageClaimId: id }, select: { handedOverAt: true } });
        if (input.action === 'resolve' && compensation && !compensation.handedOverAt) throw new ConflictException('Cần ghi nhận giao đủ tiền mặt trước khi hoàn tất hồ sơ.');
        if (input.action === 'notify' && row.resolutionNote) throw new ConflictException('Kết quả đã được thông báo.');
        const resolutionNote = row.resolutionNote ?? this.text(input.resolutionNote, 'Kết quả đã thông báo cho khách', 10);
        const closed = input.action === 'resolve';
        data = { resolutionNote, ...(closed ? { status: 'RESOLVED', resolvedAt: now } : {}),
          history: this.history(row, actor, closed ? 'RESOLVED' : 'NOTIFIED', now, closed ? 'RESOLVED' : row.status) };
      } else throw new ForbiddenException('Bạn không được thực hiện bước này ở trạng thái hiện tại.');
      return this.view(await tx.damageClaim.update({ where: { id }, data, include: this.include('MANAGER') }), 'MANAGER');
    });
  }

  async recordHandover(actor: PublicUser, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được ghi nhận giao tiền mặt.');
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      const compensation = await tx.damageClaimCompensation.findUnique({ where: { damageClaimId: id } });
      if (compensation?.handedOverAt) throw new ConflictException('Khoản bồi thường đã được bàn giao.');
      if (row.status !== 'APPROVED' || !compensation) throw new ConflictException('Hồ sơ chưa có khoản bồi thường được duyệt.');
      this.assertVersion(row, input.expectedUpdatedAt);
      if (input.confirmCashHandover !== true) throw new BadRequestException('Cần xác nhận đã giao tiền mặt thực tế.');
      const paidCompensationAmount = this.cashAmount(input.paidCompensationAmount);
      if (paidCompensationAmount !== compensation.approvedCompensationAmount) throw new BadRequestException('Cần giao đủ số tiền đã duyệt trong một lần.');
      const now = new Date();
      const timestamp = input.handedOverAt;
      const handedOverAt = new Date(typeof timestamp === 'string' ? timestamp : '');
      if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
          !Number.isFinite(handedOverAt.getTime()) || new Date(timestamp.slice(0, 10)).toISOString().slice(0, 10) !== timestamp.slice(0, 10) ||
          handedOverAt < compensation.approvedAt || handedOverAt > now) {
        throw new BadRequestException('Thời điểm giao tiền phải nằm sau khi duyệt và không vượt quá hiện tại.');
      }

      await tx.damageClaimCompensation.update({ where: { damageClaimId: id }, data: {
        paidCompensationAmount, handedOverAt,
        deliveredBy: this.text(input.deliveredBy, 'Người giao', 2, 120),
        receivedBy: this.text(input.receivedBy, 'Người nhận', 2, 120),
        handoverNote: input.handoverNote === undefined || input.handoverNote === '' ? null : this.text(input.handoverNote, 'Ghi chú bàn giao', 1, 1000),
        recordedById: actor.id, recordedAt: now,
      } });
      const updated = await tx.damageClaim.update({ where: { id }, data: {
        history: this.history(row, actor, 'CASH_HANDED_OVER', now, row.status),
      }, include: this.include('MANAGER') });
      return this.view(updated, 'MANAGER');
    });
  }

  private async lockClaim(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "DamageClaim" WHERE id = ${id} FOR UPDATE`);
    const row = await tx.damageClaim.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy hồ sơ sự cố.');
    return row;
  }

  private assertVersion(row: { updatedAt: Date }, expected: unknown) {
    if (expected !== row.updatedAt.toISOString()) throw new ConflictException('Hồ sơ vừa thay đổi. Tải lại trước khi lưu.');
  }

  private cashAmount(value: unknown) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new BadRequestException('Số tiền phải là số nguyên VND lớn hơn 0.');
    return BigInt(value);
  }

  private history(row: { history: Prisma.JsonValue; status: string }, actor: PublicUser, action: string, at: Date, to: string): Prisma.InputJsonArray {
    return [...(Array.isArray(row.history) ? row.history as Prisma.InputJsonArray : []),
      { actorId: actor.id, role: actor.role, at: at.toISOString(), action, from: row.status, to }];
  }

  private async views(actor: PublicUser, rows: ClaimRow[], detail = false) {
    const ids = new Set<string>();
    if (actor.role !== 'CUSTOMER') for (const row of rows) {
      if (row.assignedStaffId) ids.add(row.assignedStaffId);
      if (detail) for (const event of this.events(row.history, actor.role)) if (typeof event.actorId === 'string') ids.add(event.actorId);
    }
    const users = ids.size ? await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: operationalAssignee }) : [];
    const byId = new Map(users.map(user => [user.id, user]));
    return rows.map(row => ({
      ...this.view(row, actor.role),
      ...(actor.role === 'CUSTOMER' ? {} : { assignedStaff: byId.get(row.assignedStaffId ?? '') ?? null }),
      ...(detail ? { history: this.events(row.history, actor.role).map(event => ({
        ...this.publicEvent(event),
        ...(actor.role !== 'CUSTOMER' && typeof event.actorId === 'string' ? { actorName: byId.get(event.actorId)?.fullName } : {}),
      })) } : {}),
    }));
  }

  private events(history: Prisma.JsonValue, role: PublicUser['role']) {
    return Array.isArray(history) ? history.filter((event): event is Prisma.JsonObject => Boolean(event && typeof event === 'object' && !Array.isArray(event) && (role !== 'STAFF' || event.action !== 'CASH_HANDED_OVER'))) : [];
  }

  private publicEvent(event: Prisma.JsonObject) {
    const { role, at, action, from, to } = event;
    return { role, at, action, from, to };
  }

  private view(row: ClaimRow, role: PublicUser['role']) {
    const { idempotencyKey: _key, inputHash: _hash, compensation, history, assignedStaffId, reviewedById, ...data } = row;
    return {
      ...data,
      ...(role === 'CUSTOMER' ? {} : { assignedStaffId, reviewedById }),
      estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
      discoveredOn: row.discoveredOn.toISOString().slice(0, 10),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: this.events(history, role).map(event => this.publicEvent(event)),
      ...(role === 'STAFF' ? {} : { compensation: {
        status: compensation ? compensation.handedOverAt ? 'HANDED_OVER' : 'AWAITING_HANDOVER' : ['REPORTED', 'INVESTIGATING'].includes(row.status) ? 'PENDING_REVIEW' : 'NONE',
        approvedCompensationAmount: compensation ? Number(compensation.approvedCompensationAmount) : null,
        paidCompensationAmount: compensation?.paidCompensationAmount != null ? Number(compensation.paidCompensationAmount) : null,
        method: compensation?.method ?? null,
        handedOverAt: compensation?.handedOverAt?.toISOString() ?? null,
        ...(role === 'MANAGER' && compensation ? {
          approvalReason: compensation.approvalReason, approvedAt: compensation.approvedAt.toISOString(), approvedBy: compensation.approvedBy?.fullName,
          deliveredBy: compensation.deliveredBy, receivedBy: compensation.receivedBy, handoverNote: compensation.handoverNote,
          recordedBy: compensation.recordedBy?.fullName, recordedAt: compensation.recordedAt?.toISOString(),
        } : {}),
      } }),
    };
  }
}
