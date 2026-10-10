import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'COMPLETED';
type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH';
type MaintenanceCategory = 'UNIT_DAMAGE' | 'CLEANING' | 'LOCK_OR_ACCESS' | 'FACILITY_EQUIPMENT' | 'OTHER';
type ViewMode = 'STAFF' | 'MANAGER';

export interface MaintenanceListQuery {
  page: number;
  limit: number;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  category?: MaintenanceCategory;
  assignedToMe?: boolean;
  search?: string;
}

const unresolvedStatuses: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'];

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  createManual(input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    if (!['STAFF', 'MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Bạn không có quyền báo maintenance.');
    const parsed = this.manualInput(input, key);
    return this.createManualTransaction(parsed, actor);
  }

  listStaff(query: MaintenanceListQuery, actor: PublicUser) {
    return this.list(query, 'STAFF', query.assignedToMe ? actor.id : undefined);
  }

  listManager(query: MaintenanceListQuery) {
    return this.list(query, 'MANAGER');
  }

  async getStaff(id: string) {
    return this.toMaintenance(await this.find(id, this.prisma), 'STAFF');
  }

  async getManager(id: string) {
    return this.toMaintenance(await this.find(id, this.prisma), 'MANAGER');
  }

  assign(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const staffUserId = this.requiredText(input.staffUserId, 100, 'staffUserId');
    return this.transition(id, key, 'ASSIGN', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      const staff = await tx.user.findUnique({ where: { id: staffUserId }, select: { id: true, role: true } });
      if (!staff || staff.role !== 'STAFF') throw new BadRequestException('Chỉ có thể giao maintenance cho tài khoản STAFF hợp lệ.');
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { assignedStaffUserId: staff.id, lastAction: 'ASSIGN', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'MANAGER');
  }

  updatePriority(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const priority = input.priority;
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(String(priority))) throw new BadRequestException('priority không hợp lệ.');
    return this.transition(id, key, 'PRIORITY', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { priority: priority as MaintenancePriority, lastAction: 'PRIORITY', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'MANAGER');
  }

  start(id: string, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'START', async (tx, current, safeKey) => {
      if (actor.role !== 'STAFF') throw new ForbiddenException('Chỉ Staff được bắt đầu công việc được giao.');
      if (current.status !== 'OPEN') throw new ConflictException(`Chỉ maintenance OPEN mới có thể bắt đầu; trạng thái hiện tại là ${current.status}.`);
      if (!current.assignedStaffUserId) throw new ConflictException({ code: 'MAINTENANCE_ASSIGNMENT_REQUIRED', message: 'Manager phải giao Staff trước khi bắt đầu.' });
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới có thể bắt đầu công việc này.');
      this.assertUnitMaintenance(current);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), lastAction: 'START', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'STAFF');
  }

  completeWork(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const workNote = this.requiredText(input.workNote, 4000, 'workNote');
    return this.transition(id, key, 'COMPLETE_WORK', async (tx, current, safeKey) => {
      if (actor.role !== 'STAFF') throw new ForbiddenException('Chỉ Staff được hoàn tất công việc được giao.');
      if (current.status !== 'IN_PROGRESS') throw new ConflictException(`Chỉ maintenance IN_PROGRESS mới có thể gửi xác minh; trạng thái hiện tại là ${current.status}.`);
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới có thể hoàn tất công việc này.');
      this.assertUnitMaintenance(current);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'AWAITING_VERIFICATION', workCompletedAt: new Date(), workNote, lastAction: 'COMPLETE_WORK', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'STAFF');
  }

  verify(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.optionalText(input.note, 4000, 'note');
    return this.transition(id, key, 'VERIFY', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể xác minh; trạng thái hiện tại là ${current.status}.`);
      this.assertUnitMaintenance(current);
      const otherActive = await tx.maintenanceRequest.count({ where: { storageUnitId: current.storageUnitId, activeKey: { not: null }, id: { not: current.id } } });
      if (otherActive !== 0) throw new ConflictException('StorageUnit có maintenance case khác đang hoạt động.');
      const changed = await tx.storageUnit.updateMany({ where: { id: current.storageUnitId, status: 'MAINTENANCE' }, data: { status: 'AVAILABLE' } });
      if (changed.count !== 1) throw new ConflictException('StorageUnit không còn ở trạng thái MAINTENANCE.');
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED', activeKey: null, verifiedByUserId: actor.id, verifiedAt: new Date(), verificationNote: note,
          lastAction: 'VERIFY', lastActionIdempotencyKey: safeKey,
        },
        include: this.include(),
      });
    }, actor, 'MANAGER');
  }

  rejectVerification(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const note = this.requiredText(input.note, 4000, 'note');
    return this.transition(id, key, 'REJECT_VERIFICATION', async (tx, current, safeKey) => {
      if (current.status !== 'AWAITING_VERIFICATION') throw new ConflictException(`Chỉ maintenance AWAITING_VERIFICATION mới có thể bị trả lại; trạng thái hiện tại là ${current.status}.`);
      this.assertUnitMaintenance(current);
      return tx.maintenanceRequest.update({
        where: { id: current.id },
        data: { status: 'IN_PROGRESS', verificationNote: note, lastAction: 'REJECT_VERIFICATION', lastActionIdempotencyKey: safeKey },
        include: this.include(),
      });
    }, actor, 'MANAGER');
  }

  private async createManualTransaction(parsed: ReturnType<MaintenanceService['manualInput']>, actor: PublicUser) {
    const existing = await this.prisma.maintenanceRequest.findUnique({ where: { createIdempotencyKey: parsed.idempotencyKey }, include: this.include() });
    if (existing) return this.assertCreateRetry(existing, parsed, actor);
    try {
      return await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${parsed.storageUnitId} FOR UPDATE`);
        const unit = await tx.storageUnit.findUnique({ where: { id: parsed.storageUnitId } });
        if (!unit) throw new NotFoundException('Không tìm thấy StorageUnit.');
        if (unit.status === 'OCCUPIED') throw new ConflictException({ code: 'OCCUPIED_UNIT_MAINTENANCE_REQUIRES_INCIDENT_FLOW', message: 'Kho đang được thuê phải đi qua Support / Incident / Transfer workflow.' });
        if (unit.status !== 'AVAILABLE') throw new ConflictException({ code: 'UNIT_NOT_AVAILABLE_FOR_MANUAL_MAINTENANCE', message: `Chỉ unit AVAILABLE mới được tạo manual maintenance; trạng thái hiện tại là ${unit.status}.` });
        if (await tx.maintenanceRequest.findUnique({ where: { activeKey: this.activeKey(unit.id) } })) throw new ConflictException('StorageUnit đã có maintenance case đang hoạt động.');
        const changed = await tx.storageUnit.updateMany({ where: { id: unit.id, status: 'AVAILABLE' }, data: { status: 'MAINTENANCE' } });
        if (changed.count !== 1) throw new ConflictException('StorageUnit vừa được thay đổi bởi thao tác khác.');
        const created = await tx.maintenanceRequest.create({
          data: {
            maintenanceCode: this.code(), storageUnitId: unit.id, source: 'MANUAL', category: parsed.category, priority: parsed.priority,
            description: parsed.description, reportedByUserId: actor.id, activeKey: this.activeKey(unit.id), createIdempotencyKey: parsed.idempotencyKey,
          },
          include: this.include(),
        });
        return this.toMaintenance(created, actor.role === 'STAFF' ? 'STAFF' : 'MANAGER');
      }, 'StorageUnit vừa được đưa vào maintenance bởi thao tác khác.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const retry = await this.prisma.maintenanceRequest.findUnique({ where: { createIdempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (retry) return this.assertCreateRetry(retry, parsed, actor);
        throw new ConflictException('StorageUnit đã có maintenance case đang hoạt động.');
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
    role: 'STAFF' | 'MANAGER',
  ) {
    if (role === 'MANAGER' && !['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được thực hiện thao tác này.');
    const safeKey = this.idempotencyKey(key);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MaintenanceRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.maintenanceRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy maintenance case.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${current.storageUnitId} FOR UPDATE`);
      if (current.lastAction === action && current.lastActionIdempotencyKey === safeKey) return this.toMaintenance(current, role);
      const reused = await tx.maintenanceRequest.findUnique({ where: { lastActionIdempotencyKey: safeKey }, select: { id: true } });
      if (reused) throw new ConflictException('Idempotency-Key đã được dùng cho thao tác maintenance khác.');
      const updated = await operation(tx, current, safeKey);
      return this.toMaintenance(updated, role);
    }, 'Maintenance case vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.');
  }

  private async list(query: MaintenanceListQuery, mode: ViewMode, assignedStaffUserId?: string) {
    const where: Prisma.MaintenanceRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(assignedStaffUserId ? { assignedStaffUserId } : {}),
      ...(query.search ? { OR: [
        { maintenanceCode: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { storageUnit: { is: { OR: [
          { unitNumber: { contains: query.search, mode: 'insensitive' } },
          { floor: { contains: query.search, mode: 'insensitive' } },
          { zone: { contains: query.search, mode: 'insensitive' } },
        ] } } },
      ] } : {}),
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toMaintenance(record, mode)) };
  }

  private include(): Prisma.MaintenanceRequestInclude {
    return {
      storageUnit: {
        include: {
          storageType: true,
          reservationUnits: {
            where: { releasedAt: null, reservation: { status: 'CONFIRMED' }, plannedStartDate: { gt: new Date() } },
            include: { reservation: { select: { id: true, reservationCode: true } } },
            orderBy: [{ plannedStartDate: 'asc' }, { id: 'asc' }],
          },
        },
      },
      reportedBy: { select: { id: true, fullName: true, role: true } },
      assignedStaff: { select: { id: true, fullName: true, role: true } },
      verifiedBy: { select: { id: true, fullName: true, role: true } },
      returnInspection: { include: { returnRequest: { select: { id: true, returnCode: true } } } },
    };
  }

  private toMaintenance(record: any, mode: ViewMode) {
    const future = record.storageUnit.reservationUnits.map((allocation: any) => ({
      reservationId: allocation.reservation.id,
      reservationReference: allocation.reservation.reservationCode,
      startDate: this.isoDate(allocation.plannedStartDate),
      endDate: this.isoDate(allocation.plannedEndDate),
    }));
    const base = {
      id: record.id, maintenanceCode: record.maintenanceCode, status: record.status, priority: record.priority, category: record.category,
      source: record.source, description: record.description,
      unit: {
        id: record.storageUnit.id, unitCode: record.storageUnit.unitNumber, status: record.storageUnit.status,
        floor: record.storageUnit.floor, zone: record.storageUnit.zone, row: record.storageUnit.row, position: record.storageUnit.position,
        storageType: { id: record.storageUnit.storageType.id, code: record.storageUnit.storageType.code, name: record.storageUnit.storageType.name },
      },
      assignedStaff: record.assignedStaff, startedAt: record.startedAt?.toISOString() ?? null,
      workCompletedAt: record.workCompletedAt?.toISOString() ?? null, workNote: record.workNote,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    };
    if (mode === 'STAFF') return base;
    return {
      ...base, reportedBy: record.reportedBy, verificationNote: record.verificationNote, verifiedBy: record.verifiedBy,
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      returnContext: record.returnInspection ? {
        inspectionId: record.returnInspection.id, result: record.returnInspection.result, issueType: record.returnInspection.issueType,
        conditionNote: record.returnInspection.conditionNote, issueNote: record.returnInspection.issueNote,
        returnRequest: record.returnInspection.returnRequest,
      } : null,
      hasFutureAllocation: future.length > 0, nextConfirmedAllocation: future[0] ?? null, futureAllocations: future,
    };
  }

  private manualInput(input: Record<string, unknown>, key: string | undefined) {
    const storageUnitId = this.requiredText(input.storageUnitId, 100, 'storageUnitId');
    const description = this.requiredText(input.description, 4000, 'description');
    const category = input.category;
    const priority = input.priority ?? 'MEDIUM';
    if (typeof category !== 'string' || !['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'].includes(category)) throw new BadRequestException('category không hợp lệ.');
    if (typeof priority !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) throw new BadRequestException('priority không hợp lệ.');
    return { storageUnitId, description, category: category as MaintenanceCategory, priority: priority as MaintenancePriority, idempotencyKey: this.idempotencyKey(key) };
  }

  private assertCreateRetry(record: any, parsed: ReturnType<MaintenanceService['manualInput']>, actor: PublicUser) {
    if (record.source !== 'MANUAL' || record.storageUnitId !== parsed.storageUnitId || record.category !== parsed.category || record.priority !== parsed.priority || record.description !== parsed.description || record.reportedByUserId !== actor.id) {
      throw new ConflictException('Idempotency-Key đã được dùng cho maintenance request khác.');
    }
    return this.toMaintenance(record, actor.role === 'STAFF' ? 'STAFF' : 'MANAGER');
  }

  private assertUnresolved(record: any) {
    if (!unresolvedStatuses.includes(record.status)) throw new ConflictException('Maintenance đã hoàn tất và không thể thay đổi.');
  }

  private assertUnitMaintenance(record: any) {
    if (record.storageUnit.status !== 'MAINTENANCE') throw new ConflictException('StorageUnit không còn ở trạng thái MAINTENANCE.');
  }

  private async identity(id: string) {
    const record = await this.prisma.maintenanceRequest.findFirst({ where: { OR: [{ id }, { maintenanceCode: id }] }, select: { id: true } });
    if (!record) throw new NotFoundException('Không tìm thấy maintenance case.');
    return record;
  }

  private async find(id: string, db: PrismaService | Prisma.TransactionClient) {
    const record = await db.maintenanceRequest.findFirst({ where: { OR: [{ id }, { maintenanceCode: id }] }, include: this.include() });
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
    return value.trim();
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
