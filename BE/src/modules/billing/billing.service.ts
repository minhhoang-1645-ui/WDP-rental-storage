import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RenewalsService } from '../renewals/renewals.service.js';
import { invoiceSigningRequirements } from './payment-eligibility.js';

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
      include: { contracts: { select: { id: true } }, units: { select: { id: true } }, services: true },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo Invoice.');
    if (reservation.units.length !== reservation.quantity || reservation.contracts.length !== reservation.quantity) {
      throw new ConflictException('Reservation phải có đủ allocation và RentalContract trước khi tạo Invoice.');
    }
    const snapshot = reservation.quoteSnapshot as HistoricalQuote;
    const initialPeriodEnd = snapshot.billingMode === 'MONTHLY' && snapshot.paymentPlan === 'PAY_MONTHLY'
      ? this.addCalendarMonths(reservation.startDate, 1)
      : reservation.endDate;
    const amounts = this.initialAmounts(snapshot, reservation.services, reservation.startDate, initialPeriodEnd);
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
        dueAt: reservation.expiresAt ?? reservation.startDate,
        status: 'OPEN',
        rentalAmount: amounts.rental,
        depositAmount: amounts.deposit,
        serviceAmount: amounts.services,
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
      include: { contracts: { select: { status: true } }, services: true },
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
      const monthlyServices = reservation.services.filter((service) => service.serviceKindSnapshot === 'RENTAL').reduce((sum, service) => sum + this.serviceChargeForPeriod(service, periodStart, periodEnd), 0n);
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
          serviceAmount: monthlyServices,
          totalAmount: monthlyRental + monthlyServices,
          amountPaid: 0n,
          balanceDue: monthlyRental + monthlyServices,
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

  async recordPayment(invoiceId: string, input: Record<string, unknown>, idempotencyKey: string | undefined, actor: PublicUser, transaction?: Prisma.TransactionClient) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được ghi nhận thanh toán.');
    const parsed = this.paymentInput(input, idempotencyKey);
    const database = transaction ?? this.prisma;
    const invoiceIdentity = await database.invoice.findFirst({ where: { OR: [{ id: invoiceId }, { invoiceCode: invoiceId }] }, select: { id: true } });
    if (!invoiceIdentity) throw new NotFoundException('Không tìm thấy hóa đơn.');

    const apply = async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceIdentity.id} FOR UPDATE`);
        const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.paymentInclude() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceIdentity.id }, include: { reservation: { select: { id: true } } } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        await this.assertSignedBeforePayment(tx, invoice);
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
          this.assertMatchingRetry(duplicate, invoiceIdentity.id, parsed);
          return this.paymentResult(duplicate);
        }
      }
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
        const invoice = await tx.invoice.findFirst({ where: { id: identity.id, reservation: { customerId } }, select: { id: true, invoiceCode: true, status: true, balanceDue: true } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
        if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
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

  async listManagerPaymentSubmissions(query: { page: number; limit: number; status?: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'; search?: string; invoiceCode?: string }) {
    const where: Prisma.PaymentSubmissionWhereInput = {
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

  async getManagerPaymentSubmission(id: string) {
    const record = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }] }, include: this.paymentSubmissionInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    return this.toPaymentSubmission(record);
  }

  async verifyPaymentSubmission(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được xác nhận thanh toán.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu xác nhận không hợp lệ.');
    const details = { reference: this.optionalText(input.reference, 200, 'reference'), note: this.optionalText(input.note, 2000, 'note') };
    const identity = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentSubmission" WHERE "id" = ${identity.id} FOR UPDATE`);
        const submission = await tx.paymentSubmission.findUnique({ where: { id: identity.id }, include: this.paymentSubmissionInclude() });
        if (!submission) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
        const demo = this.isDemoSubmission(submission);
        if (demo && !this.demoPaymentEnabled(actor)) throw new ForbiddenException('Chỉ Manager demo trong môi trường phát triển được xác nhận giao dịch demo.');
        if (!demo && !details.reference) throw new BadRequestException('reference giao dịch ngân hàng là bắt buộc để xác nhận.');
        if (submission.status === 'VERIFIED') return this.toPaymentSubmission(submission);
        if (submission.status !== 'PENDING_VERIFICATION') throw new ConflictException('Yêu cầu đã bị từ chối và không thể xác nhận.');
        const invoice = await tx.invoice.findUnique({ where: { id: submission.invoiceId }, select: { status: true, balanceDue: true } });
        if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn.');
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
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Yêu cầu hoặc hóa đơn vừa được cập nhật. Vui lòng tải lại.');
      throw error;
    }
  }

  async rejectPaymentSubmission(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được từ chối yêu cầu thanh toán.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu từ chối không hợp lệ.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 1000) throw new BadRequestException('reason là bắt buộc và không được vượt quá 1000 ký tự.');
    const identity = await this.prisma.paymentSubmission.findFirst({ where: { OR: [{ id }, { submissionCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentSubmission" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.paymentSubmission.findUnique({ where: { id: identity.id } });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu xác nhận thanh toán.');
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
    if (invoice.status === 'PAID' || invoice.balanceDue === 0n) throw new ConflictException('Hóa đơn đã được thanh toán đầy đủ.');
    if (transaction.amount !== invoice.balanceDue) throw new ConflictException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Số tiền giao dịch không khớp số dư hóa đơn.' });
    const sequence = await tx.payment.count({ where: { invoiceId: invoice.id } }) + 1;
    const payment = await tx.payment.create({ data: { paymentCode: `${invoice.invoiceCode}-P${String(sequence).padStart(2, '0')}`, invoiceId: invoice.id, amount: transaction.amount, method: 'VNPAY', reference: providerTransactionId ?? transaction.merchantOrderRef, note: 'Verified automatically by VNPAY IPN.', recordedByUserId: null, onlinePaymentTransactionId: transaction.id, idempotencyKey: `vnpay:${transaction.id}` } });
    await this.applyInvoicePayment(tx, invoice, transaction.amount, null);
    return payment;
  }

  async assertSignedBeforePayment(tx: Prisma.TransactionClient, invoice: { type: string; reservationId: string; renewalRequestId: string | null }) {
    if (invoice.type === 'INITIAL') {
      const contracts = await tx.rentalContract.findMany({ where: { reservationId: invoice.reservationId }, select: { termsAcceptedAt: true } });
      if (!contracts.length || contracts.some((contract) => !contract.termsAcceptedAt)) throw new ConflictException({ code: 'CONTRACT_ACCEPTANCE_REQUIRED', message: 'Vui lòng xác nhận tất cả hợp đồng trước khi thanh toán.' });
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
      where: { status: 'CONFIRMED', contracts: { some: { status: 'ACTIVE' }, every: { status: 'ACTIVE' } } },
      select: { id: true, reservationCode: true },
      orderBy: { createdAt: 'asc' },
    });
    const processed: Array<{ reservation: string; recurringInvoices: number }> = [];
    const skipped: Array<{ reservation: string; reason: string }> = [];
    for (const reservation of reservations) {
      try {
        const invoices = await this.prisma.$transaction((tx) => this.ensureRecurringInvoices(tx, reservation.id), { maxWait: 10000, timeout: 20000 });
        processed.push({ reservation: reservation.reservationCode, recurringInvoices: invoices.length });
      } catch (error) {
        skipped.push({ reservation: reservation.reservationCode, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    return { candidates: reservations.length, processed, skipped };
  }

  private initialAmounts(snapshot: HistoricalQuote, services: Array<{ serviceKindSnapshot: 'PURCHASE' | 'RENTAL'; billingUnitSnapshot: 'ONE_TIME' | 'DAY' | 'MONTH'; unitPriceSnapshot: bigint; quantity: number; amountSnapshot: bigint; serviceStartDate: Date | null; serviceEndDate: Date | null }> = [], periodStart?: Date, periodEnd?: Date) {
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
    const oneTime = services.filter((service) => service.billingUnitSnapshot === 'ONE_TIME').reduce((sum, service) => sum + service.amountSnapshot, 0n);
    const rentals = services.filter((service) => service.billingUnitSnapshot === 'DAY' || service.billingUnitSnapshot === 'MONTH');
    const serviceAmount = billingMode === 'DAILY' || paymentPlan === 'PREPAID'
      ? oneTime + rentals.reduce((sum, service) => sum + service.amountSnapshot, 0n)
      : oneTime + rentals.reduce((sum, service) => sum + this.serviceChargeForPeriod(service, periodStart!, periodEnd!), 0n);
    return { currency: 'VND', rental, deposit, services: serviceAmount, total: rental + deposit + serviceAmount };
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

  private assertMatchingSubmissionRetry(duplicate: any, invoiceId: string, customerId: string, parsed: { amount: bigint; transferReference: string | null; customerNote: string | null }) {
    if (duplicate.invoiceId !== invoiceId || duplicate.customerUserId !== customerId || duplicate.amount !== parsed.amount || (duplicate.transferReference ?? '') !== (parsed.transferReference ?? '') || (duplicate.customerNote ?? '') !== (parsed.customerNote ?? '')) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một yêu cầu thanh toán khác.');
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
        services: true,
        contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } } } } }, orderBy: { contractCode: 'asc' as const } },
      } },
      payments: { include: { recordedBy: { select: { id: true, fullName: true, role: true } } }, orderBy: { receivedAt: 'asc' as const } },
      renewalRequest: { select: { id: true, renewalCode: true, status: true, quoteSnapshot: true, appendixAcceptedAt: true } },
      depositSettlement: { select: { id: true, settlementCode: true, status: true } },
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
      signing: invoiceSigningRequirements(record),
      type: record.type,
      billingCycle: record.billingCycle,
      renewalCycle: record.renewalCycle,
      renewalRequest: record.renewalRequest ? { id: record.renewalRequest.id, renewalCode: record.renewalRequest.renewalCode, status: record.renewalRequest.status } : null,
      depositSettlement: record.depositSettlement,
      billingPeriodStart: this.isoDate(record.billingPeriodStart),
      billingPeriodEnd: this.isoDate(record.billingPeriodEnd),
      dueAt: this.isoDate(record.dueAt),
      isPastDue: record.dueAt !== null && record.dueAt < new Date() && record.status !== 'PAID',
      status: record.status,
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
      historicalPricing: record.type === 'SETTLEMENT' ? null : record.type === 'RENEWAL' ? record.renewalRequest?.quoteSnapshot : reservation.quoteSnapshot,
      contracts: reservation.contracts.map((contract: any) => ({
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        storageUnit: { id: contract.reservationUnit.storageUnit.id, unitCode: contract.reservationUnit.storageUnit.unitNumber, physicalStatus: contract.reservationUnit.storageUnit.status },
      })),
      payments: record.payments.map((payment: any) => this.paymentSummary(payment)),
      services: reservation.services?.map((service: any) => ({ code: service.serviceCodeSnapshot, name: service.serviceNameSnapshot, kind: service.serviceKindSnapshot, billingUnit: service.billingUnitSnapshot, unitPrice: this.money(service.unitPriceSnapshot), quantity: service.quantity, serviceStartDate: this.isoDate(service.serviceStartDate), serviceEndDate: this.isoDate(service.serviceEndDate), amount: this.money(service.amountSnapshot) })) ?? [],
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
