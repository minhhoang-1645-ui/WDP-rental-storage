import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from './billing.service.js';
import { VnpayService } from './vnpay.service.js';

const ONLINE_PAYMENT_TTL_MS = 15 * 60_000;

@Injectable()
export class OnlinePaymentService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService, private readonly vnpay: VnpayService) {}

  async create(invoiceIdentity: string, input: Record<string, unknown>, idempotencyInput: string | undefined, customer: PublicUser, ipAddress: string) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ CUSTOMER được thanh toán hóa đơn của mình.');
    this.vnpay.assertConfigured();
    const idempotencyKey = this.key(idempotencyInput);
    const bankCode = this.optionalCode(input.bankCode, 'bankCode');
    const locale = input.locale === 'en' ? 'en' : 'vn';
    const identity = await this.prisma.invoice.findFirst({ where: { OR: [{ id: invoiceIdentity }, { invoiceCode: invoiceIdentity }], reservation: { customerId: customer.id } }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy hóa đơn thuộc tài khoản này.');
    const existing = await this.prisma.onlinePaymentTransaction.findUnique({ where: { idempotencyKey }, include: { invoice: true } });
    if (existing) {
      if (existing.invoiceId !== identity.id || existing.customerUserId !== customer.id) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key đã dùng cho giao dịch khác.' });
      if (this.isExpired(existing)) {
        await this.prisma.onlinePaymentTransaction.updateMany({ where: { id: existing.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        throw new ConflictException({ code: 'ONLINE_PAYMENT_EXPIRED', message: 'Phiên thanh toán đã hết hạn. Vui lòng tạo phiên thanh toán mới.' });
      }
      return this.created(existing, bankCode, locale, ipAddress);
    }
    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${identity.id} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id: identity.id }, include: { reservation: true } });
      if (!invoice || invoice.reservation.customerId !== customer.id) throw new NotFoundException('Không tìm thấy hóa đơn thuộc tài khoản này.');
      if (invoice.reservation.status === 'EXPIRED' || (invoice.type === 'INITIAL' && invoice.reservation.expiresAt && invoice.reservation.expiresAt <= new Date())) throw new ConflictException({ code: 'RESERVATION_PAYMENT_WINDOW_EXPIRED', message: 'Thời hạn giữ kho đã hết. Vui lòng tạo yêu cầu đặt kho mới.' });
      if (!['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) throw new ConflictException({ code: 'INVOICE_NOT_ELIGIBLE_FOR_ONLINE_PAYMENT', message: 'Loại hóa đơn này chưa hỗ trợ thanh toán online.' });
      if (invoice.status === 'PAID' || invoice.balanceDue <= 0n) throw new ConflictException({ code: 'INVOICE_ALREADY_PAID', message: 'Hóa đơn đã được thanh toán đủ.' });
      const paymentCutoff = new Date(Date.now() - ONLINE_PAYMENT_TTL_MS);
      await tx.onlinePaymentTransaction.updateMany({
        where: { invoiceId: invoice.id, status: 'PENDING', createdAt: { lte: paymentCutoff } },
        data: { status: 'EXPIRED' },
      });
      const active = await tx.onlinePaymentTransaction.findFirst({
        where: { invoiceId: invoice.id, status: 'PENDING', createdAt: { gt: paymentCutoff } },
        orderBy: { createdAt: 'desc' },
      });
      if (active) return active;
      return tx.onlinePaymentTransaction.create({ data: { invoiceId: invoice.id, customerUserId: customer.id, amount: invoice.balanceDue, merchantOrderRef: this.orderRef(), idempotencyKey } });
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    return this.created(transaction, bankCode, locale, ipAddress);
  }

  async processIpn(query: Record<string, unknown>) {
    let payload;
    try { payload = this.vnpay.verify(query); } catch { return { RspCode: '97', Message: 'Invalid Checksum' }; }
    const identity = await this.prisma.onlinePaymentTransaction.findUnique({ where: { merchantOrderRef: payload.orderRef }, select: { id: true } });
    if (!identity) return { RspCode: '01', Message: 'Order not found' };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OnlinePaymentTransaction" WHERE "id" = ${identity.id} FOR UPDATE`);
        const transaction = await tx.onlinePaymentTransaction.findUnique({ where: { id: identity.id } });
        if (!transaction) return { RspCode: '01', Message: 'Order not found' };
        if (payload.amountMinor !== transaction.amount * 100n) return { RspCode: '04', Message: 'Invalid amount' };
        if (transaction.status === 'SUCCESS') return { RspCode: '00', Message: 'Confirm Success' };
        // A signed success IPN can arrive after a browser poll marked the local session expired.
        // Money confirmed by VNPay remains the source of truth.
        if (!['PENDING', 'EXPIRED'].includes(transaction.status)) return { RspCode: '02', Message: 'Order already confirmed' };
        if (payload.responseCode !== '00' || payload.transactionStatus !== '00') {
          if (transaction.status === 'PENDING') await tx.onlinePaymentTransaction.update({ where: { id: transaction.id }, data: { status: payload.responseCode === '24' ? 'CANCELLED' : 'FAILED', responseCode: payload.responseCode, providerTransactionId: payload.providerTransactionId, bankCode: payload.bankCode } });
          return { RspCode: '00', Message: 'Confirm Success' };
        }
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${transaction.invoiceId} FOR UPDATE`);
        const invoice = await tx.invoice.findUnique({
          where: { id: transaction.invoiceId },
          include: { reservation: { select: { id: true, status: true, expiresAt: true } } },
        });
        if (!invoice) return { RspCode: '01', Message: 'Order not found' };
        if (invoice.status === 'VOID' || (invoice.type === 'INITIAL' && (invoice.reservation.status === 'EXPIRED' || (invoice.reservation.expiresAt && invoice.reservation.expiresAt <= new Date())))) {
          await tx.onlinePaymentTransaction.updateMany({
            where: { id: transaction.id, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { status: 'FAILED', responseCode: payload.responseCode, providerTransactionId: payload.providerTransactionId, bankCode: payload.bankCode },
          });
          await tx.onlinePaymentReconciliation.upsert({
            where: { onlinePaymentTransactionId: transaction.id },
            update: { providerTransactionId: payload.providerTransactionId, amount: transaction.amount },
            create: {
              reconciliationCode: this.reconciliationCode(), onlinePaymentTransactionId: transaction.id,
              reason: invoice.status === 'VOID' ? 'VNPay xác nhận thành công sau khi hóa đơn đã VOID.' : 'VNPay xác nhận thành công sau khi reservation hết hạn; hệ thống không tự kích hoạt lại kho.',
              providerTransactionId: payload.providerTransactionId, amount: transaction.amount,
            },
          });
          return { RspCode: '00', Message: 'Confirm Success - reconciliation required' };
        }
        if (invoice.balanceDue !== transaction.amount) return { RspCode: '04', Message: 'Invalid amount' };
        await this.billing.recordVerifiedOnlinePayment(tx, invoice, transaction, payload.providerTransactionId);
        await tx.onlinePaymentTransaction.update({ where: { id: transaction.id }, data: { status: 'SUCCESS', providerTransactionId: payload.providerTransactionId, responseCode: payload.responseCode, bankCode: payload.bankCode, paidAt: new Date() } });
        return { RspCode: '00', Message: 'Confirm Success' };
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return { RspCode: '02', Message: 'Order already confirmed' };
      throw error;
    }
  }

  async getCustomerStatus(transactionIdentity: string, customer: PublicUser) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ CUSTOMER được xem giao dịch thanh toán của mình.');
    const transaction = await this.prisma.onlinePaymentTransaction.findFirst({
      where: {
        customerUserId: customer.id,
        OR: [{ id: transactionIdentity }, { merchantOrderRef: transactionIdentity }],
      },
      select: {
        id: true,
        merchantOrderRef: true,
        status: true,
        amount: true,
        createdAt: true,
        paidAt: true,
        updatedAt: true,
        invoice: {
          select: {
            id: true,
            invoiceCode: true,
            type: true,
            status: true,
            amountPaid: true,
            balanceDue: true,
            paidAt: true,
          },
        },
        payment: {
          select: {
            id: true,
            paymentCode: true,
            amount: true,
            receivedAt: true,
          },
        },
        reconciliation: { select: { reconciliationCode: true, status: true, reason: true, resolutionNote: true, reviewedAt: true } },
      },
    });
    if (!transaction) throw new NotFoundException('Không tìm thấy giao dịch thanh toán thuộc tài khoản này.');
    let providerStatus = transaction.status;
    if (providerStatus === 'PENDING' && this.isExpired(transaction)) {
      const expired = await this.prisma.onlinePaymentTransaction.updateMany({ where: { id: transaction.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (expired.count === 1) providerStatus = 'EXPIRED';
    }
    return {
      transactionId: transaction.id,
      merchantOrderRef: transaction.merchantOrderRef,
      status: providerStatus === 'PENDING' ? 'PENDING' : providerStatus === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      providerStatus,
      amount: this.money(transaction.amount),
      expiresAt: this.expiresAt(transaction.createdAt).toISOString(),
      paidAt: transaction.paidAt,
      updatedAt: transaction.updatedAt,
      invoice: {
        ...transaction.invoice,
        amountPaid: this.money(transaction.invoice.amountPaid),
        balanceDue: this.money(transaction.invoice.balanceDue),
      },
      payment: transaction.payment ? { ...transaction.payment, amount: this.money(transaction.payment.amount) } : null,
      reconciliation: transaction.reconciliation,
    };
  }

  async returnStatus(query: Record<string, unknown>) {
    try {
      const payload = this.vnpay.verify(query);
      const transaction = await this.prisma.onlinePaymentTransaction.findUnique({ where: { merchantOrderRef: payload.orderRef }, select: { merchantOrderRef: true, status: true, amount: true, invoice: { select: { invoiceCode: true, status: true } } } });
      if (!transaction) return { valid: false, status: 'NOT_FOUND' };
      return { valid: true, transaction: { merchantOrderRef: transaction.merchantOrderRef, status: transaction.status, amount: this.money(transaction.amount) }, invoice: transaction.invoice, providerResponseCode: payload.responseCode };
    } catch { return { valid: false, status: 'INVALID_SIGNATURE' }; }
  }

  async listManagerReconciliations(page: number, limit: number, status?: 'PENDING_REVIEW' | 'REFUND_REQUIRED' | 'RECONCILED') {
    const where = status ? { status } : {};
    const [total, items] = await Promise.all([
      this.prisma.onlinePaymentReconciliation.count({ where }),
      this.prisma.onlinePaymentReconciliation.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.reconciliationInclude() }),
    ]);
    return { page, limit, total, items: items.map((item) => this.toReconciliation(item)) };
  }

  async resolveReconciliation(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được xử lý đối soát VNPay.');
    const resolution = typeof input.resolution === 'string' ? input.resolution : '';
    const resolutionNote = typeof input.resolutionNote === 'string' ? input.resolutionNote.trim() : '';
    if (!['REFUND_REQUIRED', 'RECONCILED'].includes(resolution)) throw new BadRequestException('resolution phải là REFUND_REQUIRED hoặc RECONCILED.');
    if (resolutionNote.length < 3 || resolutionNote.length > 2000) throw new BadRequestException('resolutionNote phải dài 3–2000 ký tự.');
    const record = await this.prisma.onlinePaymentReconciliation.findFirst({ where: { OR: [{ id }, { reconciliationCode: id }] }, include: this.reconciliationInclude() });
    if (!record) throw new NotFoundException('Không tìm thấy hồ sơ đối soát VNPay.');
    if (record.status !== 'PENDING_REVIEW') return this.toReconciliation(record);
    const updated = await this.prisma.onlinePaymentReconciliation.update({ where: { id: record.id }, data: { status: resolution as 'REFUND_REQUIRED' | 'RECONCILED', reviewedByUserId: actor.id, reviewedAt: new Date(), resolutionNote }, include: this.reconciliationInclude() });
    return this.toReconciliation(updated);
  }

  private created(transaction: any, bankCode: string | undefined, locale: string, ipAddress: string) { return { transactionId: transaction.id, merchantOrderRef: transaction.merchantOrderRef, status: transaction.status, amount: this.money(transaction.amount), expiresAt: this.expiresAt(transaction.createdAt).toISOString(), paymentUrl: this.vnpay.paymentUrl({ orderRef: transaction.merchantOrderRef, amount: transaction.amount, ipAddress, bankCode, locale, createdAt: transaction.createdAt }) }; }
  private expiresAt(createdAt: Date) { return new Date(createdAt.getTime() + ONLINE_PAYMENT_TTL_MS); }
  private isExpired(transaction: { status: string; createdAt: Date }) { return transaction.status === 'PENDING' && this.expiresAt(transaction.createdAt).getTime() <= Date.now(); }
  private key(value?: string) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự.'); return key; }
  private optionalCode(value: unknown, label: string) { if (value === undefined || value === null || value === '') return undefined; if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{2,20}$/.test(value)) throw new BadRequestException(`${label} không hợp lệ.`); return value; }
  private orderRef() { return `WDP${Date.now()}${randomBytes(4).toString('hex').toUpperCase()}`; }
  private reconciliationCode() { return `WDPRC-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private reconciliationInclude() { return { onlinePaymentTransaction: { include: { invoice: { include: { reservation: { include: { customer: { select: { id: true, fullName: true, email: true } } } } } } } }, reviewedBy: { select: { id: true, fullName: true, role: true } } }; }
  private toReconciliation(record: any) { return { id: record.id, reconciliationCode: record.reconciliationCode, status: record.status, reason: record.reason, providerTransactionId: record.providerTransactionId, amount: this.money(record.amount), createdAt: record.createdAt.toISOString(), reviewedAt: record.reviewedAt?.toISOString() ?? null, resolutionNote: record.resolutionNote ?? null, reviewedBy: record.reviewedBy, transaction: { id: record.onlinePaymentTransaction.id, merchantOrderRef: record.onlinePaymentTransaction.merchantOrderRef, invoice: { id: record.onlinePaymentTransaction.invoice.id, invoiceCode: record.onlinePaymentTransaction.invoice.invoiceCode, status: record.onlinePaymentTransaction.invoice.status, reservation: { reference: record.onlinePaymentTransaction.invoice.reservation.reservationCode, customer: record.onlinePaymentTransaction.invoice.reservation.customer } } } }; }
  private money(value: bigint) { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException('Số tiền vượt giới hạn hỗ trợ.'); return Number(value); }
}
