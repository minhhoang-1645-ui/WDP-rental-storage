import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from './billing.service.js';
import { assertInvoiceReceivable, initialPaymentWindowClosed } from './invoice-state.js';
import { ONLINE_PAYMENT_TTL_MS } from './online-payment-policy.js';
import { PayosService } from './payos.service.js';
import { closeoutReservationSelect, invoicePaymentBlockedBySchedule, renewalInvoiceScope } from './renewal-invoice-schedule.js';

const invoiceRelations = { reservation: { select: closeoutReservationSelect }, renewalRequest: renewalInvoiceScope } as const;
type Receipt = { orderCode: number; paymentLinkId: string; reference: string; amount: number; transactionDateTime: string };

@Injectable()
export class PayosPaymentService {
  constructor(private readonly db: PrismaService, private readonly provider: PayosService, private readonly billing: BillingService) {}

  async syncClosedInvoices(now: Date) {
    if (!this.provider.cutover) return;
    const sessions = await this.db.onlinePaymentTransaction.findMany({
      where: { provider: 'PAYOS', status: 'PENDING', expiresAt: { gt: now },
        invoice: { OR: [{ status: { in: ['VOID', 'PAID'] } }, { type: 'INITIAL', reservation: { status: { not: 'CONFIRMED' } } }] } },
      select: { id: true }, take: 10, orderBy: { providerCheckedAt: { sort: 'asc', nulls: 'first' } },
    });
    for (const { id } of sessions) {
      try { await this.sync(id); }
      catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
    }
  }

