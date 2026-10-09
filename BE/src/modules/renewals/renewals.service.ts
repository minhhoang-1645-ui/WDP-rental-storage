import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PricingService } from '../pricing/pricing.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;
type PaymentPlan = 'PAY_MONTHLY' | 'PREPAID';
type RenewalStatus = 'PENDING' | 'APPROVED_PENDING_PAYMENT' | 'COMPLETED' | 'REJECTED';

export interface RenewalListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: RenewalStatus;
}

type RenewalSnapshot = {
  currency: 'VND';
  storageTypeId: string;
  storageTypeName: string;
  quantity: number;
  previousEndDate: string;
  renewalStartDate: string;
  requestedEndDate: string;
  termMonths: number;
  paymentPlan: PaymentPlan;
  monthlyUnitPrice: number;
  baseRentalAmount: number;
  discountPercent: number;
  discountAmount: number;
  rentalAmount: number;
  depositAmount: 0;
  totalAmount: number;
};

@Injectable()
export class RenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService = new PricingService(prisma),
  ) {}

  async createCustomerRenewal(customerId: string, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const parsed = this.createInput(input, idempotencyKey);
    const identity = await this.prisma.reservation.findFirst({
      where: { customerId, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] },
      select: { id: true },
    });
    if (!identity) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');

    const duplicate = await this.prisma.renewalRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
    if (duplicate) {
      this.assertMatchingRetry(duplicate, customerId, parsed.termMonths, parsed.paymentPlan, identity.id);
      return this.toRenewal(duplicate, false);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id }, include: this.activeRentalInclude() });
        const rental = this.assertActiveRental(reservation, customerId);
        await this.lockUnits(tx, rental.unitIds);
        const existing = await tx.renewalRequest.findFirst({ where: { reservationId: reservation!.id, status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT'] } } });
        if (existing) throw new ConflictException({ code: 'ACTIVE_RENEWAL_EXISTS', message: 'Rental này đã có yêu cầu gia hạn chưa được xử lý.' });

        const requestedEndDate = this.addCalendarMonths(rental.endDate, parsed.termMonths);
        await this.assertNoAllocationConflict(tx, reservation!.id, rental.unitIds, rental.endDate, requestedEndDate);
        const quote = this.pricing.calculate(reservation!.storageType, {
          storageTypeId: reservation!.storageTypeId,
          quantity: reservation!.quantity,
          startDate: this.isoDate(rental.endDate),
          endDate: this.isoDate(requestedEndDate),
          paymentPlan: parsed.paymentPlan,
        });
        if (quote.billingMode !== 'MONTHLY' || quote.termMonths !== parsed.termMonths) throw new ConflictException('Không thể tạo báo giá gia hạn theo tháng.');
        const snapshot: RenewalSnapshot = {
          currency: 'VND', storageTypeId: reservation!.storageTypeId, storageTypeName: reservation!.storageType.name,
          quantity: reservation!.quantity, previousEndDate: this.isoDate(rental.endDate), renewalStartDate: this.isoDate(rental.endDate),
          requestedEndDate: this.isoDate(requestedEndDate), termMonths: parsed.termMonths, paymentPlan: parsed.paymentPlan,
          monthlyUnitPrice: quote.monthlyUnitPrice, baseRentalAmount: quote.baseRentalAmount, discountPercent: quote.discountPercent,
          discountAmount: quote.discountAmount, rentalAmount: quote.rentalAmount, depositAmount: 0, totalAmount: quote.rentalAmount,
        };
        const created = await tx.renewalRequest.create({
          data: {
            renewalCode: this.reference(), reservationId: reservation!.id, previousEndDate: rental.endDate, requestedEndDate,
            termMonths: parsed.termMonths, paymentPlan: parsed.paymentPlan, quoteSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            requestedByUserId: customerId, activeKey: reservation!.id, idempotencyKey: parsed.idempotencyKey,
          },
          include: this.include(),
        });
        return this.toRenewal(created, false);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const retry = await this.prisma.renewalRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (retry) {
          this.assertMatchingRetry(retry, customerId, parsed.termMonths, parsed.paymentPlan, identity.id);
          return this.toRenewal(retry, false);
        }
        throw new ConflictException({ code: 'ACTIVE_RENEWAL_EXISTS', message: 'Rental này đã có yêu cầu gia hạn chưa được xử lý.' });
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Rental vừa được cập nhật. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  listCustomerRenewals(customerId: string, page: number, limit: number) {
    return this.page({ reservation: { customerId } }, { page, limit }, false);
  }

  async getCustomerRenewal(customerId: string, id: string) {
    const record = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }], reservation: { customerId } }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return this.toRenewal(record, false);
  }

  listManagerRenewals(query: RenewalListQuery) {
    const filters: Prisma.RenewalRequestWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push({ OR: [
      { renewalCode: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
      { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      { reservation: { units: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
    ] });
    return this.page(filters.length ? { AND: filters } : {}, query, true);
  }

  async getManagerRenewal(id: string) {
    const record = await this.find(id, this.prisma);
    return this.toRenewal(record, true);
  }

  async approve(id: string, actor: PublicUser) {
    this.assertManager(actor);
    const identity = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.renewalRequest.findUnique({ where: { id: identity.id }, include: this.include() });
        if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
        if (['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(current.status)) return this.toRenewal(current, true);
        if (current.status !== 'PENDING') throw new ConflictException('Chỉ Renewal PENDING mới được duyệt.');
        const rental = this.assertActiveRental(current.reservation);
        this.assertExpectedEnd(current, rental.endDate);
        await this.lockUnits(tx, rental.unitIds);
        await this.assertNoAllocationConflict(tx, current.reservationId, rental.unitIds, current.previousEndDate, current.requestedEndDate);
        const snapshot = this.snapshot(current);
        this.assertSnapshot(current, snapshot);
        await this.createInvoices(tx, current, snapshot);
        const updated = await tx.renewalRequest.update({
          where: { id: current.id },
          data: { status: 'APPROVED_PENDING_PAYMENT', reviewedByUserId: actor.id, reviewedAt: new Date(), approvedAt: new Date() },
          include: this.include(),
        });
        return this.toRenewal(updated, true);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Yêu cầu gia hạn vừa được cập nhật hoặc có allocation cạnh tranh. Vui lòng thử lại.');
      throw error;
    }
  }

  async reject(id: string, input: Record<string, unknown>, actor: PublicUser) {
    this.assertManager(actor);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 3 || reason.length > 2000) throw new BadRequestException('Lý do từ chối phải dài 3–2000 ký tự.');
    const identity = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.renewalRequest.findUnique({ where: { id: identity.id } });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
      if (current.status === 'REJECTED') return this.toRenewal(await this.find(current.id, tx), true);
      if (current.status !== 'PENDING') throw new ConflictException('Chỉ Renewal PENDING mới được từ chối.');
      const updated = await tx.renewalRequest.update({
        where: { id: current.id },
        data: { status: 'REJECTED', activeKey: null, reviewedByUserId: actor.id, reviewedAt: new Date(), rejectedAt: new Date(), rejectionReason: reason },
        include: this.include(),
      });
      return this.toRenewal(updated, true);
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
  }

  async completeAfterPayment(tx: Prisma.TransactionClient, renewalRequestId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${renewalRequestId} FOR UPDATE`);
    const renewal = await tx.renewalRequest.findUnique({ where: { id: renewalRequestId }, include: this.include() });
    if (!renewal || renewal.status === 'COMPLETED') return;
    if (renewal.status !== 'APPROVED_PENDING_PAYMENT') return;
    const snapshot = this.snapshot(renewal);
    this.assertSnapshot(renewal, snapshot);
    const activationInvoice = renewal.invoices.find((invoice: any) => invoice.renewalCycle === 1);
    if (!activationInvoice || activationInvoice.status !== 'PAID') return;

    const rental = this.assertActiveRental(renewal.reservation);
    this.assertExpectedEnd(renewal, rental.endDate);
    await this.lockUnits(tx, rental.unitIds);
    await this.assertNoAllocationConflict(tx, renewal.reservationId, rental.unitIds, renewal.previousEndDate, renewal.requestedEndDate);

    const contracts = await tx.rentalContract.updateMany({
      where: { reservationId: renewal.reservationId, status: 'ACTIVE', endDate: renewal.previousEndDate },
      data: { endDate: renewal.requestedEndDate },
    });
    if (contracts.count !== renewal.reservation.quantity) throw new ConflictException('Không thể gia hạn một phần hợp đồng.');
    const allocations = await tx.reservationUnit.updateMany({
      where: { reservationId: renewal.reservationId, releasedAt: null, plannedEndDate: renewal.previousEndDate },
      data: { plannedEndDate: renewal.requestedEndDate },
    });
    if (allocations.count !== renewal.reservation.quantity) throw new ConflictException('Không thể gia hạn một phần allocation.');
    await tx.reservation.update({ where: { id: renewal.reservationId }, data: { endDate: renewal.requestedEndDate } });
    await tx.renewalRequest.update({ where: { id: renewal.id }, data: { status: 'COMPLETED', activeKey: null } });
  }

  private async createInvoices(tx: Prisma.TransactionClient, renewal: any, snapshot: RenewalSnapshot) {
    const count = snapshot.paymentPlan === 'PREPAID' ? 1 : snapshot.termMonths;
    for (let cycle = 1; cycle <= count; cycle += 1) {
      const start = this.addCalendarMonths(renewal.previousEndDate, cycle - 1);
      const end = snapshot.paymentPlan === 'PREPAID'
        ? renewal.requestedEndDate
        : cycle === count ? renewal.requestedEndDate : this.addCalendarMonths(renewal.previousEndDate, cycle);
      const rentalAmount = BigInt(snapshot.paymentPlan === 'PREPAID' ? snapshot.rentalAmount : snapshot.monthlyUnitPrice * snapshot.quantity);
      await tx.invoice.upsert({
        where: { renewalRequestId_renewalCycle: { renewalRequestId: renewal.id, renewalCycle: cycle } },
        update: {},
        create: {
          invoiceCode: `${renewal.renewalCode}-I${String(cycle).padStart(2, '0')}`,
          reservationId: renewal.reservationId, renewalRequestId: renewal.id, type: 'RENEWAL', billingCycle: null, renewalCycle: cycle,
          billingPeriodStart: start, billingPeriodEnd: end, dueAt: start, status: 'OPEN', rentalAmount,
          depositAmount: 0n, totalAmount: rentalAmount, amountPaid: 0n, balanceDue: rentalAmount, currency: 'VND',
        },
      });
    }
  }

  private assertActiveRental(reservation: any, customerId?: string) {
    if (!reservation || (customerId && reservation.customerId !== customerId)) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');
    if (reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được gia hạn.');
    const original = reservation.quoteSnapshot as Record<string, unknown>;
    if (original.billingMode !== 'MONTHLY') throw new ConflictException('Renewal V1 chỉ hỗ trợ rental theo tháng.');
    if (reservation.contracts.length !== reservation.quantity || reservation.units.length !== reservation.quantity) throw new ConflictException('Rental không có đủ contract/allocation để gia hạn.');
    if (reservation.contracts.some((contract: any) => contract.status !== 'ACTIVE')) throw new ConflictException('Tất cả RentalContract phải ACTIVE.');
    if (reservation.contracts.some((contract: any) => contract.reservationUnit.storageUnit.status !== 'OCCUPIED' || contract.reservationUnit.releasedAt !== null)) {
      throw new ConflictException('Tất cả StorageUnit phải còn OCCUPIED bởi rental hiện tại.');
    }
    const timestamps = new Set(reservation.contracts.map((contract: any) => contract.endDate.getTime()));
    if (timestamps.size !== 1) throw new ConflictException({ code: 'RENEWAL_END_DATE_MISMATCH', message: 'Các hợp đồng ACTIVE có endDate không đồng nhất.' });
    return { endDate: reservation.contracts[0].endDate as Date, unitIds: reservation.contracts.map((contract: any) => contract.reservationUnit.storageUnitId as string) };
  }

  private async assertNoAllocationConflict(db: DbClient, reservationId: string, unitIds: string[], start: Date, end: Date) {
    const allocations = await db.reservationUnit.findMany({
      where: { reservationId: { not: reservationId }, storageUnitId: { in: unitIds }, releasedAt: null, plannedStartDate: { lt: end }, plannedEndDate: { gt: start }, reservation: { status: 'CONFIRMED' } },
      select: { storageUnitId: true, plannedStartDate: true, plannedEndDate: true, reservation: { select: { reservationCode: true } }, storageUnit: { select: { unitNumber: true } } },
    });
    const approvedRenewals = await db.renewalRequest.findMany({
      where: { reservationId: { not: reservationId }, status: 'APPROVED_PENDING_PAYMENT', previousEndDate: { lt: end }, requestedEndDate: { gt: start }, reservation: { units: { some: { storageUnitId: { in: unitIds }, releasedAt: null } } } },
      select: { renewalCode: true, previousEndDate: true, requestedEndDate: true, reservation: { select: { units: { where: { storageUnitId: { in: unitIds } }, select: { storageUnit: { select: { unitNumber: true } } } } } } },
    });
    if (allocations.length || approvedRenewals.length) {
      throw new ConflictException({
        code: 'RENEWAL_ALLOCATION_CONFLICT', message: 'Kho vật lý đã có allocation chặn khoảng gia hạn.',
        conflicts: [
          ...allocations.map((item) => ({ unitCode: item.storageUnit.unitNumber, reference: item.reservation.reservationCode, startDate: this.isoDate(item.plannedStartDate), endDate: this.isoDate(item.plannedEndDate) })),
          ...approvedRenewals.flatMap((item) => item.reservation.units.map((unit) => ({ unitCode: unit.storageUnit.unitNumber, reference: item.renewalCode, startDate: this.isoDate(item.previousEndDate), endDate: this.isoDate(item.requestedEndDate) }))),
        ],
      });
    }
  }

  private activeRentalInclude() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      storageType: true,
      contracts: { include: { reservationUnit: { include: { storageUnit: true } } }, orderBy: { contractCode: 'asc' as const } },
      units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' as const } },
    };
  }

  private include() {
    return {
      requestedBy: { select: { id: true, fullName: true, email: true } },
      reviewedBy: { select: { id: true, fullName: true, role: true } },
      reservation: { include: this.activeRentalInclude() },
      invoices: { include: { payments: { select: { id: true, paymentCode: true, amount: true, method: true, receivedAt: true }, orderBy: { receivedAt: 'asc' as const } } }, orderBy: { renewalCycle: 'asc' as const } },
    };
  }

  private async find(id: string, db: DbClient) {
    const record = await db.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return record;
  }

  private async page(where: Prisma.RenewalRequestWhereInput, query: { page: number; limit: number }, manager: boolean) {
    const [total, records] = await Promise.all([
      this.prisma.renewalRequest.count({ where }),
      this.prisma.renewalRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toRenewal(record, manager)) };
  }

  private toRenewal(record: any, manager: boolean) {
    const invoices = record.invoices.map((invoice: any) => ({
      id: invoice.id, invoiceCode: invoice.invoiceCode, type: invoice.type, renewalCycle: invoice.renewalCycle,
      billingPeriodStart: this.isoDate(invoice.billingPeriodStart), billingPeriodEnd: this.isoDate(invoice.billingPeriodEnd), dueAt: this.isoDate(invoice.dueAt),
      status: invoice.status, rentalAmount: this.money(invoice.rentalAmount), depositAmount: this.money(invoice.depositAmount), totalAmount: this.money(invoice.totalAmount),
      amountPaid: this.money(invoice.amountPaid), balanceDue: this.money(invoice.balanceDue),
      payments: invoice.payments.map((payment: any) => ({ ...payment, amount: this.money(payment.amount), receivedAt: payment.receivedAt.toISOString() })),
    }));
    return {
      id: record.id, renewalCode: record.renewalCode, status: record.status,
      reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, quantity: record.reservation.quantity, currentEndDate: this.isoDate(record.reservation.endDate), storageType: { id: record.reservation.storageType.id, code: record.reservation.storageType.code, name: record.reservation.storageType.name } },
      previousEndDate: this.isoDate(record.previousEndDate), requestedEndDate: this.isoDate(record.requestedEndDate), termMonths: record.termMonths, paymentPlan: record.paymentPlan,
      quoteSnapshot: record.quoteSnapshot, invoices,
      billingSummary: { totalInvoiced: invoices.reduce((sum: number, invoice: any) => sum + invoice.totalAmount, 0), totalPaid: invoices.reduce((sum: number, invoice: any) => sum + invoice.amountPaid, 0), totalOutstanding: invoices.reduce((sum: number, invoice: any) => sum + invoice.balanceDue, 0) },
      rejectionReason: record.rejectionReason, requestedAt: record.requestedAt.toISOString(), reviewedAt: record.reviewedAt?.toISOString() ?? null, approvedAt: record.approvedAt?.toISOString() ?? null, rejectedAt: record.rejectedAt?.toISOString() ?? null,
      ...(manager ? { customer: record.reservation.customer, contracts: record.reservation.contracts.map((contract: any) => ({ contractCode: contract.contractCode, status: contract.status, endDate: this.isoDate(contract.endDate), unitCode: contract.reservationUnit.storageUnit.unitNumber })) , requestedBy: record.requestedBy, reviewedBy: record.reviewedBy } : {}),
    };
  }

  private createInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const termMonths = Number(input.termMonths);
    if (!Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 120) throw new BadRequestException('termMonths phải là số nguyên từ 1 đến 120.');
    const paymentPlan = typeof input.paymentPlan === 'string' ? input.paymentPlan : '';
    if (!['PAY_MONTHLY', 'PREPAID'].includes(paymentPlan)) throw new BadRequestException('paymentPlan phải là PAY_MONTHLY hoặc PREPAID.');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { reservationId, termMonths, paymentPlan: paymentPlan as PaymentPlan, idempotencyKey: key };
  }

  private snapshot(record: any) {
    return record.quoteSnapshot as RenewalSnapshot;
  }

  private assertSnapshot(record: any, snapshot: RenewalSnapshot) {
    const valid = snapshot.currency === 'VND' && snapshot.storageTypeId === record.reservation.storageTypeId
      && snapshot.quantity === record.reservation.quantity && snapshot.previousEndDate === this.isoDate(record.previousEndDate)
      && snapshot.requestedEndDate === this.isoDate(record.requestedEndDate) && snapshot.termMonths === record.termMonths
      && snapshot.paymentPlan === record.paymentPlan && snapshot.depositAmount === 0
      && [snapshot.monthlyUnitPrice, snapshot.baseRentalAmount, snapshot.discountPercent, snapshot.discountAmount, snapshot.rentalAmount, snapshot.totalAmount].every(Number.isSafeInteger)
      && snapshot.monthlyUnitPrice > 0 && snapshot.totalAmount === snapshot.rentalAmount;
    if (!valid) throw new ConflictException('Renewal quoteSnapshot không hợp lệ hoặc không khớp yêu cầu.');
  }

  private assertExpectedEnd(record: any, actual: Date) {
    if (record.previousEndDate.getTime() !== actual.getTime()) throw new ConflictException({ code: 'RENEWAL_EFFECTIVE_END_CHANGED', message: 'Ngày kết thúc hiện tại đã thay đổi; yêu cầu gia hạn cần được xem xét lại.' });
  }

  private assertMatchingRetry(record: any, customerId: string, termMonths: number, paymentPlan: PaymentPlan, reservationId: string) {
    if (record.requestedByUserId !== customerId || record.reservationId !== reservationId || record.termMonths !== termMonths || record.paymentPlan !== paymentPlan) {
      throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu gia hạn khác.');
    }
  }

  private assertManager(actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được xử lý gia hạn.');
  }

  private lockUnits(tx: Prisma.TransactionClient, unitIds: string[]) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" IN (${Prisma.join(unitIds)}) ORDER BY "id" FOR UPDATE`);
  }

  private addCalendarMonths(original: Date, months: number) {
    const day = original.getUTCDate();
    const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1));
    const days = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, days));
    return result;
  }

  private reference() {
    return `WDPR-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }
  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException('Giá trị tiền tệ lưu trữ không hợp lệ.');
    return Number(value);
  }
  private isPrismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
}
