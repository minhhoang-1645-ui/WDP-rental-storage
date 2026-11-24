import { assertInvoiceReceivable, initialPaymentWindowClosed } from './invoice-state.js';
import { managerReservationScope, assertManagerRecordAccess } from '../facility-access/record-access.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { businessToday } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { closeoutPaymentAllowed, closeoutReservationSelect, invoicePaymentBlockedBySchedule, renewalInvoiceScope } from './renewal-invoice-schedule.js';
import { RenewalsService } from '../renewals/renewals.service.js';
import { earlyReturnSettlementPending } from '../returns/return-period-closeout.js';
import { invoiceSigningRequirements } from './payment-eligibility.js';
import { homogeneousInvoiceUnits, invoiceBreakdown, invoiceContractInclude, invoiceMoney, invoiceUnit, savedInvoiceBreakdown } from './invoice-breakdown.js';

export interface InvoiceListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  type?: 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'SETTLEMENT';
  billingCycle?: number;
  renewalCycle?: number;
}

export interface PaymentListQuery {
  page: number;
  limit: number;
  search?: string;
  method?: 'BANK_TRANSFER' | 'CASH' | 'VNPAY';
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
  startDate?: string;
  endDate?: string;
  storageTypeName?: string;
  services?: { serviceId: string; physicalUnit?: string | null }[];
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renewals: RenewalsService = new RenewalsService(prisma),
  ) {}

  async ensureInitialInvoice(tx: Prisma.TransactionClient, reservationId: string) {
    const key = { reservationId_billingCycle: { reservationId, billingCycle: 1 } };
    const existing = await tx.invoice.findUnique({ where: key });
    if (existing) return existing;
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { contracts: { include: invoiceContractInclude }, units: { select: { id: true } }, services: true },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo Invoice.');
    if (reservation.units.length !== reservation.quantity || reservation.contracts.length !== reservation.quantity) {
      throw new ConflictException('Reservation phải có đủ allocation và RentalContract trước khi tạo Invoice.');
    }
    const snapshot = reservation.quoteSnapshot as HistoricalQuote;
    const initialPeriodEnd = snapshot.billingMode === 'MONTHLY' && snapshot.paymentPlan === 'PAY_MONTHLY'
      ? this.addCalendarMonths(reservation.startDate, 1)
      : reservation.endDate;
    if (Number(snapshot.quantity) !== reservation.quantity || reservation.contracts.some(contract => contract.reservationUnit.storageUnit.storageTypeId !== reservation.storageTypeId || contract.reservationUnit.reservationId !== reservationId)) {
      throw new ConflictException('Báo giá và danh sách kho không khớp hóa đơn ban đầu.');
    }
    const monthlyRate = this.snapshotMoney(snapshot.monthlyUnitPrice, 'monthlyUnitPrice');
    const deposit = this.snapshotMoney(snapshot.depositAmount, 'depositAmount');
    const wholeTerm = snapshot.billingMode === 'DAILY' || snapshot.paymentPlan === 'PREPAID';
    if (snapshot.currency !== 'VND' || !['DAILY', 'MONTHLY'].includes(String(snapshot.billingMode)) || !['PAY_MONTHLY', 'PREPAID'].includes(String(snapshot.paymentPlan))) {
      throw new ConflictException('quoteSnapshot thiếu tiền tệ hoặc hình thức thanh toán hợp lệ.');
    }
    const rental = wholeTerm ? this.snapshotMoney(snapshot.rentalAmount, 'rentalAmount') : monthlyRate * BigInt(reservation.quantity);
    const serviceLines = this.serviceLines(reservation.services, snapshot, reservation.startDate, initialPeriodEnd, wholeTerm ? 'whole' : 'initial');
    const totals = this.invoiceTotals(rental, deposit, serviceLines);
    const units = homogeneousInvoiceUnits(reservation.contracts, monthlyRate, rental, deposit, snapshot.storageTypeName);
    const breakdown = invoiceBreakdown(reservation.startDate, initialPeriodEnd, units, serviceLines, totals);
    return tx.invoice.upsert({
      where: key,
      update: {},
      create: {
        pricingSnapshot: { ...reservation.quoteSnapshot as Prisma.JsonObject, breakdown },
        invoiceCode: `${reservation.reservationCode}-I01`,
        storageTypeIdSnapshot: reservation.storageTypeId,
        reservationId,
        type: 'INITIAL',
        billingCycle: 1,
        billingPeriodStart: reservation.startDate,
        billingPeriodEnd: initialPeriodEnd,
        dueAt: reservation.expiresAt ?? reservation.startDate,
        status: 'OPEN',
        ...totals,
        amountPaid: 0n,
        balanceDue: totals.totalAmount,
        currency: 'VND',
      },
    });
  }

  async ensureRecurringInvoices(tx: Prisma.TransactionClient, reservationId: string, startedBefore?: Date) {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { contracts: { include: invoiceContractInclude, orderBy: { contractCode: 'asc' } }, services: true },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo recurring Invoice.');
    if (reservation.contracts.length !== reservation.quantity || !reservation.contracts.some(contract => contract.status === 'ACTIVE')
        || reservation.contracts.some(contract => !['ACTIVE', 'COMPLETED'].includes(contract.status))) {
      throw new ConflictException('Recurring Invoice cần đủ hợp đồng đã được bàn giao.');
    }
    const snapshot = reservation.quoteSnapshot as HistoricalQuote;
    if (snapshot.billingMode !== 'MONTHLY' || snapshot.paymentPlan !== 'PAY_MONTHLY') return [];
    const termMonths = Number(snapshot.termMonths);
    if (!Number.isSafeInteger(termMonths) || termMonths < 1) throw new ConflictException('quoteSnapshot.termMonths không hợp lệ.');
    if (termMonths === 1) return [];
    const originalRate = this.snapshotMoney(snapshot.monthlyUnitPrice, 'monthlyUnitPrice');
    const originalStart = snapshot.startDate ? new Date(snapshot.startDate + 'T00:00:00Z') : reservation.startDate;
    const originalEnd = snapshot.endDate ? new Date(snapshot.endDate + 'T00:00:00Z') : this.addCalendarMonths(originalStart, termMonths);
    if (!Number.isFinite(+originalStart) || !Number.isFinite(+originalEnd) || originalEnd <= originalStart) {
      throw new ConflictException('Thiếu kỳ thuê gốc hợp lệ để lập hóa đơn.');
    }
    const existing = await tx.invoice.findMany({ where: { reservationId, billingCycle: { gte: 2 } } });
    const byCycle = new Map(existing.map(invoice => [invoice.billingCycle, invoice]));
    const invoices = [];
    for (let cycle = 2; cycle <= termMonths; cycle += 1) {
      const issued = byCycle.get(cycle);
      if (issued) {
        invoices.push(issued);
        continue;
      }
      const periodStart = this.addCalendarMonths(originalStart, cycle - 1);
      if (startedBefore && periodStart >= startedBefore) break;
      const nominalEnd = this.addCalendarMonths(originalStart, cycle);
      const periodEnd = cycle === termMonths && originalEnd < nominalEnd ? originalEnd : nominalEnd;
      if (periodEnd > originalEnd || periodEnd <= periodStart) throw new ConflictException('Kỳ thu vượt quá thời hạn thuê gốc. Cần đối soát.');
      const billed = reservation.contracts.flatMap(contract => {
        const returnedOn = contract.status === 'COMPLETED' && contract.completedAt ? businessToday(contract.completedAt) : null;
        const billableEnd = returnedOn && returnedOn < contract.endDate ? returnedOn : contract.endDate;
        return contract.startDate < periodEnd && billableEnd > periodStart ? [{ contract }] : [];
      });
      if (!billed.length) continue;
      if (billed.some(({ contract }) => contract.startDate > periodStart || contract.endDate < periodEnd
          || contract.reservationUnit.plannedStartDate > periodStart
          || (contract.status === 'COMPLETED' && !contract.completedAt)
          || (contract.rateEffectiveFrom && contract.rateEffectiveFrom > periodStart && contract.rateEffectiveFrom < periodEnd))) {
        throw new ConflictException('Kỳ thu có thay đổi hợp đồng giữa kỳ hoặc thiếu dữ liệu phân bổ. Cần đối soát trước khi lập hóa đơn.');
      }
      const units = billed.map(({ contract }) => {
        const usesNewRate = contract.rateEffectiveFrom !== null && contract.rateEffectiveFrom <= periodStart;
        const rate = usesNewRate ? contract.currentMonthlyRate : originalRate;
        if (rate === null || rate <= 0n || contract.reservationUnit.reservationId !== reservationId) throw new ConflictException('Chưa có đơn giá hoặc kho hợp lệ cho kỳ thu.');
        return invoiceUnit(contract, rate, rate, 0n, usesNewRate ? undefined : snapshot.storageTypeName);
      });
      const serviceLines = this.serviceLines(reservation.services, snapshot, periodStart, periodEnd, 'recurring');
      const totals = this.invoiceTotals(units.reduce((sum, unit) => sum + BigInt(unit.rentalAmount), 0n), 0n, serviceLines);
      const breakdown = invoiceBreakdown(periodStart, periodEnd, units, serviceLines, totals);
      invoices.push(await tx.invoice.upsert({
        where: { reservationId_billingCycle: { reservationId, billingCycle: cycle } },
        update: {},
        create: {
          invoiceCode: `${reservation.reservationCode}-I${String(cycle).padStart(2, '0')}`,
          storageTypeIdSnapshot: units.every(unit => unit.storageTypeId === units[0].storageTypeId) ? units[0].storageTypeId : null,
          pricingSnapshot: { ...reservation.quoteSnapshot as Prisma.JsonObject, breakdown },
          reservationId,
          type: 'RECURRING',
          billingCycle: cycle,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          dueAt: periodStart,
          status: 'OPEN',
          ...totals,
          amountPaid: 0n,
          balanceDue: totals.totalAmount,
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

  async listManagerInvoices(query: InvoiceListQuery, actor: PublicUser) {
    const where: Prisma.InvoiceWhereInput = {
      AND:[{reservation:managerReservationScope(actor)}],
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

  async getManagerInvoice(id: string, actor: PublicUser) {
    const record = await this.prisma.invoice.findFirst({ where: { reservation:managerReservationScope(actor), OR: [{ id }, { invoiceCode: id }] }, include: this.invoiceInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy hóa đơn.');
    return this.toInvoice(record, true);
  }

  async listManagerPayments(query: PaymentListQuery, actor: PublicUser) {
    const where: Prisma.PaymentWhereInput = {
      AND:[{invoice:{reservation:managerReservationScope(actor)}}],
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

  async getManagerPayment(id: string, actor: PublicUser) {
    const record = await this.prisma.payment.findFirst({ where: { invoice:{reservation:managerReservationScope(actor)}, OR: [{ id }, { paymentCode: id }] }, include: this.paymentInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy thanh toán.');
    return this.toPayment(record, true);
  }

  async recordPayment(invoiceId: string, input: Record<string, unknown>, idempotencyKey: string | undefined, actor: PublicUser, transaction?: Prisma.TransactionClient) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được ghi nhận thanh toán.');
    const parsed = this.paymentInput(input, idempotencyKey);
    const database = transaction ?? this.prisma;
    const invoiceIdentity = await database.invoice.findFirst({ where: { OR: [{ id: invoiceId }, { invoiceCode: invoiceId }] }, select: { id: true } });
    if (!invoiceIdentity) throw new NotFoundException('Không tìm thấy hóa đơn.');

    const apply = async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceIdentity.id} FOR UPDATE`);
        await assertManagerRecordAccess(tx,actor,{invoiceId:invoiceIdentity.id});
        const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentInclude() });
        if (duplicate) {
          await assertManagerRecordAccess(tx,actor,{invoiceId:invoiceIdentity.id});
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceIdentity.id }, include: { reservation: { select: closeoutReservationSelect }, renewalRequest: renewalInvoiceScope } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        assertInvoiceReceivable(invoice);
        if (invoicePaymentBlockedBySchedule(invoice)) throw new ConflictException({ code: 'RENEWAL_INVOICE_NOT_DUE', message: 'Hóa đơn gia hạn chưa đến kỳ thanh toán. Kho được duyệt trả trước hạn có thể thanh toán sớm để tất toán.' });
        await this.assertSignedBeforePayment(tx, invoice);
        if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
        if (parsed.amount > invoice.balanceDue) throw new BadRequestException('Số tiền thanh toán không được vượt quá số dư hóa đơn.');

        if(parsed.method==='BANK_TRANSFER') await this.assertUnusedBankReference(tx,parsed.reference!);
        const sequence = await tx.payment.count({ where: { invoiceId: invoice.id } }) + 1;
        const payment = await tx.payment.create({
          data: {
            paymentCode: `${invoice.invoiceCode}-P${String(sequence).padStart(2, '0')}`,
            invoiceId: invoice.id,
            amount: parsed.amount,
            method: parsed.method,
            reference: parsed.reference,
            bankDestinationKey: parsed.bankDestinationKey,
            bankTransactionReference: parsed.bankTransactionReference,
            note: parsed.note,
            recordedByUserId: actor.id,
            idempotencyKey: parsed.idempotencyKey,
          },
        });
        await this.applyInvoicePayment(tx, invoice, parsed.amount, actor.id);
        const result = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: this.paymentInclude() });
        return this.paymentResult(result);
    };
    try {
      return transaction ? await apply(transaction) : await this.prisma.$transaction(apply, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (!transaction && this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentInclude() });
        if (duplicate) {
          await assertManagerRecordAccess(database,actor,{invoiceId:invoiceIdentity.id});
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
        if (parsed.method === 'BANK_TRANSFER') throw new ConflictException('Giao dịch ngân hàng này đã được ghi nhận cho một hóa đơn khác.');
      }
      if (transaction && this.isPrismaCode(error, 'P2002') && parsed.method === 'BANK_TRANSFER') throw new ConflictException('Giao dịch ngân hàng này đã được ghi nhận cho một hóa đơn khác.');
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Hóa đơn vừa được cập nhật. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  demoPaymentEnabled(actor: PublicUser) {
    const email = actor.email.toLowerCase();
    return process.env.DEMO_PAYMENT_ENABLED === 'true' && process.env.NODE_ENV !== 'production' && (email.endsWith('@wdp.test') || ['customer@test.com', 'manager@test.com', 'admin@test.com'].includes(email));
  }

  async createDemoPaymentSubmission(customer: PublicUser, invoiceId: string, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (!this.demoPaymentEnabled(customer)) throw new ForbiddenException('Thanh toán demo không khả dụng cho tài khoản hoặc môi trường này.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu thanh toán demo không hợp lệ.');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key không hợp lệ.');
    const reference = `WDP-DEMO-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    return this.createCustomerPaymentSubmission(customer.id, invoiceId, {
      amount: input.amount,
      method: 'BANK_TRANSFER',
      transferReference: reference,
      customerNote: 'THANH TOÁN DEMO - KHÔNG CÓ TIỀN CHUYỂN KHOẢN THẬT.',
    }, key, true);
  }

  async createCustomerPaymentSubmission(customerId: string, invoiceId: string, input: Record<string, unknown>, idempotencyKey: string | undefined, demo = false) {
    const parsed = this.paymentSubmissionInput(input, idempotencyKey);
    if (!demo && parsed.transferReference?.startsWith('WDP-DEMO-')) throw new BadRequestException('Mã tham chiếu demo chỉ được tạo qua luồng demo.');
    const identity = await this.prisma.invoice.findFirst({ where: { OR: [{ id: invoiceId }, { invoiceCode: invoiceId }], reservation: { customerId } }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy hóa đơn.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${identity.id} FOR UPDATE`);
        const duplicate = await tx.paymentSubmission.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentSubmissionInclude() });
        if (duplicate) {
          this.assertMatchingSubmissionRetry(duplicate, identity.id, customerId, parsed);
          return this.toPaymentSubmission(duplicate);
        }
        const invoice = await tx.invoice.findFirst({ where: { id: identity.id, reservation: { customerId } }, select: { id: true, invoiceCode: true, status: true, amountPaid:true, balanceDue: true, type: true, renewalCycle: true, dueAt: true, reservation: { select: closeoutReservationSelect }, renewalRequest: renewalInvoiceScope } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        assertInvoiceReceivable(invoice);
        if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
        if (invoicePaymentBlockedBySchedule(invoice)) throw new ConflictException({ code: 'RENEWAL_INVOICE_NOT_DUE', message: 'Hóa đơn gia hạn chưa đến kỳ thanh toán. Kho được duyệt trả trước hạn có thể thanh toán sớm để tất toán.' });
        if (!['OPEN', 'PARTIALLY_PAID'].includes(invoice.status)) throw new ConflictException('Hóa đơn hiện không thể nhận yêu cầu thanh toán.');
        if (parsed.amount > invoice.balanceDue) throw new BadRequestException('Số tiền gửi xác nhận không được vượt quá số dư hiện tại.');
        const sequence = await tx.paymentSubmission.count({ where: { invoiceId: invoice.id } }) + 1;
        const record = await tx.paymentSubmission.create({
          data: {
            submissionCode: `${invoice.invoiceCode}-S${String(sequence).padStart(2, '0')}`,
            invoiceId: invoice.id,
            customerUserId: customerId,
            amount: parsed.amount,
            method: 'BANK_TRANSFER',
            transferReference: parsed.transferReference,
            customerNote: parsed.customerNote,
            idempotencyKey: parsed.idempotencyKey,
          },
          include: this.paymentSubmissionInclude(),
        });
        return this.toPaymentSubmission(record);
      }, { maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.paymentSubmission.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentSubmissionInclude() });
        if (duplicate) {
          this.assertMatchingSubmissionRetry(duplicate, identity.id, customerId, parsed);
          return this.toPaymentSubmission(duplicate);
        }
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Hóa đơn vừa được cập nhật. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  async listCustomerPaymentSubmissions(customerId: string, page: number, limit: number) {
    return this.paymentSubmissionPage({ customerUserId: customerId }, page, limit);
  }

  async getCustomerPaymentSubmission(customerId: string, id: string) {
    const record = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }], customerUserId: customerId }, include: this.paymentSubmissionInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    return this.toPaymentSubmission(record);
  }

  async listManagerPaymentSubmissions(query: { page: number; limit: number; status?: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'; search?: string; invoiceCode?: string }, actor: PublicUser) {
    const where: Prisma.PaymentSubmissionWhereInput = {
      AND:[{invoice:{reservation:managerReservationScope(actor)}}],
      ...(query.status ? { status: query.status } : {}),
      ...(query.invoiceCode ? { invoice: { invoiceCode: { contains: query.invoiceCode, mode: 'insensitive' } } } : {}),
      ...(query.search ? { OR: [
        { submissionCode: { contains: query.search, mode: 'insensitive' } },
        { transferReference: { contains: query.search, mode: 'insensitive' } },
        { invoice: { invoiceCode: { contains: query.search, mode: 'insensitive' } } },
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { email: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
    };
    return this.paymentSubmissionPage(where, query.page, query.limit);
  }

  async getManagerPaymentSubmission(id: string, actor: PublicUser) {
    const record = await this.prisma.paymentSubmission.findFirst({ where: { invoice:{reservation:managerReservationScope(actor)}, OR: [{ id }, { submissionCode: id }] }, include: this.paymentSubmissionInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    return this.toPaymentSubmission(record);
  }

  async verifyPaymentSubmission(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được xác nhận thanh toán.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu xác nhận không hợp lệ.');
    const details = { reference: this.optionalText(input.reference, 200, 'reference'), note: this.optionalText(input.note, 2000, 'note') };
    const identity = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentSubmission" WHERE "id" = ${identity.id} FOR UPDATE`);
        const submission = await tx.paymentSubmission.findUnique({ where: { id: identity.id }, include: this.paymentSubmissionInclude() });
        if (!submission) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
        await assertManagerRecordAccess(tx,actor,{invoiceId:submission.invoiceId});
        const demo = this.isDemoSubmission(submission);
        if (demo && !this.demoPaymentEnabled(actor)) throw new ForbiddenException('Chỉ Manager demo trong môi trường phát triển được xác nhận giao dịch demo.');
        if (!demo && !details.reference) throw new BadRequestException('reference giao dịch ngân hàng là bắt buộc để xác nhận.');
        if (submission.status === 'VERIFIED') return this.toPaymentSubmission(submission);
        if(submission.reconciliation){if(submission.reconciliation.providerTransactionId!==details.reference)throw new ConflictException('Hồ sơ đã đối soát theo mã giao dịch khác.');return this.toPaymentSubmission(submission);}
        if (submission.status !== 'PENDING_VERIFICATION') throw new ConflictException('Yêu cầu đã bị từ chối và không thể xác nhận.');
        const invoice = await tx.invoice.findUnique({ where: { id: submission.invoiceId }, include:{reservation:{select:closeoutReservationSelect}} });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        if(!demo && (invoice.status==='VOID'||initialPaymentWindowClosed(invoice)||invoice.status==='PAID'||submission.amount>invoice.balanceDue)) {
          const bankReference=details.reference!.trim();
          await this.assertUnusedBankReference(tx,bankReference);
          const reason='Đã xác minh chuyển khoản nhưng hóa đơn/đơn đặt kho không còn nhận khoản này. Không kích hoạt lại đơn; cần đối soát và xử lý tiền thực nhận.';
          await tx.onlinePaymentReconciliation.upsert({where:{paymentSubmissionId:submission.id},update:{},create:{
            reconciliationCode:'WDP-BANK-RC-'+submission.id,paymentSubmissionId:submission.id,
            externalReferenceKey:'BANK_TRANSFER:'+bankReference.toUpperCase(),providerTransactionId:bankReference,amount:submission.amount,reason}});
          const updated=await tx.paymentSubmission.update({where:{id:submission.id},data:{status:'REJECTED',rejectionReason:reason,reviewedByUserId:actor.id,reviewedAt:new Date()},include:this.paymentSubmissionInclude()});
          return this.toPaymentSubmission(updated);
        }
        if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
        if (submission.amount > invoice.balanceDue) throw new ConflictException('Số tiền yêu cầu vượt quá số dư hiện tại của hóa đơn.');
        const payment = await this.recordPayment(submission.invoiceId, {
          amount: Number(submission.amount),
          method: 'BANK_TRANSFER',
          reference: demo ? submission.transferReference : details.reference ?? submission.transferReference,
          note: demo ? 'THANH TOÁN DEMO - KHÔNG CÓ TIỀN THẬT.' : details.note ?? submission.customerNote,
        }, `payment-submission:${submission.id}`, actor, tx);
        const updated = await tx.paymentSubmission.update({
          where: { id: submission.id },
          data: { status: 'VERIFIED', reviewedByUserId: actor.id, reviewedAt: new Date(), verifiedPaymentId: payment.payment.id },
          include: this.paymentSubmissionInclude(),
        });
        return { ...this.toPaymentSubmission(updated), payment: payment.payment, invoice: payment.invoice, contracts: payment.contracts };
      }, { maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) throw new ConflictException('Giao dịch ngân hàng này đã được ghi nhận cho một hóa đơn khác.');
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Yêu cầu hoặc hóa đơn vừa được cập nhật. Vui lòng tải lại.');
      throw error;
    }
  }

  async rejectPaymentSubmission(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được từ chối yêu cầu thanh toán.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu từ chối không hợp lệ.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 1000) throw new BadRequestException('reason là bắt buộc và không được vượt quá 1000 ký tự.');
    const identity = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentSubmission" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.paymentSubmission.findUnique({ where: { id: identity.id } });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
        await assertManagerRecordAccess(tx,actor,{invoiceId:current.invoiceId});
      if (current.status === 'REJECTED' && current.rejectionReason === reason) {
        const rejected = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: current.id }, include: this.paymentSubmissionInclude() });
        return this.toPaymentSubmission(rejected);
      }
      if (current.status !== 'PENDING_VERIFICATION') throw new ConflictException('Chỉ yêu cầu đang chờ xác nhận mới có thể bị từ chối.');
      const updated = await tx.paymentSubmission.update({ where: { id: current.id }, data: { status: 'REJECTED', reviewedByUserId: actor.id, reviewedAt: new Date(), rejectionReason: reason }, include: this.paymentSubmissionInclude() });
      return this.toPaymentSubmission(updated);
    }, { maxWait: 10000, timeout: 20000 });
  }

  async recordVerifiedOnlinePayment(tx: Prisma.TransactionClient, invoice: any, transaction: any, providerTransactionId: string | null) {
    if (!['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) throw new ConflictException({ code: 'INVOICE_NOT_ELIGIBLE_FOR_ONLINE_PAYMENT', message: 'Loại hóa đơn này chưa hỗ trợ thanh toán online.' });
    const existing = await tx.payment.findUnique({ where: { onlinePaymentTransactionId: transaction.id } });
    if (existing) return existing;
    assertInvoiceReceivable(invoice);
    await this.assertSignedBeforePayment(tx,invoice);
    if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
    if (transaction.amount !== invoice.balanceDue) throw new ConflictException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Số tiền giao dịch không khớp số dư hóa đơn.' });
    const sequence = await tx.payment.count({ where: { invoiceId: invoice.id } }) + 1;
    const payment = await tx.payment.create({ data: { paymentCode: `${invoice.invoiceCode}-P${String(sequence).padStart(2, '0')}`, invoiceId: invoice.id, amount: transaction.amount, method: 'VNPAY', reference: providerTransactionId ?? transaction.merchantOrderRef, note: 'Verified automatically by VNPAY IPN.', recordedByUserId: null, onlinePaymentTransactionId: transaction.id, idempotencyKey: `vnpay:${transaction.id}` } });
    await this.applyInvoicePayment(tx, invoice, transaction.amount, null);
    return payment;
  }

  async assertSignedBeforePayment(tx: Prisma.TransactionClient, invoice: { type: string; reservationId: string; renewalRequestId: string | null }) {
    if (invoice.type === 'INITIAL') {
      const reservation=await tx.reservation.findUnique({where:{id:invoice.reservationId},select:{quantity:true}});
      const contracts = await tx.rentalContract.findMany({ where: { reservationId: invoice.reservationId }, select: { termsAcceptedAt: true } });
      if (!reservation || contracts.length!==reservation.quantity || !contracts.length || contracts.some((contract) => !contract.termsAcceptedAt)) throw new ConflictException({ code: 'CONTRACT_ACCEPTANCE_REQUIRED', message: 'Vui lòng xác nhận tất cả hợp đồng trước khi thanh toán.' });
    }
    if (invoice.type === 'RENEWAL' && invoice.renewalRequestId) {
      const renewal = await tx.renewalRequest.findUnique({ where: { id: invoice.renewalRequestId }, select: { appendixAcceptedAt: true, status: true } });
      if (!renewal || (!renewal.appendixAcceptedAt && renewal.status !== 'COMPLETED')) throw new ConflictException({ code: 'APPENDIX_ACCEPTANCE_REQUIRED', message: 'Vui lòng xác nhận phụ lục gia hạn trước khi thanh toán.' });
    }
  }

  private async applyInvoicePayment(tx: Prisma.TransactionClient, invoice: any, amount: bigint, actorId: string | null) {
    const amountPaid = BigInt(invoice.amountPaid) + amount;
    const balanceDue = BigInt(invoice.totalAmount) - amountPaid;
    const paid = balanceDue === 0n;
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, balanceDue, status: paid ? 'PAID' : 'PARTIALLY_PAID', paidAt: paid ? new Date() : null } });
    if (paid && invoice.type === 'INITIAL') {
      assertInvoiceReceivable(invoice);
      await tx.rentalContract.updateMany({ where: { reservationId: invoice.reservation.id, status: 'PENDING_PAYMENT' }, data: { status: 'READY_FOR_HANDOVER' } });
      await tx.reservation.update({ where: { id: invoice.reservation.id }, data: { expiresAt: null } });
    }
    if (paid && invoice.type === 'RENEWAL' && invoice.renewalRequestId) await this.renewals.completeAfterPayment(tx, invoice.renewalRequestId);
    if (paid && invoice.type === 'SETTLEMENT' && invoice.depositSettlementId) {
      if (!actorId) throw new ConflictException('Settlement payment yêu cầu người ghi nhận nội bộ.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DepositSettlement" WHERE "id" = ${invoice.depositSettlementId} FOR UPDATE`);
      const settlement = await tx.depositSettlement.findUnique({ where: { id: invoice.depositSettlementId } });
      if (!settlement || settlement.status !== 'AWAITING_OUTSTANDING_PAYMENT' || settlement.refundAmount !== 0n) throw new ConflictException('Settlement Invoice không khớp trạng thái quyết toán hiện tại.');
      const now = new Date();
      await tx.depositSettlement.update({ where: { id: settlement.id }, data: { status: 'SETTLED', settledByUserId: actorId, settledAt: now } });
      const record = await tx.returnRequest.findUniqueOrThrow({ where: { id: settlement.returnRequestId }, select: { earlyReturnCloseout: true, rentRefundApprovedAt: true, rentRefundedAt: true } });
      if (earlyReturnSettlementPending(record)) return;
      const completed = await tx.returnRequest.updateMany({ where: { id: settlement.returnRequestId, status: 'PENDING_SETTLEMENT', physicallyReturnedAt: { not: null } }, data: { status: 'COMPLETED', completedAt: now, completedByUserId: actorId, activeKey: null } });
      if (completed.count !== 1) throw new ConflictException('Không thể hoàn tất ReturnRequest sau khi thanh toán settlement.');
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
        await this.prisma.$transaction((tx) => this.ensureInitialInvoice(tx, reservation.id), { maxWait: 10000, timeout: 20000 });
        created.push(reservation.reservationCode);
      } catch (error) {
        skipped.push({ reservation: reservation.reservationCode, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return { candidates: reservations.length, created, skipped };
  }

  private async paymentSubmissionPage(where: Prisma.PaymentSubmissionWhereInput, page: number, limit: number) {
    const [total, records] = await Promise.all([
      this.prisma.paymentSubmission.count({ where }),
      this.prisma.paymentSubmission.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }], include: this.paymentSubmissionInclude() }),
    ]);
    return { page, limit, total, items: records.map((record) => this.toPaymentSubmission(record)) };
  }

  private paymentSubmissionInclude() {
    return {
      reconciliation: {select:{id:true,reconciliationCode:true,status:true,reason:true,providerTransactionId:true,resolutionNote:true,reviewedAt:true}},
      invoice: { include: { reservation: { include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        storageType: { select: { id: true, code: true, name: true } },
      } } } },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, fullName: true, role: true } },
      verifiedPayment: { select: { id: true, paymentCode: true, amount: true, method: true, reference: true, receivedAt: true } },
    };
  }

  private toPaymentSubmission(record: any) {
    return {
      id: record.id,
      isDemo: this.isDemoSubmission(record),
      submissionCode: record.submissionCode,
      reconciliation:record.reconciliation??null,
      status: record.status,
      amount: this.money(record.amount),
      method: record.method,
      transferReference: record.transferReference,
      customerNote: record.customerNote,
      submittedAt: record.submittedAt.toISOString(),
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      reviewedBy: record.reviewedBy,
      rejectionReason: record.rejectionReason,
      verifiedPayment: record.verifiedPayment ? { ...record.verifiedPayment, amount: this.money(record.verifiedPayment.amount), receivedAt: record.verifiedPayment.receivedAt.toISOString() } : null,
      customer: record.customer,
      invoice: {
        id: record.invoice.id,
        invoiceCode: record.invoice.invoiceCode,
        status: record.invoice.status,
        totalAmount: this.money(record.invoice.totalAmount),
        amountPaid: this.money(record.invoice.amountPaid),
        balanceDue: this.money(record.invoice.balanceDue),
        currency: record.invoice.currency,
        reservation: {
          id: record.invoice.reservation.id,
          reference: record.invoice.reservation.reservationCode,
          customer: record.invoice.reservation.customer,
          storageType: record.invoice.reservation.storageType,
        },
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async backfillRecurringInvoices() {
    const reservations = await this.prisma.reservation.findMany({
      where: { status: 'CONFIRMED', contracts: { some: { status: 'ACTIVE' } } },
      select: { id: true, reservationCode: true },
      orderBy: { createdAt: 'asc' },
    });
    const processed: Array<{ reservation: string; recurringInvoices: number }> = [];
    const skipped: Array<{ reservation: string; reason: string }> = [];
    for (const reservation of reservations) {
      try {
        const invoices = await this.prisma.$transaction((tx) => this.ensureRecurringInvoices(tx, reservation.id), { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
        processed.push({ reservation: reservation.reservationCode, recurringInvoices: invoices.length });
      } catch (error) {
        skipped.push({ reservation: reservation.reservationCode, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return { candidates: reservations.length, processed, skipped };
  }

  private invoiceTotals(rentalAmount: bigint, depositAmount: bigint, lines: { amount: number }[]) {
    const serviceAmount = lines.reduce((sum, line) => sum + BigInt(line.amount), 0n);
    const totalAmount = rentalAmount + depositAmount + serviceAmount;
    return { rentalAmount, depositAmount, serviceAmount, totalAmount };
  }

  private serviceLines(services: Prisma.ReservationServiceGetPayload<object>[], snapshot: HistoricalQuote, start: Date, end: Date, mode: 'whole' | 'initial' | 'recurring') {
    return services.flatMap(service => {
      if (mode === 'recurring' && service.serviceKindSnapshot !== 'RENTAL') return [];
      const amount = mode === 'whole' || service.billingUnitSnapshot === 'ONE_TIME'
        ? service.amountSnapshot : this.serviceChargeForPeriod(service, start, end);
      if (!amount) return [];
      const physicalUnit = Array.isArray(snapshot.services) ? snapshot.services.find(item => item.serviceId === service.additionalServiceId)?.physicalUnit : null;
      const periodRate = service.unitPriceSnapshot * BigInt(service.quantity);
      const billablePeriods = service.billingUnitSnapshot !== 'ONE_TIME' && periodRate > 0n && amount % periodRate === 0n
        ? invoiceMoney(amount / periodRate) : undefined;
      return [{
        id: service.id, name: service.serviceNameSnapshot, quantity: service.quantity,
        billingUnit: service.billingUnitSnapshot, unitPrice: invoiceMoney(service.unitPriceSnapshot),
        ...(physicalUnit ? { physicalUnit } : {}), ...(billablePeriods === undefined ? {} : { billablePeriods }), amount: invoiceMoney(amount),
      }];
    });
  }

  private serviceChargeForPeriod(service: { billingUnitSnapshot: 'ONE_TIME' | 'DAY' | 'MONTH'; unitPriceSnapshot: bigint; quantity: number; serviceStartDate: Date | null; serviceEndDate: Date | null }, periodStart: Date, periodEnd: Date) {
    if (!service.serviceStartDate || !service.serviceEndDate) return 0n;
    if (service.billingUnitSnapshot === 'ONE_TIME') return 0n;
    const start = service.serviceStartDate > periodStart ? service.serviceStartDate : periodStart;
    const end = service.serviceEndDate < periodEnd ? service.serviceEndDate : periodEnd;
    if (end <= start) return 0n;
    if (service.billingUnitSnapshot === 'DAY') return service.unitPriceSnapshot * BigInt(service.quantity) * BigInt(Math.round((end.getTime() - start.getTime()) / 86400000));
    let amount = 0n;
    let cursor = service.serviceStartDate, monthOffset = 0;
    while (cursor < service.serviceEndDate) {
      if (cursor >= periodStart && cursor < periodEnd) amount += service.unitPriceSnapshot * BigInt(service.quantity);
      cursor = this.addCalendarMonths(service.serviceStartDate, ++monthOffset);
    }
    return amount;
  }

  private snapshotMoney(value: unknown, field: string) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ConflictException(`quoteSnapshot.${field} không hợp lệ.`);
    return BigInt(Number(value));
  }

  private async assertUnusedBankReference(tx: Prisma.TransactionClient, reference: string) {
    const normalized=reference.trim().toUpperCase();
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`bank-proof:${normalized}`}))`);
    const ledger=await tx.onlinePaymentReconciliation.findUnique({where:{externalReferenceKey:'BANK_TRANSFER:'+normalized},select:{id:true}});
    const payment=await tx.payment.findFirst({where:{method:'BANK_TRANSFER',OR:[{bankTransactionReference:{equals:reference,mode:'insensitive'}},{reference:{equals:reference,mode:'insensitive'}}]},select:{id:true}});
    if(ledger||payment)throw new ConflictException('Giao dịch ngân hàng đã có chứng từ thu hoặc hồ sơ đối soát. Không ghi nhận lại.');
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
    const bankTransactionReference = method === 'BANK_TRANSFER' ? reference : null;
    if (method === 'BANK_TRANSFER' && !bankTransactionReference) throw new BadRequestException('reference giao dịch ngân hàng đã đối chiếu là bắt buộc.');
    return {
      amount: BigInt(amount),
      method: method as 'BANK_TRANSFER' | 'CASH',
      reference,
      bankTransactionReference,
      bankDestinationKey: method === 'BANK_TRANSFER' ? this.bankDestinationKey() : null,
      note,
      idempotencyKey: key,
    };
  }

  private paymentSubmissionInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu thông báo thanh toán không hợp lệ.');
    const amount = Number(input.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('amount phải là số nguyên VND lớn hơn 0.');
    if (input.method !== undefined && input.method !== 'BANK_TRANSFER') throw new BadRequestException('Khách hàng chỉ được gửi yêu cầu BANK_TRANSFER.');
    const transferReference = this.optionalText(input.transferReference, 200, 'transferReference');
    const customerNote = this.optionalText(input.customerNote, 1000, 'customerNote');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { amount: BigInt(amount), transferReference, customerNote, idempotencyKey: key };
  }

  private isDemoSubmission(record: { transferReference: string | null; customerNote: string | null }) {
    return Boolean(record.transferReference?.startsWith('WDP-DEMO-') && record.customerNote?.startsWith('THANH TOÁN DEMO'));
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

  private bankDestinationKey() {
    const bankCode = process.env.WDP_BANK_CODE?.trim() ?? '';
    const accountNumber = process.env.WDP_BANK_ACCOUNT_NUMBER?.trim() ?? '';
    if (!/^\d{6}$/.test(bankCode) || !accountNumber) {
      throw new ConflictException('Chưa cấu hình tài khoản nhận chuyển khoản để đối soát giao dịch ngân hàng.');
    }
    return createHash('sha256').update(`${bankCode}\u0000${accountNumber}`).digest('hex');
  }

  private assertMatchingSubmissionRetry(duplicate: any, invoiceId: string, customerId: string, parsed: { amount: bigint; transferReference: string | null; customerNote: string | null }) {
    if (duplicate.invoiceId !== invoiceId || duplicate.customerUserId !== customerId || duplicate.amount !== parsed.amount || (duplicate.transferReference ?? '') !== (parsed.transferReference ?? '') || (duplicate.customerNote ?? '') !== (parsed.customerNote ?? '')) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một yêu cầu thanh toán khác.');
    }
  }

  private async invoicePage(where: Prisma.InvoiceWhereInput, page: number, limit: number, includeCustomer: boolean) {
    const scheduled: Prisma.InvoiceWhereInput = { type: 'RENEWAL', renewalCycle: { gt: 1 }, dueAt: { gt: businessToday() }, status: 'OPEN', amountPaid: 0n };
    const candidates = await this.prisma.invoice.findMany({
      where: { AND: [where, scheduled, { reservation: { supportRequests: { some: closeoutReservationSelect.supportRequests.where } } }] },
      select: { id: true, reservation: { select: closeoutReservationSelect }, renewalRequest: renewalInvoiceScope },
    });
    const closeoutIds = candidates.filter(invoice => closeoutPaymentAllowed(invoice.reservation, invoice.renewalRequest?.rentalContractId)).map(invoice => invoice.id);
    where = { AND: [where, { OR: [
      { NOT: scheduled },
      { id: { in: closeoutIds } },
    ] }] };
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
        services: true,
        contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } } } } }, orderBy: { contractCode: 'asc' as const } },
        supportRequests: closeoutReservationSelect.supportRequests,
      } },
      payments: { include: { recordedBy: { select: { id: true, fullName: true, role: true } } }, orderBy: { receivedAt: 'asc' as const } },
      renewalRequest: { select: { id: true, renewalCode: true, rentalContractId: true, status: true, quoteSnapshot: true, appendixAcceptedAt: true } },
      depositSettlement: { select: { id: true, settlementCode: true, status: true } },
      replacesInvoice: { select: { id: true, invoiceCode: true } },
      replacementInvoice: { select: { id: true, invoiceCode: true } },
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
    const historicalQuote = reservation.quoteSnapshot as HistoricalQuote | null;
    const serviceUnits = new Map(Array.isArray(historicalQuote?.services)
      ? historicalQuote.services.map(item => [item.serviceId, item.physicalUnit ?? null]) : []);
    return {
      id: record.id,
      invoiceCode: record.invoiceCode,
      signing: invoiceSigningRequirements(record),
      type: record.type,
      billingCycle: record.billingCycle,
      renewalCycle: record.renewalCycle,
      renewalRequest: record.renewalRequest ? { id: record.renewalRequest.id, renewalCode: record.renewalRequest.renewalCode, status: record.renewalRequest.status } : null,
      depositSettlement: record.depositSettlement,
      billingPeriodStart: this.isoDate(record.billingPeriodStart),
      billingPeriodEnd: this.isoDate(record.billingPeriodEnd),
      dueAt: this.isoDate(record.dueAt),
      isPastDue: record.dueAt !== null && record.dueAt < new Date() && ['OPEN', 'PARTIALLY_PAID'].includes(record.status),
      status: record.status,
      voidReason: record.voidReason ?? null, voidedAt: record.voidedAt?.toISOString() ?? null,
      closeoutPaymentAllowed: closeoutPaymentAllowed(reservation, record.renewalRequest?.rentalContractId),
      reservation: {
        id: reservation.id,
        reference: reservation.reservationCode,
        status: reservation.status,
        expiresAt: reservation.expiresAt?.toISOString() ?? null,
        quantity: reservation.quantity,
        storageType: reservation.storageType,
        ...(includeCustomer ? { customer: reservation.customer } : {}),
      },
      rentalAmount: this.money(record.rentalAmount),
      depositAmount: this.money(record.depositAmount),
      serviceAmount: this.money(record.serviceAmount),
      chargeAmount: this.money(record.chargeAmount),
      totalAmount: this.money(record.totalAmount),
      amountPaid: this.money(record.amountPaid),
      balanceDue: this.money(record.balanceDue),
      currency: record.currency,
      issuedAt: record.issuedAt.toISOString(),
      paidAt: record.paidAt?.toISOString() ?? null,
      replacesInvoiceId: record.replacesInvoiceId ?? null,
      replacesInvoice: record.replacesInvoice ?? null,
      replacementInvoice: record.replacementInvoice ?? null,
      breakdown: savedInvoiceBreakdown(record.pricingSnapshot, record),
      historicalPricing: record.pricingSnapshot ?? (record.type === 'SETTLEMENT' ? null : record.type === 'RENEWAL' ? record.renewalRequest?.quoteSnapshot : reservation.quoteSnapshot),
      contracts: reservation.contracts.filter((contract: any) => !record.renewalRequest?.rentalContractId || record.renewalRequest.rentalContractId === contract.id).map((contract: any) => ({
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        storageUnit: { id: contract.reservationUnit.storageUnit.id, unitCode: contract.reservationUnit.storageUnit.unitNumber, physicalStatus: contract.reservationUnit.storageUnit.status },
      })),
      payments: record.payments.map((payment: any) => this.paymentSummary(payment)),
      services: reservation.services?.map((service: any) => ({ code: service.serviceCodeSnapshot, name: service.serviceNameSnapshot, kind: service.serviceKindSnapshot, billingUnit: service.billingUnitSnapshot, physicalUnit: serviceUnits.get(service.additionalServiceId) ?? null, unitPrice: this.money(service.unitPriceSnapshot), quantity: service.quantity, serviceStartDate: this.isoDate(service.serviceStartDate), serviceEndDate: this.isoDate(service.serviceEndDate), amount: this.money(service.amountSnapshot) })) ?? [],
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
