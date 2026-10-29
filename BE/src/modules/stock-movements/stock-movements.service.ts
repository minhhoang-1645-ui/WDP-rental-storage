import { Optional } from '@nestjs/common';
import { UnitStaffService } from '../unit-staff/unit-staff.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type ListQuery = { page: number; limit: number; status?: 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED'; type?: 'IN' | 'OUT'; search?: string; rentalContractId?: string };
type ParsedLine = { storedItemId?: string; name?: string; unit?: string; quantity: number; note: string | null };

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly unitStaff?: UnitStaffService) {}

  listCustomer(customerId: string, query: ListQuery) { return this.page({ customerUserId: customerId }, query); }
  listManager(query: ListQuery) { return this.page({}, query); }
  listStaff(actor: PublicUser, query: ListQuery) { return this.page({ assignedStaffUserId: actor.id }, query); }

  async getCustomer(customerId: string, id: string) { return this.find(id, { customerUserId: customerId }); }
  async getManager(id: string) { return this.find(id, {}); }
  async getStaff(actor: PublicUser, id: string) { return this.find(id, { assignedStaffUserId: actor.id }); }

  async listStoredItems(customerId: string, contractId?: string) {
    return this.prisma.storedItem.findMany({
      where: { customerUserId: customerId, ...(contractId ? { rentalContract: { OR: [{ id: contractId }, { contractCode: contractId }] } } : {}), balance: { gt: 0 } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, itemCode: true, name: true, unit: true, balance: true, note: true, rentalContract: { select: { id: true, contractCode: true } } },
    });
  }

  async create(customer: PublicUser, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const parsed = this.createInput(input, idempotencyKey);
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id: parsed.contractId }, { contractCode: parsed.contractId }], reservation: { customerId: customer.id } },
      select: { id: true, status: true, reservationUnit: { select: { storageUnitId: true } } },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng thuê của khách hàng.');
    const duplicate = await this.prisma.stockMovement.findUnique({ where: { idempotencyKey: parsed.key }, include: this.include() });
    if (duplicate) return this.matchingRetry(duplicate, customer.id, contract.id, parsed);
    if (contract.status !== 'ACTIVE') throw new ConflictException({ code: 'STOCK_MOVEMENT_REQUIRES_ACTIVE_CONTRACT', message: 'Chỉ hợp đồng ACTIVE mới được tạo phiếu nhập/xuất hàng.' });

    return this.serializable(async (tx) => {
      const activeContract = await tx.rentalContract.findUnique({ where: { id: contract.id }, select: { status: true } });
      if (activeContract?.status !== 'ACTIVE') throw new ConflictException('Hợp đồng vừa kết thúc. Không thể tạo phiếu hàng mới.');
      const responsibility = await this.unitStaff?.resolveStaff(tx, [contract.reservationUnit.storageUnitId]);
      const movement = await tx.stockMovement.create({
        data: {
          movementCode: this.code(), type: parsed.type, customerUserId: customer.id, rentalContractId: contract.id,
          ...(responsibility ? { assignedStaffUserId: responsibility.staffUserId, assignedByUserId: responsibility.assignedByUserId, assignedAt: new Date(), status: 'ASSIGNED' as const } : {}), scheduledAt: parsed.scheduledAt, note: parsed.note, idempotencyKey: parsed.key,
        },
      });
      for (const line of parsed.lines) {
        let item;
        if (line.storedItemId) {
          item = await tx.storedItem.findFirst({ where: { id: line.storedItemId, customerUserId: customer.id, rentalContractId: contract.id } });
          if (!item) throw new BadRequestException('storedItemId không thuộc hợp đồng hiện tại.');
        } else {
          if (parsed.type !== 'IN' || !line.name || !line.unit) throw new BadRequestException('Phiếu OUT phải chọn mặt hàng đã lưu; phiếu IN mới phải có name và unit.');
          item = await tx.storedItem.create({ data: { itemCode: this.itemCode(), customerUserId: customer.id, rentalContractId: contract.id, name: line.name, unit: line.unit, note: line.note } });
        }
        await tx.stockMovementLine.create({ data: { stockMovementId: movement.id, storedItemId: item.id, requestedQty: line.quantity, note: line.note } });
      }
      return this.view(await tx.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, include: this.include() }));
    });
  }

  async assign(id: string, staffUserId: string, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ quản lý được phân công nhân viên.');
    const staff = await this.prisma.user.findFirst({ where: { id: staffUserId, role: 'STAFF', accountStatus: 'ACTIVE' }, select: { id: true } });
    if (!staff) throw new BadRequestException('Nhân viên được giao phải là STAFF đang hoạt động.');
    return this.serializable(async (tx) => {
      const current = await this.lock(tx, id);
      if (!['REQUESTED', 'ASSIGNED'].includes(current.status)) throw new ConflictException('Chỉ phiếu đang chờ mới được phân công.');
      return this.view(await tx.stockMovement.update({ where: { id: current.id }, data: { status: 'ASSIGNED', assignedStaffUserId: staff.id, assignedByUserId: actor.id, assignedAt: new Date() }, include: this.include() }));
    });
  }

  async complete(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'STAFF') throw new ForbiddenException('Chỉ nhân viên được giao mới được hoàn tất phiếu.');
    const actual = this.actualLines(input.lines);
    const completionNote = this.optionalText(input.note, 2000, 'note');
    return this.serializable(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được giao mới được hoàn tất phiếu.');
      if (current.status === 'COMPLETED') return this.view(await tx.stockMovement.findUniqueOrThrow({ where: { id: current.id }, include: this.include() }));
      if (current.status !== 'ASSIGNED') throw new ConflictException('Chỉ phiếu ASSIGNED mới được hoàn tất.');
      const contract = await tx.rentalContract.findUnique({ where: { id: current.rentalContractId }, select: { status: true } });
      if (contract?.status !== 'ACTIVE') throw new ConflictException('Hợp đồng đã kết thúc; không thể thay đổi tồn hàng sau trả kho.');
      const lines = await tx.stockMovementLine.findMany({ where: { stockMovementId: current.id }, include: { storedItem: true }, orderBy: { id: 'asc' } });
      if (!lines.length) throw new ConflictException('Phiếu không có dòng hàng.');
      if ([...actual.keys()].some(lineId => !lines.some(line => line.id === lineId))) throw new BadRequestException('Kết quả kiểm đếm chứa dòng không thuộc phiếu.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StoredItem" WHERE "id" IN (${Prisma.join(lines.map((line) => line.storedItemId))}) ORDER BY "id" FOR UPDATE`);
      for (const line of lines) {
        const quantity = actual.get(line.id) ?? line.requestedQty;
        if (current.type === 'OUT') {
          const changed = await tx.storedItem.updateMany({ where: { id: line.storedItemId, balance: { gte: quantity } }, data: { balance: { decrement: quantity } } });
          if (!changed.count) throw new ConflictException({ code: 'INSUFFICIENT_STORED_ITEM_BALANCE', message: `Không đủ tồn cho ${line.storedItem.itemCode}.` });
        } else await tx.storedItem.update({ where: { id: line.storedItemId }, data: { balance: { increment: quantity } } });
        await tx.stockMovementLine.update({ where: { id: line.id }, data: { actualQty: quantity } });
      }
      return this.view(await tx.stockMovement.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedByUserId: actor.id, completedAt: new Date(), completionNote }, include: this.include() }));
    });
  }

  private async page(base: Prisma.StockMovementWhereInput, query: ListQuery) {
    const where: Prisma.StockMovementWhereInput = { ...base, ...(query.rentalContractId ? { rentalContractId: query.rentalContractId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}), ...(query.search ? { OR: [{ movementCode: { contains: query.search, mode: 'insensitive' } }, { rentalContract: { contractCode: { contains: query.search, mode: 'insensitive' } } }, { customer: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {}) };
    const [total, items] = await Promise.all([this.prisma.stockMovement.count({ where }), this.prisma.stockMovement.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() })]);
    return { page: query.page, limit: query.limit, total, items: items.map((item) => this.view(item)) };
  }

  private matchingRetry(item: any, customerId: string, contractId: string, parsed: ReturnType<StockMovementsService['createInput']>) {
    const expected = parsed.lines.map(line => JSON.stringify([line.storedItemId || `${line.name}:${line.unit}`, line.quantity, line.note])).sort();
    const actual = item.lines.map((line: any) => JSON.stringify([parsed.lines.some(input => input.storedItemId === line.storedItemId) ? line.storedItemId : `${line.storedItem.name}:${line.storedItem.unit}`, line.requestedQty, line.note])).sort();
    if (item.customerUserId !== customerId || item.rentalContractId !== contractId || item.type !== parsed.type || (item.note ?? null) !== parsed.note || (item.scheduledAt?.toISOString() ?? null) !== (parsed.scheduledAt?.toISOString() ?? null) || JSON.stringify(expected) !== JSON.stringify(actual)) throw new ConflictException('Idempotency-Key đã dùng cho một yêu cầu khác.');
    return this.view(item);
  }

  private async find(id: string, extra: Prisma.StockMovementWhereInput) {
    const item = await this.prisma.stockMovement.findFirst({ where: { AND: [{ OR: [{ id }, { movementCode: id }] }, extra] }, include: this.include() });
    if (!item) throw new NotFoundException('Không tìm thấy phiếu nhập/xuất hàng.');
    return this.view(item);
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    const identity = await tx.stockMovement.findFirst({ where: { OR: [{ id }, { movementCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy phiếu nhập/xuất hàng.');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockMovement" WHERE "id" = ${identity.id} FOR UPDATE`);
    return tx.stockMovement.findUniqueOrThrow({ where: { id: identity.id } });
  }

  private include() { return { customer: { select: { id: true, fullName: true, email: true, phone: true } }, rentalContract: { select: { id: true, contractCode: true, status: true } }, assignedStaff: { select: { id: true, fullName: true, accountStatus: true } }, assignedBy: { select: { id: true, fullName: true } }, completedBy: { select: { id: true, fullName: true } }, lines: { include: { storedItem: { select: { id: true, itemCode: true, name: true, unit: true, balance: true } } }, orderBy: { id: 'asc' as const } } }; }
  private view(item: any) { return { id: item.id, movementCode: item.movementCode, type: item.type, status: item.status, customer: item.customer, rentalContract: item.rentalContract, scheduledAt: item.scheduledAt?.toISOString() ?? null, note: item.note, assignedStaff: item.assignedStaff, assignedBy: item.assignedBy, assignedAt: item.assignedAt?.toISOString() ?? null, completedBy: item.completedBy, completedAt: item.completedAt?.toISOString() ?? null, completionNote: item.completionNote, lines: item.lines.map((line: any) => ({ id: line.id, storedItem: line.storedItem, requestedQty: line.requestedQty, actualQty: line.actualQty, note: line.note })), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }; }

  private createInput(input: Record<string, unknown>, idempotencyKey?: string) {
    const contractId = this.requiredText(input.rentalContractId, 200, 'rentalContractId');
    const type: 'IN' | 'OUT' | null = input.type === 'IN' || input.type === 'OUT' ? input.type : null;
    if (!type) throw new BadRequestException('type phải là IN hoặc OUT.');
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new BadRequestException('lines phải có 1–100 dòng.');
    const lines: ParsedLine[] = input.lines.map((raw) => { const line = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; const quantity = Number(line.quantity); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new BadRequestException('quantity phải là số nguyên dương.'); return { ...(line.storedItemId ? { storedItemId: this.requiredText(line.storedItemId, 200, 'storedItemId') } : {}), ...(line.name ? { name: this.requiredText(line.name, 160, 'name') } : {}), ...(line.unit ? { unit: this.requiredText(line.unit, 40, 'unit') } : {}), quantity, note: this.optionalText(line.note, 500, 'line.note') }; });
    const scheduledAt = input.scheduledAt ? new Date(this.requiredText(input.scheduledAt, 60, 'scheduledAt')) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('scheduledAt không hợp lệ.');
    const key = idempotencyKey?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key không hợp lệ.');
    return { contractId, type, lines, scheduledAt, note: this.optionalText(input.note, 2000, 'note'), key };
  }
  private actualLines(value: unknown) { const map = new Map<string, number>(); if (value === undefined) return map; if (!Array.isArray(value)) throw new BadRequestException('lines không hợp lệ.'); for (const raw of value) { const line = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; const id = this.requiredText(line.lineId, 200, 'lineId'); const quantity = Number(line.actualQty); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new BadRequestException('actualQty phải là số nguyên dương.'); map.set(id, quantity); } return map; }
  private requiredText(value: unknown, max: number, label: string) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
  private optionalText(value: unknown, max: number, label: string) { if (value === undefined || value === null || value === '') return null; return this.requiredText(value, max, label); }
  private code() { return `WDP-MOV-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private itemCode() { return `WDP-ITEM-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) { try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Dữ liệu phiếu vừa được cập nhật. Vui lòng thử lại.'); throw error; } }
}
