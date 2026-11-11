import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { UnitStaffService } from '../unit-staff/unit-staff.service.js';
import { businessDate } from '../../business-date.js';

export function claimEvidence(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) throw new BadRequestException('Tối đa 8 liên kết chứng cứ HTTPS.');
  return value.map(link => { if (typeof link !== 'string' || link.length > 2000) throw new BadRequestException('Liên kết chứng cứ không hợp lệ.'); let url: URL; try { url = new URL(link); } catch { throw new BadRequestException('Liên kết chứng cứ không hợp lệ.'); } if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('Chỉ nhận liên kết HTTPS không chứa tài khoản/mật khẩu.'); return url.href; });
}
@Injectable()
export class DamageClaimsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly unitStaff?: UnitStaffService) {}
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
    const inputHash = createHash('sha256').update(JSON.stringify([contractId, description, date, estimated, links, [...ids].sort()])).digest('hex');
    const contract = await this.prisma.rentalContract.findFirst({ where: { id: contractId, reservation: { customerId: actor.id }, status: { in: ['ACTIVE', 'COMPLETED'] } }, include: { reservationUnit: { include: { storageUnit: true } } } });
    if (!contract) throw new NotFoundException('Không tìm thấy kho đã nhận thuộc tài khoản của bạn.');
    const affected = await this.prisma.storedItem.findMany({ where: { id: { in: ids as string[] }, rentalContractId: contract.id, customerUserId: actor.id }, select: { id: true, name: true, unit: true, itemCode: true } });
    if (affected.length !== ids.length) throw new BadRequestException('Có mặt hàng không thuộc hợp đồng đã chọn.');
    const duplicate = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey } });
    if (duplicate) { if (duplicate.inputHash !== inputHash) throw new ConflictException('Khóa gửi đã dùng cho nội dung khác.'); return this.view(duplicate); }
    return this.prisma.$transaction(async tx => {
      const responsibility = await this.unitStaff?.resolveStaff(tx, [contract.reservationUnit.storageUnitId]);
      const row = await tx.damageClaim.create({ data: { claimCode: `NB-SC-${randomBytes(5).toString('hex').toUpperCase()}`, customerId: actor.id, rentalContractId: contract.id, unitCodeSnapshot: contract.reservationUnit.storageUnit.unitNumber, discoveredOn: new Date(date), description, affectedItems: affected, evidenceLinks: links, estimatedValue: estimated === null ? null : BigInt(estimated as number), assignedStaffId: responsibility?.staffUserId, idempotencyKey, inputHash } });
      return this.view(row);
    }).catch(async error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retry = await this.prisma.damageClaim.findUnique({ where: { idempotencyKey } });
        if (retry?.inputHash === inputHash) return this.view(retry);
        throw new ConflictException('Yêu cầu trùng hoặc nội dung đã thay đổi.');
      }
      throw error;
    });
  }
  async list(actor: PublicUser, query: Record<string, unknown>) {
    const page = Number(query.page ?? 1), limit = 25;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Trang không hợp lệ.');
    const where: Prisma.DamageClaimWhereInput = actor.role === 'CUSTOMER' ? { customerId: actor.id } : actor.role === 'STAFF' ? { OR: [{ assignedStaffId: actor.id }, { assignedStaffId: null, status: 'REPORTED' }] } : {};
    if (query.id !== undefined && query.id !== '') { if (typeof query.id !== 'string' || query.id.length > 200) throw new BadRequestException('Mã hồ sơ không hợp lệ.'); where.id = query.id; }
    const [total, rows] = await Promise.all([this.prisma.damageClaim.count({ where }), this.prisma.damageClaim.findMany({ where, include: { customer: { select: { fullName: true, phone: true } }, rentalContract: { select: { contractCode: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit })]);
    return { page, limit, total, items: rows.map(row => this.view(row)) };
  }
  async action(actor: PublicUser, id: string, input: Record<string, unknown>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "DamageClaim" WHERE id = ${id} FOR UPDATE`);
      const row = await tx.damageClaim.findUnique({ where: { id } }); if (!row) throw new NotFoundException();
      if (input.expectedUpdatedAt !== row.updatedAt.toISOString()) throw new ConflictException('Hồ sơ vừa thay đổi. Tải lại trước khi lưu.');
      let data: Prisma.DamageClaimUpdateInput;
      if (actor.role === 'STAFF' && ['REPORTED', 'INVESTIGATING'].includes(row.status)) {
        if (row.assignedStaffId && row.assignedStaffId !== actor.id) throw new ForbiddenException('Hồ sơ đã giao nhân viên khác.');
        data = { status: 'INVESTIGATING', assignedStaffId: actor.id, staffFacts: this.text(input.staffFacts, 'Ghi nhận thực tế', 10), factsRecordedAt: new Date() };
      } else if (actor.role === 'MANAGER' && row.status === 'INVESTIGATING' && ['APPROVED', 'REJECTED'].includes(String(input.decision))) {
        if (!row.staffFacts) throw new ConflictException('Cần ghi nhận thực tế của nhân viên trước khi quyết định.');
        data = { status: input.decision as 'APPROVED' | 'REJECTED', decision: String(input.decision), decisionReason: this.text(input.decisionReason, 'Lý do quyết định', 10), reviewedById: actor.id, reviewedAt: new Date() };
      } else if (actor.role === 'MANAGER' && ['APPROVED', 'REJECTED'].includes(row.status) && input.action === 'resolve') {
        data = { status: 'RESOLVED', resolutionNote: this.text(input.resolutionNote, 'Kết quả đã thông báo cho khách', 10), resolvedAt: new Date() };
      } else throw new ForbiddenException('Bạn không được thực hiện bước này ở trạng thái hiện tại.');
      data.history = [...(Array.isArray(row.history) ? row.history : []), { actorId: actor.id, role: actor.role, at: new Date().toISOString(), from: row.status, to: data.status as string, staffFacts: row.staffFacts, decisionReason: row.decisionReason, resolutionNote: row.resolutionNote }];
      return this.view(await tx.damageClaim.update({ where: { id }, data }));
    });
  }
  private view(row: any) { const { idempotencyKey: _key, ...data } = row; return { ...data, estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue), discoveredOn: row.discoveredOn.toISOString().slice(0, 10), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
}
