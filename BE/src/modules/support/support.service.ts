import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type SupportStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED';
type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type SupportCategory = 'UNIT_ISSUE' | 'LOCK_OR_KEY_ISSUE' | 'ACCESS_CODE_ISSUE' | 'FACILITY_EQUIPMENT_FAILURE' | 'PAYMENT_SUPPORT' | 'STORED_ITEM_CONCERN' | 'OTHER';
type ViewMode = 'CUSTOMER' | 'STAFF' | 'MANAGER';

export interface SupportListQuery { page: number; limit: number; status?: SupportStatus; priority?: SupportPriority; category?: SupportCategory; assignedToMe?: boolean; search?: string }

const operationalCategories: SupportCategory[] = ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'STORED_ITEM_CONCERN'];
const staffResolutions = ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'] as const;
const managerResolutions = ['MANAGER_RESOLVED', 'TRANSFER_RECOMMENDED', 'NO_ACTION_REQUIRED', 'OTHER'] as const;

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(actor: PublicUser, input: Record<string, unknown>, key: string | undefined) {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ Customer được tạo Support Request.');
    const parsed = this.createInput(input, key);
    const retry = await this.prisma.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
    if (retry) return this.assertCreateRetry(retry, parsed, actor.id);
    const identity = await this.prisma.reservation.findFirst({ where: { customerId: actor.id, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy Reservation thuộc Customer.');
    try {
      return await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const duplicate = await tx.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) return this.assertCreateRetry(duplicate, { ...parsed, reservationId: identity.id }, actor.id);
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id }, include: {
          contracts: { include: { reservationUnit: { include: { storageUnit: true } } } },
          invoices: { select: { id: true } },
        } });
        if (!reservation || reservation.customerId !== actor.id) throw new NotFoundException('Không tìm thấy Reservation thuộc Customer.');
        const contract = parsed.rentalContractId ? reservation.contracts.find((item) => item.id === parsed.rentalContractId || item.contractCode === parsed.rentalContractId) : null;
        if (parsed.rentalContractId && !contract) throw new BadRequestException('RentalContract không thuộc Reservation đã chọn.');
        const activeContracts = reservation.contracts.filter((item) => item.status === 'ACTIVE' && item.reservationUnit.releasedAt === null && item.reservationUnit.storageUnit.status === 'OCCUPIED');
        if (operationalCategories.includes(parsed.category)) {
          if (reservation.status !== 'CONFIRMED' || activeContracts.length === 0 || (contract && !activeContracts.some((item) => item.id === contract.id))) {
            throw new ConflictException({ code: 'ACTIVE_RENTAL_REQUIRED', message: 'Loại Support này yêu cầu rental đang ACTIVE và unit còn OCCUPIED.' });
          }
        }
        const requestedUnit = parsed.storageUnitId;
        const unit = requestedUnit ? activeContracts.find((item) => item.reservationUnit.storageUnitId === requestedUnit || item.reservationUnit.storageUnit.unitNumber.toLowerCase() === requestedUnit.toLowerCase())?.reservationUnit.storageUnit : null;
        if (parsed.storageUnitId && !unit) throw new BadRequestException('StorageUnit không thuộc active allocation của Reservation.');
        if (contract && unit && contract.reservationUnit.storageUnitId !== unit.id) throw new BadRequestException('RentalContract và StorageUnit không khớp nhau.');
        const invoice = parsed.invoiceId ? reservation.invoices.find((item) => item.id === parsed.invoiceId) : null;
        if (parsed.invoiceId && !invoice) throw new BadRequestException('Invoice không thuộc Reservation đã chọn.');
        const created = await tx.supportRequest.create({ data: {
          supportCode: this.code(), customerUserId: actor.id, reservationId: reservation.id,
          rentalContractId: contract?.id, storageUnitId: unit?.id, invoiceId: invoice?.id,
          category: parsed.category, priority: 'MEDIUM', status: 'OPEN', subject: parsed.subject, description: parsed.description,
          idempotencyKey: parsed.idempotencyKey,
        }, include: this.include() });
        return this.toView(created, 'CUSTOMER');
      }, 'Support Request vừa được tạo bởi thao tác khác.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) return this.assertCreateRetry(duplicate, { ...parsed, reservationId: identity.id }, actor.id);
      }
      throw error;
    }
  }

  listCustomer(customerId: string, query: SupportListQuery) { return this.list({ customerUserId: customerId }, query, 'CUSTOMER'); }
  listStaff(query: SupportListQuery, actor: PublicUser) { return this.list(query.assignedToMe ? { assignedStaffUserId: actor.id } : {}, query, 'STAFF'); }
  listManager(query: SupportListQuery) { return this.list({}, query, 'MANAGER'); }

  async getCustomer(customerId: string, id: string) {
    const record = await this.prisma.supportRequest.findFirst({ where: { customerUserId: customerId, OR: [{ id }, { supportCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Support Request.');
    return this.toView(record, 'CUSTOMER');
  }
  async getStaff(id: string) { return this.toView(await this.find(id, this.prisma), 'STAFF'); }
  async getManager(id: string) { return this.toView(await this.find(id, this.prisma), 'MANAGER'); }

  assign(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const staffUserId = this.id(input.staffUserId, 'staffUserId');
    return this.transition(id, key, 'ASSIGN', actor, 'MANAGER', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      const staff = await tx.user.findUnique({ where: { id: staffUserId }, select: { id: true, role: true } });
      if (!staff || staff.role !== 'STAFF') throw new BadRequestException('Chỉ có thể assign tài khoản STAFF hợp lệ.');
      return tx.supportRequest.update({ where: { id: current.id }, data: { assignedStaffUserId: staff.id, status: current.status === 'OPEN' ? 'ASSIGNED' : current.status, lastAction: 'ASSIGN', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  priority(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const priority = input.priority;
    if (typeof priority !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) throw new BadRequestException('priority không hợp lệ.');
    return this.transition(id, key, 'PRIORITY', actor, 'MANAGER', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      return tx.supportRequest.update({ where: { id: current.id }, data: { priority: priority as SupportPriority, lastAction: 'PRIORITY', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  start(id: string, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'START', actor, 'STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'ASSIGNED') throw new ConflictException('Chỉ Support Request ASSIGNED mới có thể bắt đầu.');
      this.assertAssigned(current, actor);
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), lastAction: 'START', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  resolveStaff(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const parsed = this.resolutionInput(input, staffResolutions);
    return this.transition(id, key, 'STAFF_RESOLVE', actor, 'STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'IN_PROGRESS') throw new ConflictException('Chỉ Support Request IN_PROGRESS mới được Staff resolve.');
      this.assertAssigned(current, actor);
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'RESOLVED', resolutionType: parsed.resolutionType, resolutionNote: parsed.resolutionNote, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'STAFF_RESOLVE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  escalate(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const reason = this.text(input.reason, 4000, 'reason');
    return this.transition(id, key, 'ESCALATE', actor, 'STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'IN_PROGRESS') throw new ConflictException('Chỉ Support Request IN_PROGRESS mới được escalate.');
      this.assertAssigned(current, actor);
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'ESCALATED', escalatedAt: new Date(), escalatedByUserId: actor.id, escalationReason: reason, lastAction: 'ESCALATE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  resolveManager(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const parsed = this.resolutionInput(input, managerResolutions);
    return this.transition(id, key, 'MANAGER_RESOLVE', actor, 'MANAGER', async (tx, current, safeKey) => {
      if (current.status !== 'ESCALATED') throw new ConflictException('Manager chỉ resolve Support Request ESCALATED.');
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'RESOLVED', resolutionType: parsed.resolutionType, resolutionNote: parsed.resolutionNote, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'MANAGER_RESOLVE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  private async transition(id: string, key: string | undefined, action: string, actor: PublicUser, role: 'STAFF' | 'MANAGER', operation: (tx: Prisma.TransactionClient, current: any, key: string) => Promise<any>) {
    if (role === 'STAFF' && actor.role !== 'STAFF') throw new ForbiddenException('Chỉ Staff được thực hiện thao tác này.');
    if (role === 'MANAGER' && !['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được thực hiện thao tác này.');
    const safeKey = this.key(key); const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.supportRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy Support Request.');
      if (current.lastAction === action && current.lastActionIdempotencyKey === safeKey) return this.toView(current, role);
      if (await tx.supportRequest.findUnique({ where: { lastActionIdempotencyKey: safeKey }, select: { id: true } })) throw new ConflictException('Idempotency-Key đã được dùng cho thao tác khác.');
      const updated = await operation(tx, current, safeKey);
      return this.toView(updated, role);
    }, 'Support Request vừa được cập nhật bởi thao tác khác.');
  }

  private async list(base: Prisma.SupportRequestWhereInput, query: SupportListQuery, mode: ViewMode) {
    const where: Prisma.SupportRequestWhereInput = { ...base, ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}), ...(query.category ? { category: query.category } : {}), ...(query.search ? { OR: [
      { supportCode: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } }, { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { customer: { email: { contains: query.search, mode: 'insensitive' } } }, { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } },
    ] } : {}) };
    const [total, records] = await this.prisma.$transaction([this.prisma.supportRequest.count({ where }), this.prisma.supportRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() })]);
    return { page: query.page, limit: query.limit, total, items: records.map((item) => this.toView(item, mode)) };
  }

  private include(): Prisma.SupportRequestInclude { return {
    customer: { select: { id: true, fullName: true, email: true, phone: true } },
    reservation: { select: { id: true, reservationCode: true, status: true, quoteSnapshot: true } },
    rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true } },
    storageUnit: { include: { storageType: { select: { id: true, code: true, name: true } }, maintenanceRequests: { where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'] } }, take: 1, select: { id: true, maintenanceCode: true, status: true, priority: true } }, reservationUnits: { where: { releasedAt: null, reservation: { status: 'CONFIRMED' }, plannedStartDate: { gt: new Date() } }, include: { reservation: { select: { reservationCode: true } } }, orderBy: { plannedStartDate: 'asc' } } } },
    invoice: { select: { id: true, invoiceCode: true, status: true } }, assignedStaff: { select: { id: true, fullName: true, role: true } },
    escalatedBy: { select: { id: true, fullName: true, role: true } }, resolvedBy: { select: { id: true, fullName: true, role: true } },
  } }

  private toView(record: any, mode: ViewMode) {
    const base = { id: record.id, supportCode: record.supportCode, category: record.category, priority: record.priority, status: record.status, subject: record.subject, description: record.description, reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, status: record.reservation.status }, contract: record.rentalContract, unit: record.storageUnit ? { id: record.storageUnit.id, unitCode: record.storageUnit.unitNumber, status: record.storageUnit.status, floor: record.storageUnit.floor, zone: record.storageUnit.zone, row: record.storageUnit.row, position: record.storageUnit.position, storageType: record.storageUnit.storageType } : null, invoice: record.invoice, startedAt: record.startedAt?.toISOString() ?? null, resolvedAt: record.resolvedAt?.toISOString() ?? null, resolutionType: record.resolutionType, resolutionNote: record.resolutionNote, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
    if (mode === 'CUSTOMER') return base;
    const operational = { ...base, customer: record.customer, assignedStaff: record.assignedStaff, escalatedAt: record.escalatedAt?.toISOString() ?? null, escalationReason: record.escalationReason, escalatedBy: record.escalatedBy, resolvedBy: record.resolvedBy };
    if (mode === 'STAFF') return operational;
    const future = record.storageUnit?.reservationUnits.map((item: any) => ({ reservationReference: item.reservation.reservationCode, startDate: this.date(item.plannedStartDate), endDate: this.date(item.plannedEndDate) })) ?? [];
    return { ...operational, activeMaintenance: record.storageUnit?.maintenanceRequests[0] ?? null, hasFutureAllocation: future.length > 0, nextConfirmedAllocation: future[0] ?? null, futureAllocations: future };
  }

  private createInput(input: Record<string, unknown>, key: string | undefined) {
    const category = input.category;
    if (typeof category !== 'string' || ![...operationalCategories, 'PAYMENT_SUPPORT', 'OTHER'].includes(category as SupportCategory)) throw new BadRequestException('category không hợp lệ.');
    return { reservationId: this.id(input.reservationId, 'reservationId'), rentalContractId: this.optionalId(input.rentalContractId, 'rentalContractId'), storageUnitId: this.optionalId(input.storageUnitId, 'storageUnitId'), invoiceId: this.optionalId(input.invoiceId, 'invoiceId'), category: category as SupportCategory, subject: this.text(input.subject, 200, 'subject'), description: this.text(input.description, 4000, 'description'), idempotencyKey: this.key(key) };
  }
  private resolutionInput(input: Record<string, unknown>, allowed: readonly string[]) { const type = input.resolutionType; if (typeof type !== 'string' || !allowed.includes(type)) throw new BadRequestException('resolutionType không được phép.'); return { resolutionType: type as any, resolutionNote: this.text(input.resolutionNote, 4000, 'resolutionNote') }; }
  private assertCreateRetry(record: any, parsed: any, customerId: string) { const reservationMatches = record.reservationId === parsed.reservationId || record.reservation.reservationCode === parsed.reservationId; if (record.customerUserId !== customerId || !reservationMatches || record.category !== parsed.category || record.subject !== parsed.subject || record.description !== parsed.description || (parsed.rentalContractId && ![record.rentalContractId, record.rentalContract?.contractCode].includes(parsed.rentalContractId)) || (parsed.storageUnitId && ![record.storageUnitId, record.storageUnit?.unitNumber].includes(parsed.storageUnitId)) || (parsed.invoiceId && record.invoiceId !== parsed.invoiceId)) throw new ConflictException('Idempotency-Key đã được dùng cho Support Request khác.'); return this.toView(record, 'CUSTOMER'); }
  private assertAssigned(record: any, actor: PublicUser) { if (!record.assignedStaffUserId || record.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được assign mới có thể xử lý request này.'); }
  private assertUnresolved(record: any) { if (record.status === 'RESOLVED') throw new ConflictException('Support Request RESOLVED là trạng thái cuối.'); }
  private async identity(id: string) { const item = await this.prisma.supportRequest.findFirst({ where: { OR: [{ id }, { supportCode: id }] }, select: { id: true } }); if (!item) throw new NotFoundException('Không tìm thấy Support Request.'); return item; }
  private async find(id: string, db: PrismaService | Prisma.TransactionClient) { const item = await db.supportRequest.findFirst({ where: { OR: [{ id }, { supportCode: id }] }, include: this.include() }); if (!item) throw new NotFoundException('Không tìm thấy Support Request.'); return item; }
  private id(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
  private optionalId(value: unknown, label: string) { return value === undefined || value === null || value === '' ? null : this.id(value, label); }
  private text(value: unknown, max: number, label: string) { if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > max) throw new BadRequestException(`${label} phải dài từ 3–${max} ký tự.`); return value.trim(); }
  private key(value: string | undefined) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.'); return key; }
  private code() { return `WDP-SUP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`; }
  private date(value: Date) { return value.toISOString().slice(0, 10); }
  private isPrismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) { for (let attempt = 0; attempt < 3; attempt += 1) { try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); } catch (error) { if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue; if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(message); throw error; } } throw new ConflictException(message); }
}