  async create(identity: string, key: string, customer: PublicUser, mobile: boolean) {
    if (customer.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException();
    this.provider.assertConfigured();
    const match = await this.db.invoice.findFirst({ where: { OR: [{ id: identity }, { invoiceCode: identity }],
      reservation: { customerId: customer.id } }, select: { id: true } });
    if (!match) throw new NotFoundException('Không tìm thấy hóa đơn thuộc tài khoản này.');
    const { session, created } = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${match.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: match.id }, include: invoiceRelations });
      assertInvoiceReceivable(invoice);
      if (invoice.status === 'PAID' || invoice.balanceDue < 1n || invoice.balanceDue > BigInt(Number.MAX_SAFE_INTEGER)
        || invoice.currency !== 'VND' || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type) || invoicePaymentBlockedBySchedule(invoice))
        throw new ConflictException('Hóa đơn chưa đủ điều kiện thanh toán payOS.');
      await this.billing.assertSignedBeforePayment(tx, invoice);
      if (await tx.paymentSubmission.findFirst({ where: { invoiceId: invoice.id, status: 'PENDING_VERIFICATION' }, select: { id: true } }))
        throw new ConflictException('Hóa đơn có chuyển khoản đang chờ xác minh.');
      if (await tx.payosReceipt.findFirst({ where: { transaction: { invoiceId: invoice.id },
        reconciliation: { is: { status: { not: 'RECONCILED' } } } }, select: { id: true } }))
        throw new ConflictException('Hóa đơn có khoản tiền đang đối soát. Vui lòng liên hệ NestBox.');
      const prior = await tx.onlinePaymentTransaction.findUnique({ where: { idempotencyKey: key } });
      if (prior && (prior.invoiceId !== invoice.id || prior.customerUserId !== customer.id || prior.provider !== 'PAYOS'))
        throw new ConflictException('Idempotency-Key đã được dùng cho giao dịch khác.');
      const now = new Date();
      const active = prior ?? await tx.onlinePaymentTransaction.findFirst({ where: { invoiceId: invoice.id, status: 'PENDING',
        OR: [{ provider: 'PAYOS', expiresAt: { gt: now } }, { provider: 'VNPAY', createdAt: { gt: new Date(+now - ONLINE_PAYMENT_TTL_MS) } }] } });
      if (active) {
        if (active.provider !== 'PAYOS' || active.status !== 'PENDING' || !active.expiresAt || active.expiresAt <= now || active.amount !== invoice.balanceDue)
          throw new ConflictException('Cần kiểm tra phiên thanh toán hiện tại trước khi tạo phiên mới.');
        return { session: active, created: false };
      }
      const expiresAt = new Date(Math.floor(Math.min(+now + ONLINE_PAYMENT_TTL_MS,
        invoice.type === 'INITIAL' && invoice.reservation.expiresAt ? +invoice.reservation.expiresAt : Infinity) / 1000) * 1000);
      if (+expiresAt <= +now + 1000) throw new ConflictException('Hóa đơn sắp hết thời hạn thanh toán.');
      const payosOrderCode = BigInt(randomInt(1_000_000_000_000, 99_999_999_999_999));
      const session = await tx.onlinePaymentTransaction.create({ data: { invoiceId: invoice.id, customerUserId: customer.id,
        amount: invoice.balanceDue, provider: 'PAYOS', merchantOrderRef: payosOrderCode.toString(), payosOrderCode, expiresAt, idempotencyKey: key } });
      return { session, created: true };
    });
    const orderCode = Number(session.payosOrderCode);
    let checkoutUrl = session.checkoutUrl;
    if (!checkoutUrl) {
      if (!created) {
        // Check the same order code after an ambiguous create response.
        const recovered = await this.provider.get(orderCode);
        if (!recovered) throw new ConflictException('Đang chờ xác định kết quả tạo link payOS. Hãy kiểm tra lại phiên.');
        await this.ingestLink(session, recovered);
        if (recovered.status !== 'PENDING') throw new ConflictException('Phiên payOS đã thay đổi. Hãy kiểm tra lại hóa đơn.');
        checkoutUrl = this.checkoutFor(recovered.id);
      } else {
        const link = await this.provider.create(orderCode, Number(session.amount), session.expiresAt!, session.id, session.invoiceId, mobile);
        if (link.orderCode !== orderCode || link.amount !== Number(session.amount) || link.currency !== 'VND'
          || link.checkoutUrl !== this.checkoutFor(link.paymentLinkId)) throw new ConflictException('Thông tin link payOS không khớp phiên.');
        checkoutUrl = link.checkoutUrl;
        await this.db.onlinePaymentTransaction.updateMany({ where: { id: session.id,
          OR: [{ payosLinkId: null }, { payosLinkId: link.paymentLinkId }] }, data: { payosLinkId: link.paymentLinkId, checkoutUrl } });
      }
    }
    return { transactionId: session.id, merchantOrderRef: session.merchantOrderRef, provider: 'PAYOS',
      status: 'PENDING', amount: Number(session.amount), expiresAt: session.expiresAt, checkoutUrl, paymentUrl: checkoutUrl };
  }

  async webhook(body: Parameters<PayosService['verify']>[0]) {
    const data = await this.provider.verify(body);
    if (body.code !== '00' || !body.success || data.code !== '00' || data.currency !== 'VND')
      throw new BadRequestException('Webhook payOS không xác nhận giao dịch VND thành công.');
    if (data.orderCode === 123 && data.reference === 'TF230204212323'
      && data.paymentLinkId === '124c33293c43417ab7879e14c8d9eb18' && data.amount === 3000) return { success: true };
    if (!Number.isSafeInteger(data.orderCode) || data.orderCode < 1) throw new BadRequestException('Mã đơn payOS không hợp lệ.');
    const pending = await this.db.onlinePaymentTransaction.findUnique({ where: { payosOrderCode: BigInt(data.orderCode) } });
    if (pending && !pending.payosLinkId) {
      const link = await this.provider.get(data.orderCode);
      if (!link) throw new ConflictException('Chưa xác minh được link payOS; cần gửi lại webhook.');
      await this.ingestLink(pending, link);
    }
    await this.record(data);
    return { success: true };
  }

  async sync(id: string) {
    const session = await this.db.onlinePaymentTransaction.findUnique({ where: { id } });
    if (!session?.payosOrderCode) return;
    const now = new Date();
    const reserved = await this.db.onlinePaymentTransaction.updateMany({ where: { id, OR: [
      { providerCheckedAt: null }, { providerCheckedAt: { lt: new Date(+now - 20_000) } },
    ] }, data: { providerCheckedAt: now } });
    if (!reserved.count) return;
    const invoice = await this.db.invoice.findUniqueOrThrow({ where: { id: session.invoiceId }, include: invoiceRelations });
    const orderCode = Number(session.payosOrderCode);
    const link = await this.provider.get(orderCode);
    if (!link) return;
    await this.ingestLink(session, link);
    if ((link.status === 'PENDING' || link.status === 'UNDERPAID') && (invoice.status === 'VOID' || invoice.status === 'PAID'
      || invoice.balanceDue !== session.amount || initialPaymentWindowClosed(invoice))) {
      await this.ingestLink(session, await this.provider.cancel(orderCode));
    }
  }

  private checkoutFor(id: string) {
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new BadRequestException('Mã link payOS không hợp lệ.');
    return 'https://pay.payos.vn/web/' + id;
  }

  private async ingestLink(session: { id: string; payosOrderCode: bigint | null; payosLinkId: string | null; amount: bigint },
    link: NonNullable<Awaited<ReturnType<PayosService['get']>>>) {
    if (link.orderCode !== Number(session.payosOrderCode) || link.amount !== Number(session.amount)
      || session.payosLinkId && link.id !== session.payosLinkId) throw new ConflictException('Thông tin link payOS không khớp phiên.');
    await this.db.onlinePaymentTransaction.updateMany({ where: { id: session.id, OR: [{ payosLinkId: null }, { payosLinkId: link.id }] },
      data: { payosLinkId: link.id, checkoutUrl: this.checkoutFor(link.id) } });
    for (const bank of link.transactions) await this.record({ ...bank, orderCode: link.orderCode, paymentLinkId: link.id });
    if (link.status === 'CANCELLED' || link.status === 'EXPIRED' || link.status === 'FAILED')
      await this.db.onlinePaymentTransaction.updateMany({ where: { id: session.id, status: 'PENDING' }, data: { status: link.status } });
  }

  private async record(receipt: Receipt) {
    this.checkoutFor(receipt.paymentLinkId);
    if (!Number.isSafeInteger(receipt.orderCode) || receipt.orderCode < 1 || !Number.isSafeInteger(receipt.amount) || receipt.amount < 1
      || typeof receipt.reference !== 'string' || !/^[\w.:-]{1,120}$/.test(receipt.reference))
      throw new BadRequestException('Thông tin khoản tiền payOS không hợp lệ.');
    const dateText = receipt.transactionDateTime?.replace(' ', 'T');
    const receivedAt = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(dateText) ? dateText : dateText + '+07:00');
    if (!Number.isFinite(+receivedAt)) throw new BadRequestException('Thời điểm nhận tiền payOS không hợp lệ.');
    const orderCode = BigInt(receipt.orderCode), amount = BigInt(receipt.amount);
    await this.db.$transaction(async tx => {
      const candidate = await tx.onlinePaymentTransaction.findUnique({ where: { payosOrderCode: orderCode } });
      if (candidate) await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${candidate.invoiceId} FOR UPDATE`;
      const session = candidate && await tx.onlinePaymentTransaction.findUnique({ where: { id: candidate.id } });
      const matches = session?.payosLinkId === receipt.paymentLinkId;
      const { count } = await tx.payosReceipt.createMany({ skipDuplicates: true, data: { orderCode, amount,
        paymentLinkId: receipt.paymentLinkId, reference: receipt.reference, receivedAt, transactionId: matches ? session.id : null } });
      if (!count) {
        const existing = await tx.payosReceipt.findUniqueOrThrow({ where: { reference: receipt.reference } });
        if (existing.amount !== amount || existing.orderCode !== orderCode || existing.paymentLinkId !== receipt.paymentLinkId)
          throw new ConflictException('Tham chiếu ngân hàng payOS đã được ghi với thông tin khác.');
        return;
      }
      const record = await tx.payosReceipt.findUniqueOrThrow({ where: { reference: receipt.reference } });
      const invoice = matches && await tx.invoice.findUniqueOrThrow({ where: { id: session.invoiceId }, include: invoiceRelations });
      let reason = 'Chưa xác định được link payOS khớp hồ sơ.';
      if (invoice && session) {
        reason = 'Số tiền không khớp hoặc hóa đơn không còn đủ điều kiện thanh toán.';
        if (invoice.status !== 'VOID' && invoice.status !== 'PAID' && invoice.currency === 'VND' && !initialPaymentWindowClosed(invoice)
          && !invoicePaymentBlockedBySchedule(invoice) && invoice.balanceDue === amount && session.amount === amount
          && (!session.expiresAt || receivedAt <= session.expiresAt)
          && !await tx.payment.findUnique({ where: { onlinePaymentTransactionId: session.id } })) {
          await tx.$executeRaw`SAVEPOINT payos_apply`;
          try {
            await this.billing.recordVerifiedOnlinePayment(tx, invoice, session, receipt.reference, receivedAt);
            await tx.onlinePaymentTransaction.update({ where: { id: session.id },
              data: { status: 'SUCCESS', providerTransactionId: receipt.reference, paidAt: receivedAt } });
            await tx.auditEvent.create({ data: { category: 'ACTIVITY', outcome: 'SUCCESS', action: 'PAYOS_PAYMENT_RECORDED',
              resource: 'invoices', resourceId: invoice.id, route: '/api/payments/payos/webhook', method: 'POST', httpStatus: 200 } });
            await tx.$executeRaw`RELEASE SAVEPOINT payos_apply`;
            return;
          } catch (error) {
            if (!(error instanceof ConflictException)) throw error;
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT payos_apply`;
            reason = 'Đã nhận tiền nhưng chưa đáp ứng điều kiện hạch toán.';
          }
        }
      }
      await tx.onlinePaymentReconciliation.create({ data: { reconciliationCode: 'PAYOS-' + randomUUID(),
        payosReceiptId: record.id, providerTransactionId: receipt.reference, amount, reason } });
    });
  }
}
