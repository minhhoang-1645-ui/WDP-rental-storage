import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { businessToday } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pricingPolicyValidators, type PricingPolicySnapshot } from '../policies/pricing-policy.js';
import { invoiceMoney } from './invoice-breakdown.js';
import { ONLINE_PAYMENT_TTL_MS } from './online-payment-policy.js';
import { PayosPaymentService } from './payos-payment.service.js';

const dayMs = 86_400_000;

export function datedPaymentOverdue(snapshot: unknown, dueAt: Date | null, now: Date) {
  const agreed = (snapshot as { pricingPolicy?: PricingPolicySnapshot } | null)?.pricingPolicy?.paymentOverdue;
  if (!agreed || !dueAt) return null;
  const rule = pricingPolicyValidators.paymentOverdue(agreed.value);
  const overdueDays = Math.max(0, Math.floor((+businessToday(now) - +dueAt) / dayMs));
  return { overdueDays, rule, version: agreed.version, managerReviewOn: new Date(+dueAt + rule.managerDays * dayMs).toISOString().slice(0, 10) };
}

export function verifiedRentDebt(invoice: {
  rentalAmount: bigint; depositAmount: bigint; serviceAmount: bigint; chargeAmount: bigint;
  totalAmount: bigint; amountPaid: bigint; balanceDue: bigint;
}) {
  if (invoice.rentalAmount <= 0n || invoice.balanceDue <= 0n || invoice.amountPaid < 0n ||
    invoice.totalAmount !== invoice.rentalAmount + invoice.depositAmount + invoice.serviceAmount + invoice.chargeAmount ||
    invoice.balanceDue !== invoice.totalAmount - invoice.amountPaid) return null;
  if (invoice.amountPaid === 0n) return invoice.rentalAmount;
  return invoice.totalAmount === invoice.rentalAmount ? invoice.balanceDue : null;
}

@Injectable()
export class OverduePaymentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(OverduePaymentWorker.name);

  constructor(private readonly prisma: PrismaService, @Optional() private readonly payos?: PayosPaymentService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DATABASE_CONNECT_ON_STARTUP === 'false') return;
    this.timer = setInterval(() => void this.assess(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async assess(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.payos?.syncClosedInvoices(now).catch(() => this.logger.warn('Could not synchronize closed payOS sessions'));
      let lastId: string | undefined;
      while (true) {
        const invoices: { id: string }[] = await this.prisma.invoice.findMany({
          where: { id: { gt: lastId }, type: { in: ['RECURRING', 'RENEWAL'] }, status: { in: ['OPEN', 'PARTIALLY_PAID'] },
            dueAt: { lt: businessToday(now) }, replacesInvoiceId: null,
            OR: ['FIXED_AMOUNT', 'RENT_DEBT_PERCENTAGE'].map(method => ({
              pricingSnapshot: { path: ['pricingPolicy', 'paymentOverdue', 'value', 'feeMethod'], equals: method },
            })),
            reservation: { status: 'CONFIRMED' } },
          select: { id: true }, orderBy: { id: 'asc' }, take: 100,
        });
        for (const invoice of invoices) {
          await this.assessInvoice(invoice.id, now).catch(() => this.logger.warn(`Could not assess overdue charge for invoice ${invoice.id}`));
        }
        if (invoices.length < 100) return;
        lastId = invoices.at(-1)?.id;
      }
    } catch {
      this.logger.warn('Could not load invoices for overdue charge assessment');
    } finally {
      this.running = false;
    }
  }

  private assessInvoice(id: string, now: Date) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id }, include: {
        reservation: { select: { status: true } }, renewalRequest: { select: { appendixAcceptedAt: true, status: true } },
      } });
      if (!invoice || !['RECURRING', 'RENEWAL'].includes(invoice.type) || !['OPEN', 'PARTIALLY_PAID'].includes(invoice.status) ||
          invoice.reservation.status !== 'CONFIRMED' || invoice.replacesInvoiceId ||
          (invoice.type === 'RENEWAL' && (!invoice.renewalRequest?.appendixAcceptedAt || invoice.renewalRequest.status !== 'COMPLETED'))) return;
      const overdue = datedPaymentOverdue(invoice.pricingSnapshot, invoice.dueAt, now);
      if (!overdue || overdue.overdueDays <= overdue.rule.graceDays || overdue.rule.feeMethod === 'NONE') return;
      const rentDebt = verifiedRentDebt(invoice);
      if (!rentDebt) return;
      const invoiceCode = `${invoice.invoiceCode}-LATE`;
      if (await tx.invoice.findUnique({ where: { invoiceCode }, select: { id: true } })) return;
      const [bank, online] = await Promise.all([
        tx.paymentSubmission.count({ where: { invoiceId: id, status: 'PENDING_VERIFICATION' } }),
        tx.onlinePaymentTransaction.count({ where: { invoiceId: id, OR: [
          { status: 'PENDING', createdAt: { gt: new Date(+now - ONLINE_PAYMENT_TTL_MS) } },
          { reconciliation: { is: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } } },
          { payosReceipts: { some: { reconciliation: { is: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } } } } },
        ] } }),
      ]);
      if (bank || online) return;
      const paid = await tx.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
      if ((paid._sum.amount ?? 0n) !== invoice.amountPaid) return;
      const rule = overdue.rule;
      const amount = rule.feeMethod === 'FIXED_AMOUNT' ? BigInt(rule.feeAmount) : (rentDebt * BigInt(rule.feeAmount) + 50n) / 100n;
      if (!amount) return;
      await tx.invoice.create({ data: { invoiceCode, reservationId: invoice.reservationId, billingCycle: null,
        type: 'SETTLEMENT', rentalAmount: 0n, serviceAmount: 0n, depositAmount: 0n, chargeAmount: amount,
        balanceDue: amount, totalAmount: amount, currency: invoice.currency, dueAt: businessToday(now),
        facilityIdSnapshot: invoice.facilityIdSnapshot, storageTypeIdSnapshot: invoice.storageTypeIdSnapshot,
        pricingSnapshot: { adjustment: 'PAYMENT_OVERDUE', sourceInvoiceId: id, sourceInvoiceCode: invoice.invoiceCode,
          policyVersion: overdue.version, rule, verifiedRentDebt: invoiceMoney(rentDebt), assessedAt: now.toISOString() },
      } });
    });
  }
}
