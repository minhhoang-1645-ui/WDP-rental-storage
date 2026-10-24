import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from './billing.service.js';
import { VnpayService } from './vnpay.service.js';

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
      return this.created(existing, bankCode, locale, ipAddress);
    }
    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${identity.id} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id: identity.id }, include: { reservation: true } });
      if (!invoice || invoice.reservation.customerId !== customer.id) throw new NotFoundException('Không tìm thấy hóa đơn thuộc tài khoản này.');
      if (!['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) throw new ConflictException({ code: 'INVOICE_NOT_ELIGIBLE_FOR_ONLINE_PAYMENT', message: 'Loại hóa đơn này chưa hỗ trợ thanh toán online.' });
      if (invoice.status === 'PAID' || invoice.balanceDue <= 0n) throw new ConflictException({ code: 'INVOICE_ALREADY_PAID', message: 'Hóa đơn đã được thanh toán đủ.' });
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
        if (transaction.status !== 'PENDING') return { RspCode: '02', Message: 'Order already confirmed' };
        if (payload.responseCode !== '00' || payload.transactionStatus !== '00') {
          await tx.onlinePaymentTransaction.update({ where: { id: transaction.id }, data: { status: payload.responseCode === '24' ? 'CANCELLED' : 'FAILED', responseCode: payload.responseCode, providerTransactionId: payload.providerTransactionId, bankCode: payload.bankCode } });
          return { RspCode: '00', Message: 'Confirm Success' };
        }
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${transaction.invoiceId} FOR UPDATE`);
        const invoice = await tx.invoice.findUnique({ where: { id: transaction.invoiceId }, include: { reservation: { select: { id: true } } } });
        if (!invoice || invoice.balanceDue !== transaction.amount) return { RspCode: '04', Message: 'Invalid amount' };
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
        paidAt: true,
        updatedAt: true,
        invoice: {
          select: {
            id: true,
            invoiceCode: true,
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
      },
    });
    if (!transaction) throw new NotFoundException('Không tìm thấy giao dịch thanh toán thuộc tài khoản này.');
    return {
      transactionId: transaction.id,
      merchantOrderRef: transaction.merchantOrderRef,
      status: transaction.status === 'PENDING' ? 'PENDING' : transaction.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      providerStatus: transaction.status,
      amount: this.money(transaction.amount),
      paidAt: transaction.paidAt,
      updatedAt: transaction.updatedAt,
      invoice: {
        ...transaction.invoice,
        amountPaid: this.money(transaction.invoice.amountPaid),
        balanceDue: this.money(transaction.invoice.balanceDue),
      },
      payment: transaction.payment ? { ...transaction.payment, amount: this.money(transaction.payment.amount) } : null,
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

  private created(transaction: any, bankCode: string | undefined, locale: string, ipAddress: string) { return { transactionId: transaction.id, merchantOrderRef: transaction.merchantOrderRef, status: transaction.status, amount: this.money(transaction.amount), paymentUrl: this.vnpay.paymentUrl({ orderRef: transaction.merchantOrderRef, amount: transaction.amount, ipAddress, bankCode, locale, createdAt: transaction.createdAt }) }; }
  private key(value?: string) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự.'); return key; }
  private optionalCode(value: unknown, label: string) { if (value === undefined || value === null || value === '') return undefined; if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{2,20}$/.test(value)) throw new BadRequestException(`${label} không hợp lệ.`); return value; }
  private orderRef() { return `WDP${Date.now()}${randomBytes(4).toString('hex').toUpperCase()}`; }
  private money(value: bigint) { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException('Số tiền vượt giới hạn hỗ trợ.'); return Number(value); }
}
