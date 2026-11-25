import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTaskFacility, currentContractScope } from '../facility-access/task-access.js';
import { customerPhotos } from '../../customer-photos.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma, type DamageClaim, type DamageClaimCompensation } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertActiveAssignee, assertTaskAssignee, managerAssignmentInput, operationalAssignee } from '../facility-access/operational-assignment.js';
import { businessDate } from '../../business-date.js';

type ClaimRow = DamageClaim & {
  rentalContract?: { contractCode: string; reservation?: { facilityId?: string; facility?: { id: string; name: string } } };
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
    if (actor.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException();
    const contractId = this.text(input.rentalContractId, 'Kho đang thuê', 1, 200), description = this.text(input.description, 'Mô tả', 10);
    const date = this.text(input.discoveredOn, 'Ngày phát hiện', 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > businessDate()) throw new BadRequestException('Ngày phát hiện không được ở tương lai và phải hợp lệ.');
    const photos = customerPhotos(input.evidencePhotos);
    if (input.evidencePhotos !== undefined && !photos.length) throw new BadRequestException('Thêm ít nhất một ảnh chứng cứ.');
    const links = claimEvidence(input.evidenceLinks ?? []);
    const estimated = input.estimatedValue === null || input.estimatedValue === undefined ? null : input.estimatedValue;
    if (estimated !== null && (typeof estimated !== 'number' || !Number.isSafeInteger(estimated) || estimated < 0)) throw new BadRequestException('Giá trị ước tính phải là số nguyên VND không âm, hoặc để trống.');
    if (!key || !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Cần khóa gửi yêu cầu hợp lệ.');
    const idempotencyKey = createHash('sha256').update(`${actor.id}:${key}`).digest('hex');
    function hash(legacyIds: string[]) {
      return createHash('sha256').update(JSON.stringify([contractId, description, date, estimated, links, legacyIds, ...(photos.length ? [photos] : [])])).digest('hex');
    }
    const inputHash = hash([]);
    // Accept a retry of a pre-retirement request without consulting or modifying item records.
    const legacyIds = input.storedItemIds;
    const legacyHash = Array.isArray(legacyIds) && legacyIds.length <= 100 &&
      legacyIds.every((id): id is string => typeof id === 'string') && new Set(legacyIds).size === legacyIds.length
      ? hash([...legacyIds].sort()) : undefined;
    const matches = (record: ClaimRow) => record.inputHash === inputHash ||
      (legacyHash !== undefined && record.inputHash === legacyHash);
    const duplicate = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey }, include: this.include('STORAGE_CUSTOMER') });
    if (duplicate) { if (!matches(duplicate)) throw new ConflictException('Khóa gửi đã dùng cho nội dung khác.'); return this.view(duplicate, 'STORAGE_CUSTOMER'); }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "RentalContract" WHERE id = ${contractId} FOR UPDATE`);
      const contract = await tx.rentalContract.findFirst({
        where: { id: contractId, reservation: { customerId: actor.id }, status: 'ACTIVE', reservationUnit: { releasedAt: null } },
        include: { reservationUnit: { include: { storageUnit: true } } },
      });
      if (!contract) throw new NotFoundException('Chỉ được báo sự cố cho kho đang thuê thuộc tài khoản của bạn. Kho đã trả hoặc hợp đồng đã kết thúc không thể gửi yêu cầu mới.');
      const row = await tx.damageClaim.create({ data: { claimCode: `NB-SC-${randomBytes(5).toString('hex').toUpperCase()}`, customerId: actor.id, rentalContractId: contract.id, unitCodeSnapshot: contract.reservationUnit.storageUnit.unitNumber, discoveredOn: new Date(date), description, affectedItems: [], evidenceLinks: links, ...(photos.length ? { evidencePhotos: photos } : {}), estimatedValue: estimated === null ? null : BigInt(estimated as number), idempotencyKey, inputHash } });
      return this.view(row, 'STORAGE_CUSTOMER');
    }).catch(async error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retry = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey }, include: this.include('STORAGE_CUSTOMER') });
        if (retry && matches(retry)) return this.view(retry, 'STORAGE_CUSTOMER');
        throw new ConflictException('Yêu cầu trùng hoặc nội dung đã thay đổi.');
      }
      throw error;
    });
  }
  private scope(actor: PublicUser): Prisma.DamageClaimWhereInput {
    if (actor.role === 'STORAGE_CUSTOMER') return { customerId: actor.id };
    if (actor.role === 'FACILITY_STAFF') return { assignedStaffId: actor.id,rentalContract:currentContractScope(actor) };
    if (actor.role === 'FACILITY_MANAGER') return {rentalContract:currentContractScope(actor)};
    throw new ForbiddenException();
  }

  private include(role: PublicUser['role']) {
    return {
      ...(role === 'STORAGE_CUSTOMER' ? {} : { customer: { select: { fullName: true, phone: true } } }),
      rentalContract: { select: { contractCode: true, ...(['FACILITY_STAFF','FACILITY_MANAGER'].includes(role) ? { reservation: { select: { facility: { select: { id: true, name: true } } } } } : {}) } },
      ...(role === 'STORAGE_CUSTOMER' ? { compensation: true } : role === 'FACILITY_STAFF' ? {} : { compensation: { include: {
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
          ...(actor.role === 'STORAGE_CUSTOMER' ? [] : [{ customer: { fullName: match } }])];
      }
    }
    if (query.stage) where.AND = [this.stage(actor.role, query.stage)];
    const orderBy: Prisma.DamageClaimOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    if (actor.role === 'FACILITY_STAFF') orderBy.unshift({ status: 'asc' });
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
      case 'unassigned': if (role === 'FACILITY_MANAGER') return { status: { in: ['REPORTED', 'INVESTIGATING'] }, assignedStaffId: null }; break;
      case 'inspection': if (role === 'FACILITY_MANAGER') return { status: { in: ['REPORTED', 'INVESTIGATING'] }, assignedStaffId: { not: null }, staffFacts: null }; break;
      case 'decision': if (role === 'FACILITY_MANAGER') return { status: 'INVESTIGATING', staffFacts: { not: null } }; break;
      case 'notification': if (role === 'FACILITY_MANAGER') return { status: { in: ['APPROVED', 'REJECTED'] }, OR: [{ compensation: null }, { compensation: { is: { paidCompensationAmount: { not: null } } } }] }; break;
      case 'handover': if (role !== 'FACILITY_STAFF') return { compensation: { is: { paidCompensationAmount: null } } }; break;
    }
    throw new BadRequestException('Trạng thái lọc không hợp lệ.');
  }

  async assign(actor: PublicUser, id: string, input: Record<string, unknown>) {
    const staffId = managerAssignmentInput(actor, input);
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      await assertTaskFacility(tx,actor,{rentalContractId:row.rentalContractId});
      if (!['REPORTED', 'INVESTIGATING'].includes(row.status)) throw new ConflictException('Hồ sơ sự cố đã có quyết định.');
      await assertActiveAssignee(tx, staffId, actor, {rentalContractId:row.rentalContractId});
      if (row.assignedStaffId === staffId) return this.view(row, 'FACILITY_MANAGER');
      await recordAssignment(tx,actor,"damage-claims",row.id,row.assignedStaffId,staffId);
      const updated = await tx.damageClaim.update({ where: { id }, data: {
        assignedStaffId: staffId, history: this.history(row, actor, 'ASSIGNED', new Date(), row.status),
      } });
      return this.view(updated, 'FACILITY_MANAGER');
    });
  }

  async action(actor: PublicUser, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_STAFF' && actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      await assertTaskFacility(tx,actor,{rentalContractId:row.rentalContractId});
      if (actor.role === 'FACILITY_STAFF') assertTaskAssignee(actor, row.assignedStaffId);
      this.assertVersion(row, input.expectedUpdatedAt);

      const now = new Date();
      if (actor.role === 'FACILITY_STAFF') {
        if (!['REPORTED', 'INVESTIGATING'].includes(row.status)) throw new ForbiddenException('Hồ sơ đã được quản lý quyết định.');
        const staffFacts = this.text(input.staffFacts, 'Ghi nhận thực tế', 10);
        const staffEvidenceLinks = input.staffEvidenceLinks === undefined ? this.staffEvidence(row.history) : claimEvidence(input.staffEvidenceLinks);
        return this.view(await tx.damageClaim.update({ where: { id }, data: {
          status: 'INVESTIGATING', staffFacts, factsRecordedAt: now,
          history: this.history(row, actor, 'INSPECTED', now, 'INVESTIGATING', { staffEvidenceLinks }),
        } }), actor.role);
      }
      let data: Prisma.DamageClaimUpdateInput;
      if (input.action === 'amend-decision' && ['APPROVED', 'REJECTED', 'RESOLVED'].includes(row.status)) {
        data = {
          decisionReason: this.text(input.decisionReason, 'Lý do quyết định', 10),
          history: this.history(row, actor, 'amend-decision', now, row.status, { decisionReason: row.decisionReason }),
        };
      } else if (input.action === 'amend-resolution' && row.status === 'RESOLVED') {
        data = {
          resolutionNote: this.text(input.resolutionNote, 'Kết quả đã thông báo', 10),
          history: this.history(row, actor, 'amend-resolution', now, row.status, { resolutionNote: row.resolutionNote }),
        };
      } else if (row.status === 'INVESTIGATING' && (input.decision === 'APPROVED' || input.decision === 'REJECTED')) {
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
      return this.view(await tx.damageClaim.update({ where: { id }, data, include: this.include('FACILITY_MANAGER') }), 'FACILITY_MANAGER');
    });
  }

  async recordHandover(actor: PublicUser, id: string, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được ghi nhận giao tiền mặt.');
    return this.prisma.$transaction(async tx => {
      const row = await this.lockClaim(tx, id);
      await assertTaskFacility(tx,actor,{rentalContractId:row.rentalContractId});
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
      }, include: this.include('FACILITY_MANAGER') });
      return this.view(updated, 'FACILITY_MANAGER');
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

  private history(row: { history: Prisma.JsonValue; status: string }, actor: PublicUser, action: string, at: Date, to: string, previous: Prisma.InputJsonObject = {}): Prisma.InputJsonArray {
    return [...(Array.isArray(row.history) ? row.history as Prisma.InputJsonArray : []),
      { actorId: actor.id, role: actor.role, at: at.toISOString(), action, from: row.status, to, ...previous }];
  }

  private async views(actor: PublicUser, rows: ClaimRow[], detail = false) {
    const ids = new Set<string>();
    if (actor.role !== 'STORAGE_CUSTOMER') for (const row of rows) {
      if (row.assignedStaffId) ids.add(row.assignedStaffId);
      if (detail) for (const event of this.events(row.history, actor.role)) if (typeof event.actorId === 'string') ids.add(event.actorId);
    }
    const users = ids.size ? await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: operationalAssignee }) : [];
    const byId = new Map(users.map(user => [user.id, user]));
    return rows.map(row => ({
      ...this.view(row, actor.role),
      ...(actor.role === 'STORAGE_CUSTOMER' ? {} : { assignedStaff: byId.get(row.assignedStaffId ?? '') ?? null }),
      ...(detail ? { history: this.events(row.history, actor.role).map(event => ({
        ...this.publicEvent(event),
        ...(actor.role !== 'STORAGE_CUSTOMER' && typeof event.actorId === 'string' ? { actorName: byId.get(event.actorId)?.fullName } : {}),
      })) } : {}),
    }));
  }

  private events(history: Prisma.JsonValue, role: PublicUser['role']) {
    return Array.isArray(history) ? history.filter((event): event is Prisma.JsonObject => Boolean(event && typeof event === 'object' && !Array.isArray(event) && (role !== 'FACILITY_STAFF' || event.action !== 'CASH_HANDED_OVER'))) : [];
  }

  private publicEvent(event: Prisma.JsonObject) {
    const { role, at, action, from, to } = event;
    return { role, at, action, from, to };
  }

  private staffEvidence(history: Prisma.JsonValue) {
    const latest = this.events(history, 'FACILITY_STAFF').findLast(event => event.action === 'INSPECTED' && Array.isArray(event.staffEvidenceLinks));
    return Array.isArray(latest?.staffEvidenceLinks) ? latest.staffEvidenceLinks.filter((link): link is string => typeof link === 'string') : [];
  }

  private view(row: ClaimRow, role: PublicUser['role']) {
    const { idempotencyKey: _key, inputHash: _hash, compensation, history, assignedStaffId, reviewedById, rentalContract, ...data } = row;
    return {
      ...data,
      ...(rentalContract ? { rentalContract: { contractCode: rentalContract.contractCode } } : {}),
      ...(['FACILITY_STAFF','FACILITY_MANAGER'].includes(role) && rentalContract?.reservation?.facility ? { facility: rentalContract.reservation.facility } : {}),
      ...(role !== 'STORAGE_CUSTOMER' ? { staffEvidenceLinks: this.staffEvidence(history) } : {}),
      ...(role === 'STORAGE_CUSTOMER' ? {} : { assignedStaffId, reviewedById }),
      estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
      discoveredOn: row.discoveredOn.toISOString().slice(0, 10),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: this.events(history, role).map(event => this.publicEvent(event)),
      ...(role === 'FACILITY_STAFF' ? {} : { compensation: {
        status: compensation ? compensation.handedOverAt ? 'HANDED_OVER' : 'AWAITING_HANDOVER' : ['REPORTED', 'INVESTIGATING'].includes(row.status) ? 'PENDING_REVIEW' : 'NONE',
        approvedCompensationAmount: compensation ? Number(compensation.approvedCompensationAmount) : null,
        paidCompensationAmount: compensation?.paidCompensationAmount != null ? Number(compensation.paidCompensationAmount) : null,
        method: compensation?.method ?? null,
        handedOverAt: compensation?.handedOverAt?.toISOString() ?? null,
        ...(role === 'FACILITY_MANAGER' && compensation ? {
          approvalReason: compensation.approvalReason, approvedAt: compensation.approvedAt.toISOString(), approvedBy: compensation.approvedBy?.fullName,
          deliveredBy: compensation.deliveredBy, receivedBy: compensation.receivedBy, handoverNote: compensation.handoverNote,
          recordedBy: compensation.recordedBy?.fullName, recordedAt: compensation.recordedAt?.toISOString(),
        } : {}),
      } }),
    };
  }
}
