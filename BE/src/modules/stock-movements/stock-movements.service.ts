import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTaskExecution, facilityScope, reservationScope, staffUnitScope } from '../facility-access/task-access.js';
import { assertAssignmentAccess } from '../facility-access/facility-access.service.js';
import { customerPhotos } from '../../customer-photos.js';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isItemUnit } from './item-units.js';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type ListQuery = { page: number; limit: number; status?: 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED'; type?: 'IN' | 'OUT'; search?: string; rentalContractId?: string };
type ParsedLine = { storedItemId?: string; name?: string; unit?: string; quantity: number; note: string | null; photos: string[] };
type ItemQuery = { page: number; limit: number; search?: string; storageUnitId?: string };
type MovementRecord = Prisma.StockMovementGetPayload<{ include: ReturnType<StockMovementsService['include']> }>;

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomer(customerId: string, query: ListQuery) { return this.page({ customerUserId: customerId }, query); }
  async listManager(query: ListQuery, actor: PublicUser) {
    return actor?.role === 'FACILITY_STAFF' ? this.listStaff(actor, query) : this.page({rentalContract:{reservation:reservationScope(actor)}}, query);
  }
  async listStaff(actor: PublicUser, query: ListQuery) {
    return this.page({ assignedStaffUserId: actor.id,rentalContract:{reservation:reservationScope(actor)} }, query, actor);
  }

  async getCustomer(customerId: string, id: string) { return this.find(id, { customerUserId: customerId }); }
  async getManager(id: string, actor: PublicUser) {
    return actor?.role === 'FACILITY_STAFF' ? this.getStaff(actor, id) : this.find(id, {rentalContract:{reservation:reservationScope(actor)}});
  }
  async getStaff(actor: PublicUser, id: string) {
    const item = await this.findRecord(id, { assignedStaffUserId: actor.id,rentalContract:{reservation:reservationScope(actor)} });
    const [visible, previousAssignments] = await Promise.all([
      this.currentStaffItems(this.prisma, actor.id, [item]),
      item.assignedAt ? this.prisma.auditEvent.findMany({
        where: {
          category: 'ACTIVITY', outcome: 'SUCCESS', action: 'ASSIGN', resource: 'stock-movements',
          resourceId: { in: [item.id, item.movementCode] }, createdAt: { lt: item.assignedAt },
        },
        select: { id: true, actorName: true, createdAt: true },
      }) : [],
    ]);
    const events = [
      { id: 'create', label: 'Tạo phiếu', at: item.createdAt, actor: item.customer.fullName },
      ...previousAssignments.map(event => ({ id: event.id, label: 'Phân công', at: event.createdAt, actor: event.actorName })),
      ...(item.assignedAt ? [{ id: 'assign', label: 'Phân công', at: item.assignedAt, actor: item.assignedBy?.fullName ?? null }] : []),
      ...(item.status === 'COMPLETED' && item.completedAt ? [{ id: 'complete', label: 'Hoàn tất giao nhận', at: item.completedAt, actor: item.completedBy?.fullName ?? null }] : []),
    ];
    return {
      ...this.staffView(item, visible),
      history: events.sort((a, b) => +b.at - +a.at || b.id.localeCompare(a.id))
        .map(event => ({ ...event, at: event.at.toISOString() })),
    };
  }

  async listStoredItems(customerId: string, contractId?: string) {
    const items = await this.prisma.storedItem.findMany({
      where: { customerUserId: customerId, ...(contractId ? { rentalContract: { OR: [{ id: contractId }, { contractCode: contractId }] } } : {}), balance: { gt: 0 } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, itemCode: true, name: true, unit: true, balance: true, note: true, rentalContract: { select: { id: true, contractCode: true, reservationUnit: { select: { storageUnit: { select: this.unitSelect() } } } } } },
    });
    return items.map(({ rentalContract, ...item }) => ({ ...item, rentalContract: { id: rentalContract.id, contractCode: rentalContract.contractCode }, storageUnit: rentalContract.reservationUnit.storageUnit }));
  }

  async listOperationalStoredItems(actor: PublicUser, query: ItemQuery) {
    if (!['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(actor.role)) throw new ForbiddenException('Chỉ nhân viên và quản lý được tra cứu hàng.');
    const scope = actor.role === 'FACILITY_STAFF' ? await this.staffInventoryScope(this.prisma, actor.id, { storageUnitId: query.storageUnitId }) : {rentalContract:{reservation:reservationScope(actor)}};
    if (!scope) {
      if (query.storageUnitId) throw new ForbiddenException('Bạn không có quyền xem hàng tại kho này.');
      return { page: query.page, limit: query.limit, total: 0, items: [], selectedStorageUnit: undefined };
    }
    const selectedStorageUnit = actor.role === 'FACILITY_STAFF' && query.storageUnitId
      ? await this.prisma.storageUnit.findFirst({
        where: { id: query.storageUnitId, AND:[staffUnitScope(actor)], OR: [

          { reservationUnits: { some: { contract: { storedItems: { some: scope } } } } },
        ] },
        select: this.unitSelect(),
      })
      : null;
    if (actor.role === 'FACILITY_STAFF' && query.storageUnitId && !selectedStorageUnit) {
      throw new ForbiddenException('Bạn không có quyền xem hàng tại kho này.');
    }
    const match = query.search ? { contains: query.search, mode: 'insensitive' as const } : undefined;
    const where: Prisma.StoredItemWhereInput = {
      balance: { gt: 0 },
      AND: [scope],
      ...(query.storageUnitId ? { rentalContract: { reservationUnit: { storageUnitId: query.storageUnitId } } } : {}),
      ...(match ? { OR: [
        { name: match }, ...(actor.role === 'FACILITY_STAFF' ? [{ itemCode: match }] : []),
        { customer: { fullName: match } },
        { rentalContract: { reservationUnit: { storageUnit: { unitNumber: match } } } },
      ] } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.storedItem.count({ where }),
      this.prisma.storedItem.findMany({
        where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true, itemCode: true, name: true, unit: true, balance: true, note: true,
          customer: { select: { id: true, fullName: true } },
          rentalContract: { select: { id: true, contractCode: true, reservationUnit: { select: { storageUnit: { select: this.unitSelect() } } } } },
        },
      }),
    ]);
    return { page: query.page, limit: query.limit, total, ...(selectedStorageUnit ? { selectedStorageUnit } : {}), items: items.map(item => ({
      ...item, currentStorageUnit: item.rentalContract.reservationUnit.storageUnit,
    })) };
  }

  async listStaffStoredItemHistory(actor: PublicUser, id: string, { page, limit }: ItemQuery) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được tra cứu lịch sử mặt hàng.');
    const scope = await this.staffInventoryScope(this.prisma, actor.id, { itemIds: [id] });
    if (!scope) throw new NotFoundException('Không tìm thấy mặt hàng.');
    const item = await this.prisma.storedItem.findFirst({
      where: { id, AND: [scope] },
      select: { customerUserId: true, rentalContractId: true, unit: true,
        rentalContract: { select: { reservationUnit: { select: { storageUnitId: true } } } } },
    });
    if (!item) throw new NotFoundException('Không tìm thấy mặt hàng.');
    const where: Prisma.StockMovementLineWhereInput = {
      storedItemId: id,
      actualQty: { gte: 0 },
      stockMovement: {
        status: 'COMPLETED', completedAt: { not: null },
        customerUserId: item.customerUserId, rentalContractId: item.rentalContractId,
        OR: [
          { storageUnitSnapshot: { path: ['id'], equals: item.rentalContract.reservationUnit.storageUnitId } },
          { assignedStaffUserId: actor.id },
        ],
      },
    };
    const [total, lines] = await Promise.all([
      this.prisma.stockMovementLine.count({ where }),
      this.prisma.stockMovementLine.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ stockMovement: { completedAt: 'desc' } }, { id: 'desc' }],
        select: { id: true, actualQty: true, stockMovement: { select: {
          id: true, type: true, completedAt: true, movementCode: true, assignedStaffUserId: true,
        } } },
      }),
    ]);
    return { page, limit, total, items: lines.map(({ id: lineId, actualQty, stockMovement: movement }) => ({
      id: lineId, type: movement.type, actualQty, unit: item.unit, completedAt: movement.completedAt?.toISOString(),
      movementCode: movement.movementCode, movementId: movement.assignedStaffUserId === actor.id ? movement.id : null,
    })) };
  }

  private async staffInventoryScope(db: Prisma.TransactionClient, staffUserId: string, filter: { storageUnitId?: string; itemIds?: string[] } = {}): Promise<Prisma.StoredItemWhereInput | null> {
    // Task assignments grant access only to their own item lines at the current location; facility access remains mandatory.
    const grants = await db.$queryRaw<{ itemId: string; unitId: string }[]>(Prisma.sql`
      SELECT DISTINCT i."id" AS "itemId", ru."storageUnitId" AS "unitId"
      FROM "StockMovement" m
      JOIN "StockMovementLine" l ON l."stockMovementId" = m."id"
      JOIN "StoredItem" i ON i."id" = l."storedItemId"
        AND i."customerUserId" = m."customerUserId" AND i."rentalContractId" = m."rentalContractId"
      JOIN "RentalContract" c ON c."id" = i."rentalContractId"
      JOIN "ReservationUnit" ru ON ru."id" = c."reservationUnitId"
      WHERE m."assignedStaffUserId" = ${staffUserId}
        AND (
          (m."status" = 'ASSIGNED' AND c."status" = 'ACTIVE'
            AND (m."storageUnitId" IS NULL OR m."storageUnitId" = ru."storageUnitId"))
          OR (m."status" = 'COMPLETED' AND m."completedAt" IS NOT NULL
            AND m."storageUnitSnapshot"->>'id' = ru."storageUnitId")
        )
        ${filter.storageUnitId ? Prisma.sql`AND ru."storageUnitId" = ${filter.storageUnitId}` : Prisma.empty}
        ${filter.itemIds?.length ? Prisma.sql`AND i."id" IN (${Prisma.join(filter.itemIds)})` : Prisma.empty}
    `);
    const byUnit = new Map<string, string[]>();
    for (const { itemId, unitId } of grants) {
      const ids = byUnit.get(unitId) ?? [];
      ids.push(itemId);
      byUnit.set(unitId, ids);
    }
    const scope: Prisma.StoredItemWhereInput[] = Array.from(byUnit, ([unitId, ids]) => ({
      id: { in: ids }, rentalContract: { reservationUnit: { storageUnitId: unitId } },
    }));
    return scope.length ? { AND:[{OR:scope},{rentalContract:{reservation:{facility:facilityScope({id:staffUserId,role:'FACILITY_STAFF'})}}}] } : null;
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
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RentalContract" WHERE "id" = ${contract.id} FOR UPDATE`);
      const activeContract = await tx.rentalContract.findUnique({ where: { id: contract.id }, select: { status: true, startDate: true, endDate: true, reservationUnit: { select: { storageUnitId: true, storageUnit: { select: { unitNumber: true, floor: true, zone: true } } } } } });
      if (activeContract?.status !== 'ACTIVE') throw new ConflictException('Hợp đồng vừa kết thúc. Không thể tạo phiếu hàng mới.');
      const endOfTerm = Date.parse(`${activeContract.endDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
      if (Date.now() >= endOfTerm && parsed.type === 'IN') throw new ConflictException('Đã hết kỳ thuê. Bạn vẫn có thể xuất hàng để trả kho; hãy gia hạn trước khi gửi thêm hàng.');
      if (parsed.scheduledAt) {
        const time = parsed.scheduledAt.getTime();
        if (time <= Date.now()) throw new BadRequestException('Lịch dự kiến phải ở tương lai.');
        // Contract dates are date-only. The last usable instant is before midnight at the end date in Vietnam.
        const start = Date.parse(`${activeContract.startDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
        const end = Date.parse(`${activeContract.endDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
        if (time < start || parsed.type === 'IN' && time >= end) throw new BadRequestException('Lịch nhập phải trong kỳ thuê. Lịch xuất có thể sau hạn để lấy hết hàng và trả kho.');
      }
      const movement = await tx.stockMovement.create({
        data: {
          movementCode: this.code(), type: parsed.type, customerUserId: customer.id, rentalContractId: contract.id,
          storageUnitId: activeContract.reservationUnit.storageUnitId,
          unitCodeSnapshot: activeContract.reservationUnit.storageUnit.unitNumber,
          floorSnapshot: activeContract.reservationUnit.storageUnit.floor,
          zoneSnapshot: activeContract.reservationUnit.storageUnit.zone,
          locationRecordedAt: new Date(),
          scheduledAt: parsed.scheduledAt, note: parsed.note, idempotencyKey: parsed.key,
        },
      });
      for (const line of parsed.lines) {
        let item;
        if (line.storedItemId) {
          item = await tx.storedItem.findFirst({ where: { id: line.storedItemId, customerUserId: customer.id, rentalContractId: contract.id } });
          if (!item) throw new BadRequestException('storedItemId không thuộc hợp đồng hiện tại.');
        } else {
          if (parsed.type !== 'IN' || !line.name || !line.unit) throw new BadRequestException('Phiếu OUT phải chọn mặt hàng đã lưu; phiếu IN mới phải có name và unit.');
          if (!isItemUnit(line.unit)) throw new BadRequestException('Đơn vị hàng mới phải thuộc danh mục chuẩn.');
          item = await tx.storedItem.create({ data: { itemCode: this.itemCode(), customerUserId: customer.id, rentalContractId: contract.id, name: line.name, unit: line.unit, note: line.note } });
        }
        await tx.stockMovementLine.create({ data: { stockMovementId: movement.id, storedItemId: item.id, requestedQty: line.quantity, note: line.note, ...(line.photos.length ? { photos: line.photos } : {}) } });
      }
      return this.view(await tx.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, include: this.include() }));
    });
  }

  async assign(id: string, staffUserId: string, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được phân công nhân viên.');
    const staff = await this.prisma.user.findFirst({ where: { id: staffUserId, role: 'FACILITY_STAFF', accountStatus: 'ACTIVE' }, select: { id: true } });
    if (!staff) throw new BadRequestException('Nhân viên được giao phải là FACILITY_STAFF đang hoạt động.');
    return this.serializable(async (tx) => {
      const current = await this.lock(tx, id);
      if (!['REQUESTED', 'ASSIGNED'].includes(current.status)) throw new ConflictException('Chỉ phiếu đang chờ mới được phân công.');
      const staff=await assertAssignmentAccess(tx,actor,staffUserId,{rentalContractId:current.rentalContractId});
      await recordAssignment(tx,actor,"stock-movements",current.id,current.assignedStaffUserId,staff.id);
      return this.view(await tx.stockMovement.update({ where: { id: current.id }, data: { status: 'ASSIGNED', assignedStaffUserId: staff.id, assignedByUserId: actor.id, assignedAt: new Date() }, include: this.include() }));
    });
  }

  async complete(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được giao mới được hoàn tất phiếu.');
    const completionNote = this.optionalText(input.note, 2000, 'note');
    return this.serializable(async (tx) => {
      const current = await this.lock(tx, id);
      await assertTaskExecution(tx,actor,current.assignedStaffUserId,{rentalContractId:current.rentalContractId});
      if (current.status === 'COMPLETED') {
        const item = await tx.stockMovement.findUniqueOrThrow({ where: { id: current.id }, include: this.include() });
        return this.staffView(item, await this.currentStaffItems(tx, actor.id, [item]));
      }
      if (current.status !== 'ASSIGNED') throw new ConflictException('Chỉ phiếu ASSIGNED mới được hoàn tất.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RentalContract" WHERE "id" = ${current.rentalContractId} FOR UPDATE`);
      const contract = await tx.rentalContract.findUnique({ where: { id: current.rentalContractId }, select: { status: true, reservationUnit: { select: { storageUnit: { select: this.unitSelect() } } } } });
      if (contract?.status !== 'ACTIVE') throw new ConflictException('Hợp đồng đã kết thúc; không thể thay đổi tồn hàng sau trả kho.');
      const lines = await tx.stockMovementLine.findMany({ where: { stockMovementId: current.id }, include: { storedItem: true }, orderBy: { id: 'asc' } });
      if (!lines.length) throw new ConflictException('Phiếu không có dòng hàng.');
      if (lines.some(({ storedItem }) => storedItem.rentalContractId !== current.rentalContractId || storedItem.customerUserId !== current.customerUserId)) {
        throw new ConflictException('Mặt hàng không thuộc khách thuê hoặc hợp đồng của phiếu.');
      }
      if (current.storageUnitId && current.storageUnitId !== contract.reservationUnit.storageUnit.id) {
        throw new ConflictException('Kho của hợp đồng đã thay đổi. Vui lòng kiểm tra lại phiếu trước khi giao nhận.');
      }
      const actual = this.actualLines(input.lines);
      if (actual.size !== lines.length || lines.some(line => !actual.has(line.id))) throw new BadRequestException('Cần nhập số lượng thực tế cho tất cả dòng hàng.');
      if (lines.some(line => actual.get(line.id) !== line.requestedQty) && !completionNote) throw new BadRequestException('Cần ghi chú lý do chênh lệch số lượng kiểm đếm.');
      if ([...actual.keys()].some(lineId => !lines.some(line => line.id === lineId))) throw new BadRequestException('Kết quả kiểm đếm chứa dòng không thuộc phiếu.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StoredItem" WHERE "id" IN (${Prisma.join(lines.map((line) => line.storedItemId))}) ORDER BY "id" FOR UPDATE`);
      for (const line of lines) {
        const quantity = actual.get(line.id)!;
        if (current.type === 'OUT') {
          const changed = await tx.storedItem.updateMany({ where: { id: line.storedItemId, balance: { gte: quantity } }, data: { balance: { decrement: quantity } } });
          if (!changed.count) throw new ConflictException({ code: 'INSUFFICIENT_STORED_ITEM_BALANCE', message: `Không đủ tồn cho ${line.storedItem.itemCode}.` });
        } else await tx.storedItem.update({ where: { id: line.storedItemId }, data: { balance: { increment: quantity } } });
        await tx.stockMovementLine.update({ where: { id: line.id }, data: { actualQty: quantity } });
      }
      return this.view(await tx.stockMovement.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedByUserId: actor.id, completedAt: new Date(), completionNote, storageUnitSnapshot: contract.reservationUnit.storageUnit }, include: this.include() }));
    });
  }

  private async page(base: Prisma.StockMovementWhereInput, query: ListQuery, staff?: PublicUser) {
    const where: Prisma.StockMovementWhereInput = { ...base, ...(query.rentalContractId ? { rentalContractId: query.rentalContractId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}), ...(query.search ? { OR: [{ movementCode: { contains: query.search, mode: 'insensitive' } }, { rentalContract: { contractCode: { contains: query.search, mode: 'insensitive' } } }, { customer: { fullName: { contains: query.search, mode: 'insensitive' } } }] } : {}) };
    const [total, items] = await Promise.all([this.prisma.stockMovement.count({ where }), this.prisma.stockMovement.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() })]);
    const visible = staff ? await this.currentStaffItems(this.prisma, staff.id, items) : null;
    return { page: query.page, limit: query.limit, total, items: items.map(item => visible ? this.staffView(item, visible) : this.view(item)) };
  }

  private matchingRetry(item: any, customerId: string, contractId: string, parsed: ReturnType<StockMovementsService['createInput']>) {
    const expected = parsed.lines.map(line => JSON.stringify([line.storedItemId || `${line.name}:${line.unit}`, line.quantity, line.note, line.photos])).sort();
    const actual = item.lines.map((line: any) => JSON.stringify([parsed.lines.some(input => input.storedItemId === line.storedItemId) ? line.storedItemId : `${line.storedItem.name}:${line.storedItem.unit}`, line.requestedQty, line.note, line.photos ?? []])).sort();
    if (item.customerUserId !== customerId || item.rentalContractId !== contractId || item.type !== parsed.type || (item.note ?? null) !== parsed.note || (item.scheduledAt?.toISOString() ?? null) !== (parsed.scheduledAt?.toISOString() ?? null) || JSON.stringify(expected) !== JSON.stringify(actual)) throw new ConflictException('Idempotency-Key đã dùng cho một yêu cầu khác.');
    return this.view(item);
  }

  private async find(id: string, extra: Prisma.StockMovementWhereInput) {
    return this.view(await this.findRecord(id, extra));
  }

  private async findRecord(id: string, extra: Prisma.StockMovementWhereInput) {
    const item = await this.prisma.stockMovement.findFirst({ where: { AND: [{ OR: [{ id }, { movementCode: id }] }, extra] }, include: this.include() });
    if (!item) throw new NotFoundException('Không tìm thấy phiếu nhập/xuất hàng.');
    return item;
  }

  private async currentStaffItems(db: Prisma.TransactionClient, staffId: string, rows: MovementRecord[]) {
    const itemIds = [...new Set(rows.flatMap(row => this.validStaffLines(row).map(line => line.storedItemId)))];
    if (!itemIds.length) return new Map<string, string>();
    const scope = await this.staffInventoryScope(db, staffId, { itemIds });
    if (!scope) return new Map<string, string>();
    const items = await db.storedItem.findMany({
      where: { id: { in: itemIds }, AND: [scope] },
      select: { id: true, rentalContract: { select: { reservationUnit: { select: { storageUnitId: true } } } } },
    });
    return new Map(items.map(item => [item.id, item.rentalContract.reservationUnit.storageUnitId]));
  }

  private validStaffLines(item: MovementRecord) {
    return item.lines.filter(({ storedItem }) => storedItem.customerUserId === item.customerUserId && storedItem.rentalContractId === item.rentalContractId);
  }

  private staffView(item: MovementRecord, visible: Map<string, string>) {
    const valid = this.validStaffLines(item);
    const result = this.view({ ...item, lines: valid });
    const unitId = result.currentStorageUnit?.id;
    const atCurrentUnit = (itemId: string) => !!unitId && visible.get(itemId) === unitId;
    const showCurrentUnit = valid.some(line => atCurrentUnit(line.storedItemId));
    return {
      ...result,
      currentStorageUnit: showCurrentUnit ? result.currentStorageUnit : null,
      rentalContract: { id: item.rentalContract?.id, contractCode: item.rentalContract?.contractCode, status: item.rentalContract?.status },
      lines: valid.map(line => ({
        id: line.id, requestedQty: line.requestedQty, actualQty: line.actualQty, note: line.note, photos: line.photos ?? [],
        storedItem: { id: line.storedItem.id, itemCode: line.storedItem.itemCode, name: line.storedItem.name, unit: line.storedItem.unit,
          balance: atCurrentUnit(line.storedItemId) ? line.storedItem.balance : null },
      })),
    };
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    const identity = await tx.stockMovement.findFirst({ where: { OR: [{ id }, { movementCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy phiếu nhập/xuất hàng.');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockMovement" WHERE "id" = ${identity.id} FOR UPDATE`);
    return tx.stockMovement.findUniqueOrThrow({ where: { id: identity.id } });
  }

  private unitSelect() { return { id: true, unitNumber: true, floor: true, zone: true }; }

  private include() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      rentalContract: { select: {
        id: true, contractCode: true, status: true,
        reservationUnit: { select: { storageUnit: { select: this.unitSelect() } } },
      } },
      assignedStaff: { select: { id: true, fullName: true, accountStatus: true } },
      assignedBy: { select: { id: true, fullName: true } },
      completedBy: { select: { id: true, fullName: true } },
      lines: { include: { storedItem: { select: { id: true, itemCode: true, name: true, unit: true, balance: true, customerUserId: true, rentalContractId: true } } }, orderBy: { id: 'asc' as const } },
    };
  }
  private view(item: any) { return { id: item.id, movementCode: item.movementCode, type: item.type, status: item.status, customer: item.customer, rentalContract: item.rentalContract, storageUnit: item.locationRecordedAt && item.storageUnitId && item.unitCodeSnapshot ? { id: item.storageUnitId, unitNumber: item.unitCodeSnapshot, floor: item.floorSnapshot, zone: item.zoneSnapshot } : null, locationEvidence: item.locationRecordedAt ? 'RECORDED' : 'UNKNOWN_LEGACY', currentStorageUnit: item.rentalContract?.reservationUnit?.storageUnit ?? null, storageUnitAtCompletion: item.storageUnitSnapshot ?? null, scheduledAt: item.scheduledAt?.toISOString() ?? null, note: item.note, assignedStaff: item.assignedStaff, assignedBy: item.assignedBy, assignedAt: item.assignedAt?.toISOString() ?? null, completedBy: item.completedBy, completedAt: item.completedAt?.toISOString() ?? null, completionNote: item.completionNote, lines: item.lines.map((line: any) => ({ id: line.id, storedItem: { id: line.storedItem.id, itemCode: line.storedItem.itemCode, name: line.storedItem.name, unit: line.storedItem.unit, balance: line.storedItem.balance }, requestedQty: line.requestedQty, actualQty: line.actualQty, note: line.note, photos: line.photos ?? [] })), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }; }

  private createInput(input: Record<string, unknown>, idempotencyKey?: string) {
    const contractId = this.requiredText(input.rentalContractId, 200, 'rentalContractId');
    const type: 'IN' | 'OUT' | null = input.type === 'IN' || input.type === 'OUT' ? input.type : null;
    if (!type) throw new BadRequestException('type phải là IN hoặc OUT.');
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new BadRequestException('lines phải có 1–100 dòng.');
    const lines: ParsedLine[] = input.lines.map((raw) => { const line = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; const quantity = Number(line.quantity); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new BadRequestException('quantity phải là số nguyên dương.'); return { ...(line.storedItemId ? { storedItemId: this.requiredText(line.storedItemId, 200, 'storedItemId') } : {}), ...(line.name ? { name: this.requiredText(line.name, 160, 'name') } : {}), ...(line.unit ? { unit: this.requiredText(line.unit, 40, 'unit') } : {}), quantity, photos: customerPhotos(line.photos), note: this.optionalText(line.note, 500, 'line.note') }; });
    const scheduledAt = input.scheduledAt ? new Date(this.requiredText(input.scheduledAt, 60, 'scheduledAt')) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('scheduledAt không hợp lệ.');
    const key = idempotencyKey?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key không hợp lệ.');
    if (lines.reduce((count, line) => count + line.photos.length, 0) > 3) throw new BadRequestException('Mỗi phiếu được đính kèm tối đa 3 ảnh.');
    return { contractId, type, lines, scheduledAt, note: this.optionalText(input.note, 2000, 'note'), key };
  }
  private actualLines(value: unknown) {
    if (!Array.isArray(value) || !value.length) throw new BadRequestException('Cần nhập số lượng thực tế cho tất cả dòng hàng.');
    const actual = new Map<string, number>();
    for (const raw of value) {
      const line = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const id = this.requiredText(line.lineId, 200, 'lineId');
      const quantity = line.actualQty;
      if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000) {
        throw new BadRequestException('actualQty phải là số nguyên từ 0 đến 1.000.000.');
      }
      if (actual.has(id)) throw new BadRequestException('Dòng kiểm đếm bị trùng.');
      actual.set(id, quantity);
    }
    return actual;
  }
  private requiredText(value: unknown, max: number, label: string) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
  private optionalText(value: unknown, max: number, label: string) { if (value === undefined || value === null || value === '') return null; return this.requiredText(value, max, label); }
  private code() { return `WDP-MOV-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private itemCode() { return `WDP-ITEM-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) { try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Dữ liệu phiếu vừa được cập nhật. Vui lòng thử lại.'); throw error; } }
}
