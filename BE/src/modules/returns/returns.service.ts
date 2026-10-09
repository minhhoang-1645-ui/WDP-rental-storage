import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type DbClient = PrismaService | Prisma.TransactionClient;
type ViewMode = 'CUSTOMER' | 'MANAGER' | 'STAFF';
type ReturnStatus = 'REQUESTED' | 'INSPECTION_IN_PROGRESS' | 'ISSUE_FOUND' | 'COMPLETED';

export interface ReturnListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ReturnStatus;
  date?: string;
}

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomerReturn(customer: PublicUser, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ Customer được gửi yêu cầu trả kho qua endpoint này.');
    const parsed = this.createInput(input, idempotencyKey);
    const identity = await this.prisma.reservation.findFirst({
      where: { customerId: customer.id, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] },
      select: { id: true },
    });
    if (!identity) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');

    try {
      return await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const duplicate = await tx.returnRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, customer.id, identity.id, parsed.note);
          return this.toReturn(duplicate, 'CUSTOMER');
        }
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id }, include: this.eligibilityInclude() });
        const rental = this.assertReturnEligible(reservation, customer.id, new Date());
        await this.lockUnits(tx, rental.unitIds);
        const active = await tx.returnRequest.findUnique({ where: { activeKey: this.activeKey(identity.id) } });
        if (active) throw new ConflictException({ code: 'ACTIVE_RETURN_EXISTS', message: 'Rental này đã có yêu cầu trả kho chưa hoàn tất.' });
        const sequence = await tx.returnRequest.count({ where: { reservationId: identity.id } }) + 1;
        const created = await tx.returnRequest.create({
          data: {
            returnCode: `${reservation!.reservationCode}-RT${String(sequence).padStart(2, '0')}`,
            reservationId: identity.id,
            requestedByUserId: customer.id,
            note: parsed.note,
            idempotencyKey: parsed.idempotencyKey,
            activeKey: this.activeKey(identity.id),
            inspections: {
              create: reservation!.contracts.map((contract: any) => ({
                rentalContractId: contract.id,
                storageUnitId: contract.reservationUnit.storageUnitId,
              })),
            },
          },
          include: this.include(),
        });
        return this.toReturn(created, 'CUSTOMER');
      }, 'Yêu cầu trả kho vừa được cập nhật. Vui lòng tải lại và thử lại.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.returnRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, customer.id, identity.id, parsed.note);
          return this.toReturn(duplicate, 'CUSTOMER');
        }
        throw new ConflictException({ code: 'ACTIVE_RETURN_EXISTS', message: 'Rental này đã có yêu cầu trả kho chưa hoàn tất.' });
      }
      throw error;
    }
  }

  listCustomerReturns(customerId: string, query: Pick<ReturnListQuery, 'page' | 'limit'>) {
    return this.page({ reservation: { customerId } }, query, 'CUSTOMER');
  }

  async getCustomerReturn(customerId: string, id: string) {
    const record = await this.prisma.returnRequest.findFirst({
      where: { reservation: { customerId }, OR: [{ id }, { returnCode: id }] },
      include: this.include(),
    });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return this.toReturn(record, 'CUSTOMER');
  }

  listManagerReturns(query: ReturnListQuery) {
    return this.page(this.operationalWhere(query), query, 'MANAGER');
  }

  listStaffReturns(query: ReturnListQuery) {
    return this.page(this.operationalWhere(query), query, 'STAFF');
  }

  async getManagerReturn(id: string) {
    return this.toReturn(await this.find(id, this.prisma), 'MANAGER');
  }

  async getStaffReturn(id: string) {
    return this.toReturn(await this.find(id, this.prisma), 'STAFF');
  }

  async startInspection(id: string, actor: PublicUser) {
    this.assertOperational(actor);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      if (current.status === 'INSPECTION_IN_PROGRESS') return this.toReturn(current, 'STAFF');
      if (current.status !== 'REQUESTED') throw new ConflictException(`Không thể bắt đầu kiểm tra ở trạng thái ${current.status}.`);
      this.assertOperationalIntegrity(current.reservation);
      const updated = await tx.returnRequest.update({
        where: { id: current.id },
        data: { status: 'INSPECTION_IN_PROGRESS', inspectionStartedAt: new Date(), inspectionStartedById: actor.id },
        include: this.include(),
      });
      return this.toReturn(updated, 'STAFF');
    }, 'Yêu cầu trả kho vừa được xử lý bởi thao tác khác. Vui lòng tải lại.');
  }

  async updateInspection(returnId: string, inspectionId: string, input: Record<string, unknown>, actor: PublicUser) {
    this.assertOperational(actor);
    const parsed = this.inspectionInput(input);
    const identity = await this.identity(returnId);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      if (!['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(current.status)) throw new ConflictException('Chỉ yêu cầu đang kiểm tra mới được ghi kết quả.');
      const inspection = current.inspections.find((item) => item.id === inspectionId);
      if (!inspection) throw new NotFoundException('Inspection không thuộc yêu cầu trả kho này.');
      if (inspection.result === 'ISSUE_FOUND' && parsed.result !== 'ISSUE_FOUND') {
        throw new ConflictException('Return V1 không cho phép tự xóa kết quả ISSUE_FOUND.');
      }
      if (inspection.result === parsed.result && (inspection.conditionNote ?? null) === parsed.conditionNote && (inspection.issueNote ?? null) === parsed.issueNote) {
        return this.toReturn(current, 'STAFF');
      }
      const now = new Date();
      await tx.returnInspection.update({
        where: { id: inspection.id },
        data: {
          result: parsed.result,
          conditionNote: parsed.conditionNote,
          issueNote: parsed.issueNote,
          inspectedByUserId: actor.id,
          inspectedAt: now,
        },
      });
      if (parsed.result === 'ISSUE_FOUND' && current.status !== 'ISSUE_FOUND') {
        await tx.returnRequest.update({ where: { id: current.id }, data: { status: 'ISSUE_FOUND' } });
      }
      return this.toReturn(await this.find(current.id, tx), 'STAFF');
    }, 'Kết quả kiểm tra vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.');
  }

  async finalize(id: string, actor: PublicUser) {
    this.assertOperational(actor);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      let current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      if (current.status === 'COMPLETED') return this.toReturn(current, 'STAFF');
      if (current.status === 'ISSUE_FOUND') throw new ConflictException({ code: 'RETURN_ISSUE_UNRESOLVED', message: 'Không thể hoàn tất khi còn ISSUE_FOUND.' });
      if (current.status !== 'INSPECTION_IN_PROGRESS') throw new ConflictException('Yêu cầu phải đang INSPECTION_IN_PROGRESS trước khi hoàn tất.');
      if (current.inspections.length !== current.reservation.quantity || current.inspections.some((inspection) => inspection.result !== 'PASS')) {
        throw new ConflictException({ code: 'RETURN_INSPECTIONS_INCOMPLETE', message: 'Tất cả kho phải có inspection PASS trước khi hoàn tất.' });
      }
      const unitIds = current.inspections.map((inspection) => inspection.storageUnitId).sort();
      if (new Set(unitIds).size !== current.reservation.quantity) throw new ConflictException('Inspection không bao phủ đủ các StorageUnit riêng biệt.');
      await this.lockUnits(tx, unitIds);
      current = await tx.returnRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() });
      this.assertOperationalIntegrity(current.reservation);
      this.assertInspectionLinks(current);

      const now = new Date();
      const contracts = await tx.rentalContract.updateMany({
        where: { id: { in: current.inspections.map((inspection) => inspection.rentalContractId) }, reservationId: current.reservationId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: now },
      });
      if (contracts.count !== current.reservation.quantity) throw new ConflictException('Không thể hoàn tất một phần RentalContract.');
      const allocations = await tx.reservationUnit.updateMany({
        where: { reservationId: current.reservationId, storageUnitId: { in: unitIds }, releasedAt: null },
        data: { releasedAt: now, actualVacatedAt: now },
      });
      if (allocations.count !== current.reservation.quantity) throw new ConflictException('Không thể release một phần allocation.');
      const units = await tx.storageUnit.updateMany({
        where: { id: { in: unitIds }, status: 'OCCUPIED' },
        data: { status: 'AVAILABLE' },
      });
      if (units.count !== current.reservation.quantity) throw new ConflictException('Không thể mở lại một phần StorageUnit.');
      const updated = await tx.returnRequest.update({
        where: { id: current.id },
        data: { status: 'COMPLETED', completedAt: now, completedByUserId: actor.id, activeKey: null },
        include: this.include(),
      });
      return this.toReturn(updated, 'STAFF');
    }, 'Yêu cầu trả kho vừa được hoàn tất hoặc thay đổi bởi thao tác khác. Vui lòng tải lại.');
  }

  private assertReturnEligible(reservation: any, customerId: string, now: Date) {
    if (!reservation || reservation.customerId !== customerId) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');
    this.assertOperationalIntegrity(reservation);
    const endDate = this.effectiveEndDate(reservation.contracts);
    if (now < endDate) throw new ConflictException({ code: 'RETURN_BEFORE_END_DATE_NOT_SUPPORTED', message: 'Return V1 chỉ hỗ trợ yêu cầu từ ngày kết thúc hiện tại.' });
    if (reservation.renewals.some((renewal: any) => ['PENDING', 'APPROVED_PENDING_PAYMENT'].includes(renewal.status))) {
      throw new ConflictException({ code: 'UNRESOLVED_RENEWAL_EXISTS', message: 'Phải xử lý xong yêu cầu gia hạn trước khi tạo yêu cầu trả kho.' });
    }
    return { endDate, unitIds: reservation.contracts.map((contract: any) => contract.reservationUnit.storageUnitId as string) };
  }

  private assertOperationalIntegrity(reservation: any) {
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Reservation phải ở trạng thái CONFIRMED.');
    if (reservation.contracts.length !== reservation.quantity || reservation.units.length !== reservation.quantity) throw new ConflictException('Rental không có đủ contract/allocation.');
    if (reservation.contracts.some((contract: any) => contract.status !== 'ACTIVE')) throw new ConflictException('Tất cả RentalContract phải ACTIVE.');
    if (reservation.contracts.some((contract: any) => contract.reservationUnit.releasedAt !== null || contract.reservationUnit.storageUnit.status !== 'OCCUPIED')) {
      throw new ConflictException('Tất cả StorageUnit phải còn OCCUPIED bởi rental hiện tại.');
    }
    const allocationIds = new Set(reservation.units.map((unit: any) => unit.id));
    if (reservation.contracts.some((contract: any) => !allocationIds.has(contract.reservationUnitId))) throw new ConflictException('Contract không khớp allocation của Reservation.');
    this.effectiveEndDate(reservation.contracts);
  }

  private assertInspectionLinks(request: any) {
    const links = new Map(request.reservation.contracts.map((contract: any) => [contract.id, contract.reservationUnit.storageUnitId]));
    if (request.inspections.some((inspection: any) => links.get(inspection.rentalContractId) !== inspection.storageUnitId)) {
      throw new ConflictException('Inspection không khớp contract và StorageUnit của rental.');
    }
  }

  private effectiveEndDate(contracts: any[]) {
    if (contracts.length === 0) throw new ConflictException('Active Rental không có contract.');
    const timestamps = new Set(contracts.map((contract) => contract.endDate.getTime()));
    if (timestamps.size !== 1) throw new ConflictException({ code: 'RETURN_END_DATE_MISMATCH', message: 'Các RentalContract ACTIVE có endDate không đồng nhất.' });
    return contracts[0].endDate as Date;
  }

  private eligibilityInclude(): Prisma.ReservationInclude {
    return {
      units: { include: { storageUnit: true } },
      contracts: { include: { reservationUnit: { include: { storageUnit: true } } }, orderBy: { contractCode: 'asc' as const } },
      renewals: { where: { status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT'] } }, select: { id: true, status: true } },
    };
  }

  private include() {
    return {
      requestedBy: { select: { id: true, fullName: true, role: true } },
      inspectionStartedBy: { select: { id: true, fullName: true, role: true } },
      completedBy: { select: { id: true, fullName: true, role: true } },
      inspections: {
        include: {
          inspectedBy: { select: { id: true, fullName: true, role: true } },
          rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true, completedAt: true } },
          storageUnit: { select: {
            id: true, unitNumber: true, status: true, floor: true, zone: true, row: true, position: true,
            reservationUnits: {
              where: { releasedAt: null, reservation: { status: 'CONFIRMED' as const } },
              select: { reservationId: true, plannedStartDate: true, plannedEndDate: true, reservation: { select: { reservationCode: true } } },
              orderBy: [{ plannedStartDate: 'asc' as const }, { id: 'asc' as const }],
            },
          } },
        },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      },
      reservation: { include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
        units: { select: { id: true, storageUnitId: true, releasedAt: true, plannedStartDate: true, plannedEndDate: true } },
        contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } } } } }, orderBy: { contractCode: 'asc' as const } },
        invoices: { select: { id: true, invoiceCode: true, type: true, status: true, totalAmount: true, amountPaid: true, balanceDue: true }, orderBy: { issuedAt: 'asc' as const } },
        renewals: { select: { id: true, renewalCode: true, status: true, previousEndDate: true, requestedEndDate: true }, orderBy: { createdAt: 'desc' as const } },
      } },
    };
  }

  private async page(where: Prisma.ReturnRequestWhereInput, query: Pick<ReturnListQuery, 'page' | 'limit'>, mode: ViewMode) {
    const [total, records] = await Promise.all([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toReturn(record, mode)) };
  }

  private operationalWhere(query: ReturnListQuery): Prisma.ReturnRequestWhereInput {
    const filters: Prisma.ReturnRequestWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.date) filters.push({ requestedAt: this.dateRange(query.date) });
    if (query.search) filters.push({ OR: [
      { returnCode: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
      { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      { inspections: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } },
    ] });
    return filters.length ? { AND: filters } : {};
  }

  private toReturn(record: any, mode: ViewMode) {
    const effectiveEndDate = this.effectiveEndDateForRead(record.reservation.contracts);
    const inspections = record.inspections.map((inspection: any) => {
      const future = inspection.storageUnit.reservationUnits.find((allocation: any) => allocation.reservationId !== record.reservationId && allocation.plannedStartDate >= effectiveEndDate);
      const base = {
        id: inspection.id,
        result: inspection.result,
        inspectedAt: inspection.inspectedAt?.toISOString() ?? null,
        contract: {
          id: inspection.rentalContract.id,
          contractCode: inspection.rentalContract.contractCode,
          status: inspection.rentalContract.status,
          completedAt: inspection.rentalContract.completedAt?.toISOString() ?? null,
        },
        unit: {
          id: inspection.storageUnit.id,
          unitCode: inspection.storageUnit.unitNumber,
          status: inspection.storageUnit.status,
          floor: inspection.storageUnit.floor,
          zone: inspection.storageUnit.zone,
          row: inspection.storageUnit.row,
          position: inspection.storageUnit.position,
        },
      };
      if (mode === 'CUSTOMER') return { ...base, hasIssue: inspection.result === 'ISSUE_FOUND' };
      return {
        ...base,
        conditionNote: inspection.conditionNote,
        issueNote: inspection.issueNote,
        inspectedBy: inspection.inspectedBy,
        nextConfirmedAllocation: future ? { reference: future.reservation.reservationCode, startDate: this.isoDate(future.plannedStartDate), endDate: this.isoDate(future.plannedEndDate) } : null,
      };
    });
    const base = {
      id: record.id,
      returnCode: record.returnCode,
      status: record.status,
      requestedAt: record.requestedAt.toISOString(),
      inspectionStartedAt: record.inspectionStartedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      note: record.note,
      reservation: {
        id: record.reservation.id,
        reference: record.reservation.reservationCode,
        status: record.reservation.status,
        quantity: record.reservation.quantity,
        startDate: this.isoDate(record.reservation.startDate),
        endDate: this.isoDate(record.reservation.endDate),
        effectiveEndDate: this.isoDate(effectiveEndDate),
        storageType: record.reservation.storageType,
        ...(mode === 'CUSTOMER' ? {} : { customer: record.reservation.customer }),
      },
      inspections,
      inspectionSummary: {
        total: inspections.length,
        pending: inspections.filter((item: any) => item.result === 'PENDING').length,
        passed: inspections.filter((item: any) => item.result === 'PASS').length,
        issues: inspections.filter((item: any) => item.result === 'ISSUE_FOUND').length,
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
    if (mode === 'CUSTOMER') return { ...base, requestedBy: record.requestedBy };
    const renewals = record.reservation.renewals.map((renewal: any) => ({
      renewalCode: renewal.renewalCode,
      status: renewal.status,
      previousEndDate: this.isoDate(renewal.previousEndDate),
      requestedEndDate: this.isoDate(renewal.requestedEndDate),
    }));
    const operational = {
      ...base,
      requestedBy: record.requestedBy,
      inspectionStartedBy: record.inspectionStartedBy,
      completedBy: record.completedBy,
    };
    if (mode === 'STAFF') return { ...operational, renewalHistory: renewals };
    return {
      ...operational,
      renewalHistory: renewals,
      billingSummary: {
        totalInvoiced: record.reservation.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.totalAmount), 0),
        totalPaid: record.reservation.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.amountPaid), 0),
        totalOutstanding: record.reservation.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.balanceDue), 0),
        invoices: record.reservation.invoices.map((invoice: any) => ({
          id: invoice.id, invoiceCode: invoice.invoiceCode, type: invoice.type, status: invoice.status,
          totalAmount: this.money(invoice.totalAmount), amountPaid: this.money(invoice.amountPaid), balanceDue: this.money(invoice.balanceDue),
        })),
      },
    };
  }

  private createInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const note = this.optionalText(input.note, 2000, 'note');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { reservationId, note, idempotencyKey: key };
  }

  private inspectionInput(input: Record<string, unknown>): { result: 'PASS' | 'ISSUE_FOUND'; conditionNote: string | null; issueNote: string | null } {
    const result = input.result;
    if (result !== 'PASS' && result !== 'ISSUE_FOUND') throw new BadRequestException('result phải là PASS hoặc ISSUE_FOUND.');
    const conditionNote = this.optionalText(input.conditionNote, 2000, 'conditionNote');
    const issueNote = this.optionalText(input.issueNote, 2000, 'issueNote');
    if (result === 'ISSUE_FOUND' && (!issueNote || issueNote.length < 3)) throw new BadRequestException('issueNote phải dài ít nhất 3 ký tự khi có ISSUE_FOUND.');
    return { result, conditionNote, issueNote: result === 'ISSUE_FOUND' ? issueNote : null };
  }

  private assertMatchingRetry(record: any, customerId: string, reservationId: string, note: string | null) {
    if (record.requestedByUserId !== customerId || record.reservationId !== reservationId || (record.note ?? null) !== note) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một yêu cầu trả kho khác.');
    }
  }

  private assertOperational(actor: PublicUser) {
    if (!['STAFF', 'MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Staff, Manager hoặc Admin được xử lý kiểm tra trả kho.');
  }

  private async identity(id: string) {
    const identity = await this.prisma.returnRequest.findFirst({ where: { OR: [{ id }, { returnCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return identity;
  }

  private async find(id: string, db: DbClient) {
    const record = await db.returnRequest.findFirst({ where: { OR: [{ id }, { returnCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return record;
  }

  private async lockUnits(tx: Prisma.TransactionClient, unitIds: string[]) {
    for (const unitId of [...unitIds].sort()) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${unitId} FOR UPDATE`);
  }

  private activeKey(reservationId: string) {
    return `RETURN:${reservationId}`;
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private dateRange(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('date phải có định dạng YYYY-MM-DD.');
    const start = new Date(`${value}T00:00:00+07:00`);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('date không hợp lệ.');
    return { gte: start, lt: new Date(start.getTime() + 86400000) };
  }

  private effectiveEndDateForRead(contracts: any[]) {
    if (!contracts.length) return new Date(0);
    const latest = contracts.reduce((value, contract) => contract.endDate > value ? contract.endDate : value, contracts[0].endDate);
    return latest as Date;
  }

  private isoDate(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }

  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Stored money is outside the supported range.');
    return Number(value);
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
