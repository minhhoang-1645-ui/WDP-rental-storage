import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RenewalsService } from '../renewals/renewals.service.js';

export interface InvoiceListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
  type?: 'INITIAL' | 'RECURRING' | 'RENEWAL';
  billingCycle?: number;
  renewalCycle?: number;
}

export interface PaymentListQuery {
  page: number;
  limit: number;
  search?: string;
  method?: 'BANK_TRANSFER' | 'CASH';
}

type HistoricalQuote = {
  currency?: unknown;
  billingMode?: unknown;
  paymentPlan?: unknown;
  quantity?: unknown;
  monthlyUnitPrice?: unknown;
  rentalAmount?: unknown;
  depositAmount?: unknown;
  termMonths?: unknown;
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renewals: RenewalsService = new RenewalsService(prisma),
  ) {}

  async ensureInitialInvoice(tx: Prisma.TransactionClient, reservationId: string) {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { contracts: { select: { id: true } }, units: { select: { id: true } } },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo Invoice.');
    if (reservation.units.length !== reservation.quantity || reservation.contracts.length !== reservation.quantity) {
      throw new ConflictException('Reservation phải có đủ allocation và RentalContract trước khi tạo Invoice.');
    }
    const snapshot = reservation.quoteSnapshot as HistoricalQuote;
    const amounts = this.initialAmounts(snapshot);
    const initialPeriodEnd = snapshot.billingMode === 'MONTHLY' && snapshot.paymentPlan === 'PAY_MONTHLY'
      ? this.addCalendarMonths(reservation.startDate, 1)
      : reservation.endDate;
    return tx.invoice.upsert({
      where: { reservationId_billingCycle: { reservationId, billingCycle: 1 } },
      update: {},
      create: {
        invoiceCode: `${reservation.reservationCode}-I01`,
        reservationId,
        type: 'INITIAL',
        billingCycle: 1,
        billingPeriodStart: reservation.startDate,
        billingPeriodEnd: initialPeriodEnd,
        dueAt: reservation.startDate,
        status: 'OPEN',
        rentalAmount: amounts.rental,
        depositAmount: amounts.deposit,
        totalAmount: amounts.total,
        amountPaid: 0n,
        balanceDue: amounts.total,
        currency: amounts.currency,
      },
    });
  }

  async ensureRecurringInvoices(tx: Prisma.TransactionClient, reservationId: string) {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { contracts: { select: { status: true } } },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo recurring Invoice.');
    if (reservation.contracts.length !== reservation.quantity || reservation.contracts.some((contract) => contract.status !== 'ACTIVE')) {
      throw new ConflictException('Recurring Invoice chỉ được tạo sau khi tất cả RentalContract đã ACTIVE.');
    }
    const snapshot = reservation.quoteSnapshot as HistoricalQuote;
    if (snapshot.billingMode !== 'MONTHLY' || snapshot.paymentPlan !== 'PAY_MONTHLY') return [];
    const termMonths = Number(snapshot.termMonths);
    if (!Number.isSafeInteger(termMonths) || termMonths < 1) throw new ConflictException('quoteSnapshot.termMonths không hợp lệ.');
    if (termMonths === 1) return [];
    const quantity = Number(snapshot.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity !== reservation.quantity) throw new ConflictException('quoteSnapshot.quantity không hợp lệ.');
    const monthlyRental = this.snapshotMoney(snapshot.monthlyUnitPrice, 'monthlyUnitPrice') * BigInt(quantity);
    const invoices = [];
    for (let cycle = 2; cycle <= termMonths; cycle += 1) {
      const periodStart = this.addCalendarMonths(reservation.startDate, cycle - 1);
      const calculatedEnd = this.addCalendarMonths(reservation.startDate, cycle);
      const periodEnd = cycle === termMonths ? reservation.endDate : calculatedEnd;
      if (periodStart >= reservation.endDate || periodEnd > reservation.endDate || periodEnd <= periodStart) throw new ConflictException('Kỳ recurring vượt quá ngày kết thúc Reservation.');
      invoices.push(await tx.invoice.upsert({
        where: { reservationId_billingCycle: { reservationId, billingCycle: cycle } },
        update: {},
        create: {
          invoiceCode: `${reservation.reservationCode}-I${String(cycle).padStart(2, '0')}`,
          reservationId,
          type: 'RECURRING',
          billingCycle: cycle,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          dueAt: periodStart,
          status: 'OPEN',
          rentalAmount: monthlyRental,
          depositAmount: 0n,
          totalAmount: monthlyRental,
          amountPaid: 0n,
          balanceDue: monthlyRental,
          currency: 'VND',
        },
      }));
    }
    return invoices;
  }

  async listCustomerInvoices(customerId: string, page: number, limit: number) {
    const where: Prisma.InvoiceWhereInput = { reservation: { customerId } };
    return this.invoicePage(where, page, limit, false);
  }

  async getCustomerInvoice(customerId: string, id: string) {
    const record = await this.prisma.invoice.findFirst({
      where: { OR: [{ id }, { invoiceCode: id }], reservation: { customerId } },
      include: this.invoiceInclude(),
    });
    if (!record) throw new NotFoundException('Không tìm thấy hóa đơn.');
    return this.toInvoice(record, false);
  }

  async listCustomerPayments(customerId: string, page: number, limit: number) {
    const where: Prisma.PaymentWhereInput = { invoice: { reservation: { customerId } } };
    return this.paymentPage(where, page, limit, false);
  }

  async getCustomerPayment(customerId: string, id: string) {
    const record = await this.prisma.payment.findFirst({
      where: { OR: [{ id }, { paymentCode: id }], invoice: { reservation: { customerId } } },
      include: this.paymentInclude(),
    });
    if (!record) throw new NotFoundException('Không tìm thấy thanh toán.');
    return this.toPayment(record, false);
  }

  async listManagerInvoices(query: InvoiceListQuery) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.billingCycle ? { billingCycle: query.billingCycle } : {}),
      ...(query.renewalCycle ? { renewalCycle: query.renewalCycle } : {}),
      ...(query.search ? { OR: [
        { invoiceCode: { contains: query.search, mode: 'insensitive' } },
        { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
        { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    return this.invoicePage(where, query.page, query.limit, true);
  }

  async getManagerInvoice(id: string) {
    const record = await this.prisma.invoice.findFirst({ where: { OR: [{ id }, { invoiceCode: id }] }, include: this.invoiceInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy hóa đơn.');
    return this.toInvoice(record, true);
  }

  async listManagerPayments(query: PaymentListQuery) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.method ? { method: query.method } : {}),
      ...(query.search ? { OR: [
        { paymentCode: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
        { invoice: { invoiceCode: { contains: query.search, mode: 'insensitive' } } },
        { invoice: { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } } },
        { invoice: { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } } },
        { invoice: { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } } },
      ] } : {}),
    };
    return this.paymentPage(where, query.page, query.limit, true);
  }

  async getManagerPayment(id: string) {
    const record = await this.prisma.payment.findFirst({ where: { OR: [{ id }, { paymentCode: id }] }, include: this.paymentInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy thanh toán.');
    return this.toPayment(record, true);
  }

  async recordPayment(invoiceId: string, input: Record<string, unknown>, idempotencyKey: string | undefined, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được ghi nhận thanh toán.');
    const parsed = this.paymentInput(input, idempotencyKey);
    const invoiceIdentity = await this.prisma.invoice.findFirst({ where: { OR: [{ id: invoiceId }, { invoiceCode: invoiceId }] }, select: { id: true } });
    if (!invoiceIdentity) throw new NotFoundException('Không tìm thấy hóa đơn.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceIdentity.id} FOR UPDATE`);
        const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentInclude() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceIdentity.id }, include: { reservation: { select: { id: true } } } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
        if (parsed.amount > invoice.balanceDue) throw new BadRequestException('Số tiền thanh toán không được vượt quá số dư hóa đơn.');

        const sequence = await tx.payment.count({ where: { invoiceId: invoice.id } }) + 1;
        const payment = await tx.payment.create({
          data: {
            paymentCode: `${invoice.invoiceCode}-P${String(sequence).padStart(2, '0')}`,
            invoiceId: invoice.id,
            amount: parsed.amount,
            method: parsed.method,
            reference: parsed.reference,
            note: parsed.note,
            recordedByUserId: actor.id,
            idempotencyKey: parsed.idempotencyKey,
          },
        });
        const amountPaid = invoice.amountPaid + parsed.amount;
        const balanceDue = invoice.totalAmount - amountPaid;
        const paid = balanceDue === 0n;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid, balanceDue, status: paid ? 'PAID' : 'PARTIALLY_PAID', paidAt: paid ? new Date() : null },
        });
        if (paid && invoice.type === 'INITIAL') {
          await tx.rentalContract.updateMany({
            where: { reservationId: invoice.reservation.id, status: 'PENDING_PAYMENT' },
            data: { status: 'READY_FOR_HANDOVER' },
          });
        }
        if (paid && invoice.type === 'RENEWAL' && invoice.renewalRequestId) {
          await this.renewals.completeAfterPayment(tx, invoice.renewalRequestId);
        }
        const result = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: this.paymentInclude() });
        return this.paymentResult(result);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentInclude() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Hóa đơn vừa được cập nhật. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  async backfillMissingInitialInvoices() {
    const reservations = await this.prisma.reservation.findMany({
      where: { status: 'CONFIRMED', contracts: { some: {} }, invoices: { none: { type: 'INITIAL' } } },
      select: { id: true, reservationCode: true },
      orderBy: { createdAt: 'asc' },
    });
    const created: string[] = [];
    const skipped: Array<{ reservation: string; reason: string }> = [];
    for (const reservation of reservations) {
      try {
        await this.prisma.$transaction((tx) => this.ensureInitialInvoice(tx, reservation.id));
        created.push(reservation.reservationCode);
      } catch (error) {
        skipped.push({ reservation: reservation.reservationCode, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return { candidates: reservations.length, created, skipped };
  }

  async backfillRecurringInvoices() {
    const reservations = await this.prisma.reservation.findMany({
      where: { status: 'CONFIRMED', contracts: { some: { status: 'ACTIVE' }, every: { status: 'ACTIVE' } } },
      select: { id: true, reservationCode: true },
      orderBy: { createdAt: 'asc' },
    });
    const processed: Array<{ reservation: string; recurringInvoices: number }> = [];
    const skipped: Array<{ reservation: string; reason: string }> = [];
    for (const reservation of reservations) {
      try {
        const invoices = await this.prisma.$transaction((tx) => this.ensureRecurringInvoices(tx, reservation.id));
        processed.push({ reservation: reservation.reservationCode, recurringInvoices: invoices.length });
      } catch (error) {
        skipped.push({ reservation: reservation.reservationCode, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return { candidates: reservations.length, processed, skipped };
  }

  private initialAmounts(snapshot: HistoricalQuote) {
    if (snapshot.currency !== 'VND') throw new ConflictException('quoteSnapshot thiếu currency VND hợp lệ.');
    const billingMode = snapshot.billingMode;
    const paymentPlan = snapshot.paymentPlan;
    if (!['DAILY', 'MONTHLY'].includes(String(billingMode)) || !['PAY_MONTHLY', 'PREPAID'].includes(String(paymentPlan))) {
      throw new ConflictException('quoteSnapshot thiếu billingMode hoặc paymentPlan hợp lệ.');
    }
    const deposit = this.snapshotMoney(snapshot.depositAmount, 'depositAmount');
    let rental: bigint;
    if (billingMode === 'DAILY' || paymentPlan === 'PREPAID') {
      rental = this.snapshotMoney(snapshot.rentalAmount, 'rentalAmount');
    } else {
      const monthlyUnitPrice = this.snapshotMoney(snapshot.monthlyUnitPrice, 'monthlyUnitPrice');
      const quantity = Number(snapshot.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new ConflictException('quoteSnapshot.quantity không hợp lệ.');
      rental = monthlyUnitPrice * BigInt(quantity);
    }
    return { currency: 'VND', rental, deposit, total: rental + deposit };
  }

  private snapshotMoney(value: unknown, field: string) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ConflictException(`quoteSnapshot.${field} không hợp lệ.`);
    return BigInt(Number(value));
  }

  private paymentInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const amount = Number(input.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('amount phải là số nguyên VND lớn hơn 0.');
    const method = typeof input.method === 'string' ? input.method : '';
    if (!['BANK_TRANSFER', 'CASH'].includes(method)) throw new BadRequestException('method phải là BANK_TRANSFER hoặc CASH.');
    const reference = this.optionalText(input.reference, 200, 'reference');
    const note = this.optionalText(input.note, 2000, 'note');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { amount: BigInt(amount), method: method as 'BANK_TRANSFER' | 'CASH', reference, note, idempotencyKey: key };
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private assertMatchingRetry(duplicate: any, invoiceId: string, parsed: { amount: bigint; method: 'BANK_TRANSFER' | 'CASH'; reference: string | null }) {
    if (duplicate.invoiceId !== invoiceId || duplicate.amount !== parsed.amount || duplicate.method !== parsed.method || (duplicate.reference ?? '') !== (parsed.reference ?? '')) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một thanh toán khác.');
    }
  }

  private async invoicePage(where: Prisma.InvoiceWhereInput, page: number, limit: number, includeCustomer: boolean) {
    const [total, items] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], include: this.invoiceInclude() }),
    ]);
    return { page, limit, total, items: items.map((item) => this.toInvoice(item, includeCustomer)) };
  }

  private async paymentPage(where: Prisma.PaymentWhereInput, page: number, limit: number, includeCustomer: boolean) {
    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }], include: this.paymentInclude() }),
    ]);
    return { page, limit, total, items: items.map((item) => this.toPayment(item, includeCustomer)) };
  }

  private invoiceInclude() {
    return {
      reservation: { include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        storageType: { select: { id: true, code: true, name: true, condition: true } },
        contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } } } } }, orderBy: { contractCode: 'asc' as const } },
      } },
      payments: { include: { recordedBy: { select: { id: true, fullName: true, role: true } } }, orderBy: { receivedAt: 'asc' as const } },
      renewalRequest: { select: { id: true, renewalCode: true, status: true, quoteSnapshot: true } },
    };
  }

  private paymentInclude() {
    return {
      recordedBy: { select: { id: true, fullName: true, role: true } },
      invoice: { include: { reservation: { include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        contracts: { select: { id: true, contractCode: true, status: true }, orderBy: { contractCode: 'asc' as const } },
      } } } },
    };
  }

  private toInvoice(record: any, includeCustomer: boolean) {
    const reservation = record.reservation;
    return {
      id: record.id,
      invoiceCode: record.invoiceCode,
      type: record.type,
      billingCycle: record.billingCycle,
      renewalCycle: record.renewalCycle,
      renewalRequest: record.renewalRequest ? { id: record.renewalRequest.id, renewalCode: record.renewalRequest.renewalCode, status: record.renewalRequest.status } : null,
      billingPeriodStart: this.isoDate(record.billingPeriodStart),
      billingPeriodEnd: this.isoDate(record.billingPeriodEnd),
      dueAt: this.isoDate(record.dueAt),
      isPastDue: record.dueAt !== null && record.dueAt < new Date() && record.status !== 'PAID',
      status: record.status,
      reservation: {
        id: reservation.id,
        reference: reservation.reservationCode,
        status: reservation.status,
        quantity: reservation.quantity,
        storageType: reservation.storageType,
        ...(includeCustomer ? { customer: reservation.customer } : {}),
      },
      rentalAmount: this.money(record.rentalAmount),
      depositAmount: this.money(record.depositAmount),
      totalAmount: this.money(record.totalAmount),
      amountPaid: this.money(record.amountPaid),
      balanceDue: this.money(record.balanceDue),
      currency: record.currency,
      issuedAt: record.issuedAt.toISOString(),
      paidAt: record.paidAt?.toISOString() ?? null,
      historicalPricing: record.type === 'RENEWAL' ? record.renewalRequest?.quoteSnapshot : reservation.quoteSnapshot,
      contracts: reservation.contracts.map((contract: any) => ({
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        storageUnit: { id: contract.reservationUnit.storageUnit.id, unitCode: contract.reservationUnit.storageUnit.unitNumber, physicalStatus: contract.reservationUnit.storageUnit.status },
      })),
      payments: record.payments.map((payment: any) => this.paymentSummary(payment)),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toPayment(record: any, includeCustomer: boolean) {
    return {
      id: record.id,
      paymentCode: record.paymentCode,
      amount: this.money(record.amount),
      method: record.method,
      reference: record.reference,
      note: record.note,
      receivedAt: record.receivedAt.toISOString(),
      invoice: {
        id: record.invoice.id,
        invoiceCode: record.invoice.invoiceCode,
        status: record.invoice.status,
        totalAmount: this.money(record.invoice.totalAmount),
        amountPaid: this.money(record.invoice.amountPaid),
        balanceDue: this.money(record.invoice.balanceDue),
        reservation: {
          id: record.invoice.reservation.id,
          reference: record.invoice.reservation.reservationCode,
          ...(includeCustomer ? { customer: record.invoice.reservation.customer } : {}),
        },
      },
      recordedBy: record.recordedBy,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private paymentSummary(record: any) {
    return { id: record.id, paymentCode: record.paymentCode, amount: this.money(record.amount), method: record.method, reference: record.reference, receivedAt: record.receivedAt.toISOString(), recordedBy: record.recordedBy };
  }

  private paymentResult(payment: any) {
    return { payment: this.toPayment(payment, true), invoice: { invoiceCode: payment.invoice.invoiceCode, status: payment.invoice.status, amountPaid: this.money(payment.invoice.amountPaid), balanceDue: this.money(payment.invoice.balanceDue) }, contracts: payment.invoice.reservation.contracts.map((contract: any) => ({ contractCode: contract.contractCode, status: contract.status })) };
  }

  private money(value: bigint) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) throw new ConflictException('Giá trị tiền tệ lưu trữ không hợp lệ.');
    return Number(value);
  }

  private addCalendarMonths(original: Date, months: number) {
    const day = original.getUTCDate();
    const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1));
    const daysInTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, daysInTargetMonth));
    return result;
  }

  private isoDate(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }

  private isPrismaCode(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
