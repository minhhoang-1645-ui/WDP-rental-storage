import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const reasons = ['UNIT_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'OPERATIONAL_RELOCATION', 'OTHER'] as const;
const statuses = ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const rentalContractId = this.text(input.rentalContractId, 'rentalContractId');
    const reason = input.reason;
    if (!reasons.includes(reason as never)) throw new BadRequestException('Transfer reason không hợp lệ.');
    const idempotencyKey = this.key(key);
    const duplicate = await this.prisma.transferRequest.findUnique({ where: { idempotencyKey }, include: this.include() });
    if (duplicate) return this.toTransfer(duplicate);
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id: rentalContractId }, { contractCode: rentalContractId }] },
      include: { reservationUnit: { include: { storageUnit: true } }, reservation: true },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy RentalContract.');
    if (contract.status !== 'ACTIVE') throw new ConflictException('Transfer yêu cầu RentalContract ACTIVE.');
    if (contract.reservationUnit.releasedAt || contract.reservationUnit.storageUnit.status !== 'OCCUPIED') throw new ConflictException('Transfer yêu cầu unit nguồn đang OCCUPIED và allocation chưa release.');
    const supportRequestId = typeof input.supportRequestId === 'string' && input.supportRequestId.trim() ? input.supportRequestId.trim() : null;
    if (supportRequestId) {
      const support = await this.prisma.supportRequest.findUnique({ where: { id: supportRequestId }, select: { reservationId: true } });
      if (!support || support.reservationId !== contract.reservationId) throw new BadRequestException('SupportRequest không thuộc cùng Reservation.');
    }
    try {
      const record = await this.prisma.transferRequest.create({ data: {
        transferCode: this.code(), reservationId: contract.reservationId, rentalContractId: contract.id,
        fromStorageUnitId: contract.reservationUnit.storageUnitId, fromReservationUnitId: contract.reservationUnitId,
        supportRequestId, reason: reason as (typeof reasons)[number], requestedByUserId: actor.id, idempotencyKey,
      }, include: this.include() });
      return this.toTransfer(record);
    } catch (error) {
      if (this.prismaCode(error, 'P2002')) throw new ConflictException('Contract đã có Transfer đang xử lý hoặc Idempotency-Key đã được dùng.');
      throw error;
    }
  }

  async list(query: Record<string, unknown>) {
    const page = this.integer(query.page, 1, 100000, 'page'); const limit = this.integer(query.limit, 20, 100, 'limit');
    const status = typeof query.status === 'string' && query.status ? query.status : undefined;
    if (status && !statuses.includes(status as never)) throw new BadRequestException('Transfer status không hợp lệ.');
    const where = status ? { status: status as (typeof statuses)[number] } : {};
    const [total, records] = await Promise.all([
      this.prisma.transferRequest.count({ where }),
      this.prisma.transferRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page, limit, total, items: records.map((record) => this.toTransfer(record)) };
  }

  async get(id: string) {
    const record = await this.prisma.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy TransferRequest.');
    return this.toTransfer(record);
  }

  async approve(id: string, input: Record<string, unknown>, actor: PublicUser) {
    const toStorageUnitId = this.text(input.toStorageUnitId, 'toStorageUnitId');
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${toStorageUnitId} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được duyệt.');
      const destination = await tx.storageUnit.findUnique({ where: { id: toStorageUnitId } });
      if (!destination) throw new NotFoundException('Không tìm thấy unit đích.');
      if (destination.status !== 'AVAILABLE') throw new ConflictException('Unit đích không còn AVAILABLE.');
      if (destination.id === current.fromStorageUnitId) throw new ConflictException('Unit đích phải khác unit nguồn.');
      if (destination.storageTypeId !== current.fromStorageUnit.storageTypeId) throw new ConflictException('Unit đích phải cùng StorageType.');
      const start = this.today(); const end = current.rentalContract.endDate;
      if (end <= start) throw new ConflictException('Contract không còn khoảng thuê tương lai để chuyển unit.');
      const conflicting = await tx.reservationUnit.count({ where: { storageUnitId: destination.id, releasedAt: null, plannedStartDate: { lt: end }, plannedEndDate: { gt: start }, reservation: { status: 'CONFIRMED' } } });
      if (conflicting) throw new ConflictException('Unit đích có confirmed allocation trùng khoảng thuê còn lại.');
      const targetAllocation = await tx.reservationUnit.create({ data: { reservationId: current.reservationId, storageUnitId: destination.id, plannedStartDate: start, plannedEndDate: end } });
      const reserved = await tx.storageUnit.updateMany({ where: { id: destination.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
      if (reserved.count !== 1) throw new ConflictException('Unit đích vừa được sử dụng bởi thao tác khác.');
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'APPROVED', toStorageUnitId: destination.id, toReservationUnitId: targetAllocation.id, approvedByUserId: actor.id, approvedAt: new Date() }, include: this.include() });
      return this.toTransfer(updated);
    }, 'Không thể duyệt Transfer do xung đột đồng thời.');
  }

  async reject(id: string, actor: PublicUser) {
    return this.serializable(async (tx) => {
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy TransferRequest.');
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được từ chối.');
      return this.toTransfer(await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'REJECTED', approvedByUserId: actor.id, approvedAt: new Date() }, include: this.include() }));
    }, 'Không thể từ chối Transfer do xung đột đồng thời.');
  }

  async complete(id: string, actor: PublicUser) {
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (current.status !== 'APPROVED' || !current.toStorageUnitId || !current.toReservationUnitId) throw new ConflictException('Chỉ Transfer APPROVED mới được hoàn tất.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" IN (${current.fromStorageUnitId}, ${current.toStorageUnitId}) FOR UPDATE`);
      if (current.fromStorageUnit.status !== 'OCCUPIED' || current.toStorageUnit?.status !== 'RESERVED') throw new ConflictException('Trạng thái vật lý của unit đã thay đổi.');
      const now = new Date();
      await tx.rentalContract.update({ where: { id: current.rentalContractId }, data: { reservationUnitId: current.toReservationUnitId } });
      await tx.reservationUnit.update({ where: { id: current.fromReservationUnitId }, data: { releasedAt: now, actualVacatedAt: now } });
      await tx.storageUnit.update({ where: { id: current.fromStorageUnitId }, data: { status: 'MAINTENANCE' } });
      await tx.storageUnit.update({ where: { id: current.toStorageUnitId }, data: { status: 'OCCUPIED' } });
      return this.toTransfer(await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedByUserId: actor.id, completedAt: now }, include: this.include() }));
    }, 'Không thể hoàn tất Transfer do xung đột đồng thời.');
  }

  private include(): Prisma.TransferRequestInclude { return {
    reservation: { select: { id: true, reservationCode: true, startDate: true, endDate: true, quoteSnapshot: true } },
    rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true } },
    fromStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true } } } },
    toStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true } } } },
    requestedBy: { select: { id: true, fullName: true, role: true } }, approvedBy: { select: { id: true, fullName: true, role: true } }, completedBy: { select: { id: true, fullName: true, role: true } },
    supportRequest: { select: { id: true, supportCode: true, status: true } },
  }; }
  private toTransfer(record: any) { return { id: record.id, transferCode: record.transferCode, status: record.status, reason: record.reason, reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, startDate: this.iso(record.reservation.startDate), endDate: this.iso(record.reservation.endDate) }, contract: { id: record.rentalContract.id, contractCode: record.rentalContract.contractCode, status: record.rentalContract.status, startDate: this.iso(record.rentalContract.startDate), endDate: this.iso(record.rentalContract.endDate) }, fromUnit: this.unit(record.fromStorageUnit), toUnit: record.toStorageUnit ? this.unit(record.toStorageUnit) : null, supportRequest: record.supportRequest, requestedBy: record.requestedBy, approvedBy: record.approvedBy, completedBy: record.completedBy, approvedAt: record.approvedAt?.toISOString() ?? null, completedAt: record.completedAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString() }; }
  private unit(unit: any) { return { id: unit.id, unitCode: unit.unitNumber, status: unit.status, storageType: unit.storageType }; }
  private text(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} là bắt buộc.`); return value.trim(); }
  private key(value: string | undefined) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự.'); return key; }
  private integer(value: unknown, fallback: number, max: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
  private today() { return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'); }
  private iso(value: Date) { return value.toISOString().slice(0, 10); }
  private code() { return `WDP-TRF-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private prismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) { for (let attempt = 0; attempt < 3; attempt += 1) { try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); } catch (error) { if (this.prismaCode(error, 'P2034') && attempt < 2) continue; if (this.prismaCode(error, 'P2034')) throw new ConflictException(message); throw error; } } throw new ConflictException(message); }
}
