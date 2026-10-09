import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from '../billing/billing.service.js';

export interface AppointmentListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  date?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService = new BillingService(prisma),
  ) {}

  async createCustomerAppointment(customer: PublicUser, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ Customer được yêu cầu lịch bàn giao qua endpoint này.');
    const parsed = this.createInput(input, idempotencyKey);
    const reservationIdentity = await this.prisma.reservation.findFirst({ where: { OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }], customerId: customer.id }, select: { id: true } });
    if (!reservationIdentity) throw new NotFoundException('Không tìm thấy Reservation.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${reservationIdentity.id} FOR UPDATE`);
        const duplicate = await tx.handoverAppointment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.appointmentInclude() });
        if (duplicate) {
          this.assertMatchingAppointmentRetry(duplicate, reservationIdentity.id, parsed);
          return this.toAppointment(duplicate, false);
        }
        const reservation = await tx.reservation.findUnique({ where: { id: reservationIdentity.id }, include: this.reservationReadinessInclude() });
        if (!reservation) throw new NotFoundException('Không tìm thấy Reservation.');
        this.assertHandoverReady(reservation);
        if (reservation.contracts.some((contract) => parsed.scheduledAt < contract.startDate)) throw new BadRequestException('Lịch bàn giao không được trước ngày bắt đầu hợp đồng.');
        const existingActive = await tx.handoverAppointment.findUnique({ where: { activeKey: this.activeKey(reservation.id) } });
        if (existingActive) throw new ConflictException('Reservation đã có một lịch bàn giao đang hoạt động.');
        const sequence = await tx.handoverAppointment.count({ where: { reservationId: reservation.id } }) + 1;
        const created = await tx.handoverAppointment.create({
          data: {
            appointmentCode: `${reservation.reservationCode}-A${String(sequence).padStart(2, '0')}`,
            reservationId: reservation.id,
            scheduledAt: parsed.scheduledAt,
            requestedByUserId: customer.id,
            note: parsed.note,
            activeKey: this.activeKey(reservation.id),
            idempotencyKey: parsed.idempotencyKey,
          },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(created, false);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.handoverAppointment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.appointmentInclude() });
        if (duplicate) {
          this.assertMatchingAppointmentRetry(duplicate, reservationIdentity.id, parsed);
          return this.toAppointment(duplicate, false);
        }
        throw new ConflictException('Reservation đã có một lịch bàn giao đang hoạt động.');
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Lịch bàn giao vừa được cập nhật. Vui lòng thử lại.');
      throw error;
    }
  }

  async listCustomerAppointments(customerId: string, query: AppointmentListQuery) {
    return this.appointmentPage({ reservation: { customerId } }, query, false);
  }

  async getCustomerAppointment(customerId: string, id: string) {
    const appointment = await this.prisma.handoverAppointment.findFirst({ where: { OR: [{ id }, { appointmentCode: id }], reservation: { customerId } }, include: this.appointmentInclude() });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    return this.toAppointment(appointment, false);
  }

  async listOperationalAppointments(query: AppointmentListQuery) {
    return this.appointmentPage({}, query, true);
  }

  async getOperationalAppointment(id: string) {
    const appointment = await this.prisma.handoverAppointment.findFirst({ where: { OR: [{ id }, { appointmentCode: id }] }, include: this.appointmentInclude() });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    return this.toAppointment(appointment, true);
  }

  async confirmAppointment(id: string, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được xác nhận lịch bàn giao.');
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.handoverAppointment.findUnique({ where: { id: identity.id }, include: this.appointmentInclude() });
        if (!current) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
        if (current.status === 'CONFIRMED') return this.toAppointment(current, true);
        if (current.status !== 'REQUESTED') throw new ConflictException(`Không thể xác nhận lịch ở trạng thái ${current.status}.`);
        this.assertHandoverReady(current.reservation);
        const updated = await tx.handoverAppointment.update({
          where: { id: current.id },
          data: { status: 'CONFIRMED', confirmedByUserId: actor.id, confirmedAt: new Date() },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(updated, true);
      }, 'Lịch bàn giao vừa được cập nhật. Vui lòng tải lại.');
  }

  async completeHandover(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (!['STAFF', 'MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Customer không được hoàn tất bàn giao.');
    const handoverNote = this.optionalText(input.note, 2000, 'note');
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.handoverAppointment.findUnique({ where: { id: identity.id }, include: this.appointmentInclude() });
        if (!current) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
        if (current.status === 'COMPLETED') return this.toAppointment(current, true);
        if (current.status !== 'CONFIRMED') throw new ConflictException('Chỉ lịch CONFIRMED mới được hoàn tất bàn giao.');
        this.assertHandoverReady(current.reservation);

        const contracts = current.reservation.contracts;
        const unitIds = contracts.map((contract: any) => contract.reservationUnit.storageUnit.id);
        if (new Set(unitIds).size !== current.reservation.quantity) throw new ConflictException('Allocation vật lý không đầy đủ hoặc bị trùng.');
        if (contracts.some((contract: any) => ['MAINTENANCE', 'OCCUPIED'].includes(contract.reservationUnit.storageUnit.status))) {
          throw new ConflictException('Có StorageUnit không thể bàn giao vì đang MAINTENANCE hoặc OCCUPIED.');
        }
        const otherActive = await tx.rentalContract.count({
          where: { status: 'ACTIVE', reservationId: { not: current.reservation.id }, reservationUnit: { storageUnitId: { in: unitIds } } },
        });
        if (otherActive > 0) throw new ConflictException('Có StorageUnit đang thuộc một hợp đồng ACTIVE khác.');

        const now = new Date();
        const activated = await tx.rentalContract.updateMany({
          where: { id: { in: contracts.map((contract: any) => contract.id) }, status: 'READY_FOR_HANDOVER' },
          data: { status: 'ACTIVE', activatedAt: now },
        });
        if (activated.count !== current.reservation.quantity) throw new ConflictException('Không thể kích hoạt đầy đủ tất cả RentalContract.');
        const occupied = await tx.storageUnit.updateMany({
          where: { id: { in: unitIds }, status: { notIn: ['MAINTENANCE', 'OCCUPIED'] } },
          data: { status: 'OCCUPIED' },
        });
        if (occupied.count !== current.reservation.quantity) throw new ConflictException('Không thể chuyển đầy đủ StorageUnit sang OCCUPIED.');
        await this.billing.ensureRecurringInvoices(tx, current.reservation.id);
        const updated = await tx.handoverAppointment.update({
          where: { id: current.id },
          data: { status: 'COMPLETED', completedAt: now, completedByUserId: actor.id, handoverNote, activeKey: null },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(updated, true);
      }, 'Lịch bàn giao vừa được hoàn tất bởi yêu cầu khác. Vui lòng tải lại.');
  }

  private assertHandoverReady(reservation: any) {
    if (reservation.status !== 'CONFIRMED') throw new ConflictException('Reservation chưa ở trạng thái CONFIRMED.');
    const initialInvoices = reservation.invoices.filter((invoice: any) => invoice.type === 'INITIAL');
    if (initialInvoices.length !== 1 || initialInvoices[0].status !== 'PAID') throw new ConflictException('Initial Invoice phải được thanh toán đầy đủ trước khi bàn giao.');
    if (reservation.contracts.length !== reservation.quantity || reservation.units.length !== reservation.quantity) throw new ConflictException('Reservation chưa có đủ Contract và allocation vật lý.');
    if (reservation.contracts.some((contract: any) => contract.status !== 'READY_FOR_HANDOVER')) throw new ConflictException('Tất cả RentalContract phải ở trạng thái READY_FOR_HANDOVER.');
    const allocationIds = new Set(reservation.units.map((unit: any) => unit.id));
    if (reservation.contracts.some((contract: any) => !allocationIds.has(contract.reservationUnitId))) throw new ConflictException('Contract không khớp allocation vật lý của Reservation.');
  }

  private async appointmentIdentity(id: string) {
    const identity = await this.prisma.handoverAppointment.findFirst({ where: { OR: [{ id }, { appointmentCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    return identity;
  }

  private async appointmentPage(baseWhere: Prisma.HandoverAppointmentWhereInput, query: AppointmentListQuery, includeCustomer: boolean) {
    const where: Prisma.HandoverAppointmentWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.date ? { scheduledAt: this.dateRange(query.date) } : {}),
      ...(query.search ? { AND: [{ OR: [
        { appointmentCode: { contains: query.search, mode: 'insensitive' } },
        { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
        { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      ] }] } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.handoverAppointment.count({ where }),
      this.prisma.handoverAppointment.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], include: this.appointmentInclude() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toAppointment(record, includeCustomer)) };
  }

  private appointmentInclude() {
    return {
      requestedBy: { select: { id: true, fullName: true, role: true } },
      confirmedBy: { select: { id: true, fullName: true, role: true } },
      completedBy: { select: { id: true, fullName: true, role: true } },
      reservation: { include: this.reservationReadinessInclude() },
    };
  }

  private reservationReadinessInclude() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      invoices: { where: { type: 'INITIAL' as const }, select: { id: true, invoiceCode: true, type: true, status: true } },
      units: { select: { id: true, storageUnitId: true } },
      contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true, floor: true, zone: true } } } } }, orderBy: { contractCode: 'asc' as const } },
    };
  }

  private toAppointment(record: any, includeCustomer: boolean) {
    return {
      id: record.id,
      appointmentCode: record.appointmentCode,
      status: record.status,
      scheduledAt: record.scheduledAt.toISOString(),
      reservation: {
        id: record.reservation.id,
        reference: record.reservation.reservationCode,
        status: record.reservation.status,
        quantity: record.reservation.quantity,
        contractCount: record.reservation.contracts.length,
        ...(includeCustomer ? { customer: record.reservation.customer } : {}),
      },
      allocatedUnits: record.reservation.contracts.map((contract: any) => ({
        contractCode: contract.contractCode,
        contractStatus: contract.status,
        activatedAt: contract.activatedAt?.toISOString() ?? null,
        unitId: contract.reservationUnit.storageUnit.id,
        unitCode: contract.reservationUnit.storageUnit.unitNumber,
        unitStatus: contract.reservationUnit.storageUnit.status,
        floor: contract.reservationUnit.storageUnit.floor,
        zone: contract.reservationUnit.storageUnit.zone,
      })),
      note: record.note,
      handoverNote: record.handoverNote,
      requestedBy: record.requestedBy,
      confirmedBy: record.confirmedBy,
      completedBy: record.completedBy,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private createInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const scheduledAtText = typeof input.scheduledAt === 'string' ? input.scheduledAt : '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAtText)) throw new BadRequestException('scheduledAt phải là timestamp ISO 8601 có múi giờ.');
    const scheduledAt = new Date(scheduledAtText);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new BadRequestException('scheduledAt phải là thời điểm hợp lệ trong tương lai.');
    const note = this.optionalText(input.note, 2000, 'note');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { reservationId, scheduledAt, note, idempotencyKey: key };
  }

  private assertMatchingAppointmentRetry(appointment: any, reservationId: string, parsed: { scheduledAt: Date; note: string | null }) {
    if (appointment.reservationId !== reservationId || appointment.scheduledAt.getTime() !== parsed.scheduledAt.getTime() || (appointment.note ?? '') !== (parsed.note ?? '')) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một lịch bàn giao khác.');
    }
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private activeKey(reservationId: string) {
    return `HANDOVER:${reservationId}`;
  }

  private dateRange(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('date phải có định dạng YYYY-MM-DD.');
    const start = new Date(`${value}T00:00:00+07:00`);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('date không hợp lệ.');
    const end = new Date(start.getTime() + 86400000);
    return { gte: start, lt: end };
  }

  private isPrismaCode(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, conflictMessage: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue;
        if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(conflictMessage);
        throw error;
      }
    }
    throw new ConflictException(conflictMessage);
  }
}
