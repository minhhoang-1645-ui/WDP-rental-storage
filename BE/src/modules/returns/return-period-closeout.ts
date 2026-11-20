import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { invoiceBreakdown, invoiceMoney, savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';
import type { returnInvoiceFields } from './contract-return-finance.js';

import { PERIOD_CLOSEOUT } from './early-return-classification.js';

export { PERIOD_CLOSEOUT };
export function rentRefundView(record: { rentRefundApprovedAt?: Date | null; rentRefundedAt?: Date | null; rentRefundReference?: string | null }) {
  return { approvedAt: record.rentRefundApprovedAt?.toISOString() ?? null, refundedAt: record.rentRefundedAt?.toISOString() ?? null, reference: record.rentRefundReference ?? null };
}

export function earlyReturnSettlementPending(record: { earlyReturnCloseout?: unknown; rentRefundApprovedAt?: Date | null; rentRefundedAt?: Date | null }) {
  const closeout = record.earlyReturnCloseout as { appliedAt?: string; refundAmount?: number } | null;
  return Boolean(closeout?.appliedAt && (!record.rentRefundApprovedAt || (Number(closeout.refundAmount) > 0 && !record.rentRefundedAt)));
}
type Invoice = Prisma.InvoiceGetPayload<{ select: typeof returnInvoiceFields }>;
export type ReturnServicePeriod = { id: string; serviceStartDate: Date | null; serviceEndDate: Date | null };
const min = (a: bigint, b: bigint) => a < b ? a : b;
const positive = (amount: bigint) => amount > 0n ? amount : 0n;
const day = (value: Date) => value.toISOString().slice(0, 10);

export function monthlyBoundary(start: Date, offset: number) {
  const year = start.getUTCFullYear(), month = start.getUTCMonth() + offset;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), last)));
}

type RenewalSchedule = {
  status: string; paymentPlan: string; rentalContractId?: string | null; termMonths: number;
  previousEndDate?: Date; invoices?: { renewalCycle: number | null; status: string }[];
};

export function hasStartedUnissuedRenewal(renewals: RenewalSchedule[], targetId: string, cutoff: Date) {
  return renewals.some(renewal => {
    if (renewal.status !== 'COMPLETED' || renewal.paymentPlan !== 'PAY_MONTHLY' || !renewal.previousEndDate
        || renewal.rentalContractId && renewal.rentalContractId !== targetId) return false;
    const cycles = new Set(renewal.invoices?.filter(invoice => invoice.status !== 'VOID').map(invoice => invoice.renewalCycle));
    return Array.from({ length: renewal.termMonths }, (_, index) => index)
      .some(index => !cycles.has(index + 1) && monthlyBoundary(renewal.previousEndDate!, index) < cutoff);
  });
}

/** Allocate whole billed cycles using the original net price. Fractional đồng stay in later cycles. */
function monthlyShare(amount: bigint, cycles: number, kept: number) {
  return amount * BigInt(kept) / BigInt(cycles);
}

export function planEarlyReturn(invoices: Invoice[], targetId: string, contractIds: string[], cutoff: Date, prorateFacilityFault = false, services: ReturnServicePeriod[] = []) {
  const single = contractIds.length === 1;
  return invoices.flatMap(invoice => {
    if (invoice.status === 'VOID' || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return [];
    const renewalContract = invoice.renewalRequest?.rentalContractId;
    if (renewalContract && renewalContract !== targetId) return [];
    const solo = single || renewalContract === targetId;
    const start = invoice.billingPeriodStart, end = invoice.billingPeriodEnd;
    if (!start || !end || start >= end) throw new ConflictException(`Hóa đơn ${invoice.invoiceCode} thiếu kỳ thanh toán hợp lệ. Cần đối soát.`);
    const breakdown = savedInvoiceBreakdown(invoice.pricingSnapshot, invoice);
    const targetUnit = breakdown?.units.find(unit => unit.contractId === targetId);
    if (!solo && !breakdown) throw new ConflictException(`Hóa đơn chung ${invoice.invoiceCode} thiếu phân bổ theo hợp đồng. Cần đối soát.`);
    if (!solo && !targetUnit) return [];
    const targetRent = solo ? invoice.rentalAmount : BigInt(targetUnit!.rentalAmount);
    const quote = invoice.pricingSnapshot as { paymentPlan?: string; billingMode?: string; termMonths?: number } | null;
    let cycles = 1;
    if (quote?.paymentPlan === 'PREPAID' && quote.billingMode !== 'DAILY') {
      const term = quote.termMonths ?? 1;
      if (!Number.isSafeInteger(term) || term < 1 || term > 120 || monthlyBoundary(start, term) < end || monthlyBoundary(start, term - 1) >= end) {
        throw new ConflictException(`Chưa xác định được các kỳ trả trước trên hóa đơn ${invoice.invoiceCode}.`);
      }
      cycles = term;
    }
    const kept = Array.from({ length: cycles }, (_, i) => monthlyBoundary(start, i)).filter(period => period < cutoff).length;
    const cycleStart = monthlyBoundary(start, Math.max(0, kept - 1));
    const nextBoundary = kept < cycles ? monthlyBoundary(start, kept) : end;
    const fullCycleRent = monthlyShare(targetRent, cycles, kept) - monthlyShare(targetRent, cycles, Math.max(0, kept - 1));
    const faultCredit = prorateFacilityFault && kept > 0 && cutoff < nextBoundary
      ? fullCycleRent * BigInt(+nextBoundary - +cutoff) / BigInt(+nextBoundary - +cycleStart) : 0n;
    const rentalCredit = targetRent - monthlyShare(targetRent, cycles, kept) + faultCredit;
    let serviceCredit = 0n;
    if (solo && kept === 0) serviceCredit = invoice.serviceAmount;
    if (solo && kept > 0 && cutoff < end && invoice.serviceAmount > 0n) {
      if (!breakdown && kept < cycles) throw new ConflictException(`Cần đối soát các dịch vụ trả trước trên hóa đơn ${invoice.invoiceCode}.`);
      for (const service of breakdown?.sharedServices ?? []) {
        if (service.billingUnit === 'ONE_TIME' || service.amount === 0) continue;
        const period = services.find(row => row.id === service.id);
        if (period?.serviceStartDate && period.serviceEndDate) {
          const rate = BigInt(service.unitPrice) * BigInt(service.quantity);
          const serviceStart = period.serviceStartDate > start ? period.serviceStartDate : start;
          const serviceEnd = period.serviceEndDate < end ? period.serviceEndDate : end;
          if (service.billingUnit === 'DAY') {
            const elapsedDays = Math.max(0, Math.round((+cutoff - +serviceStart) / 86400000));
            const billedDays = Math.max(0, Math.round((+serviceEnd - +serviceStart) / 86400000));
            if (rate * BigInt(billedDays) === BigInt(service.amount)) {
              serviceCredit += rate * BigInt(Math.max(0, billedDays - elapsedDays));
              continue;
            }
          } else if (service.billingUnit === 'MONTH') {
            const anchor = period.serviceStartDate;
            const dates = Array.from({ length: 120 }, (_, index) => monthlyBoundary(anchor, index)).filter(date => date >= start && date < serviceEnd);
            if (rate * BigInt(dates.length) === BigInt(service.amount)) {
              serviceCredit += rate * BigInt(dates.filter(date => date >= cutoff).length);
              continue;
            }
          }
        }
        if (service.billingUnit === 'MONTH' && service.billablePeriods === cycles) {
          serviceCredit += BigInt(service.amount) - monthlyShare(BigInt(service.amount), cycles, kept);
        } else {
          throw new ConflictException(`Dịch vụ ${service.name} thiếu phân bổ theo kỳ. Cần đối soát hóa đơn ${invoice.invoiceCode}.`);
        }
      }
    }
    const credit = rentalCredit + serviceCredit;
    if (credit && !solo && invoice.amountPaid > 0n && invoice.status !== 'PAID') throw new ConflictException(`Hóa đơn chung ${invoice.invoiceCode} đã trả một phần. Cần phân bổ khoản thu trước khi chấm dứt.`);
    const obligation = invoice.totalAmount - credit;
    if (invoice.amountPaid > invoice.totalAmount || invoice.balanceDue !== invoice.totalAmount - invoice.amountPaid) {
      throw new ConflictException(`Số đã thu trên hóa đơn ${invoice.invoiceCode} chưa khớp. Cần đối soát.`);
    }
    return [{ invoice, breakdown, rentalCredit, serviceCredit, credit, obligation, faultCredit,
      refund: positive(invoice.amountPaid - obligation), outstanding: positive(obligation - invoice.amountPaid), solo,
      retainedRent: targetRent - rentalCredit, retainedServices: solo ? invoice.serviceAmount - serviceCredit : 0n,
      lastCycleStart: kept ? day(cycleStart) : null, lastCycleEnd: kept ? day(nextBoundary) : null }];
  });
}

export type ReturnPeriodPlan = ReturnType<typeof planEarlyReturn>;

export function summarizeEarlyReturn(plan: ReturnPeriodPlan, effectiveDate: string) {
  const sum = (map: (entry: ReturnPeriodPlan[number]) => bigint) => invoiceMoney(plan.reduce((amount, entry) => amount + map(entry), 0n));
  const lastCycle = plan.filter(entry => entry.lastCycleStart).sort((a, b) => a.lastCycleStart!.localeCompare(b.lastCycleStart!)).at(-1);
  return { policy: PERIOD_CLOSEOUT, effectiveDate,
    lastCycleStart: lastCycle?.lastCycleStart ?? null, lastCycleEnd: lastCycle?.lastCycleEnd ?? null,
    rentalAmount: sum(entry => entry.retainedRent), serviceAmount: sum(entry => entry.retainedServices),
    outstandingAmount: plan.some(entry => !entry.solo && entry.invoice.amountPaid > 0n && entry.outstanding > 0n && entry.retainedRent > 0n)
      ? null : sum(entry => entry.solo ? entry.outstanding : min(entry.outstanding, entry.retainedRent)),
    waivedAmount: sum(entry => min(entry.credit, entry.invoice.balanceDue)),
    refundAmount: sum(entry => entry.refund), facilityFaultCredit: sum(entry => entry.faultCredit), penaltyAmount: 0,
    adjustedInvoices: plan.filter(entry => entry.credit > 0n).map(entry => ({
      id: entry.invoice.id, code: entry.invoice.invoiceCode, type: entry.invoice.type,
      periodStart: day(entry.invoice.billingPeriodStart!), periodEnd: day(entry.invoice.billingPeriodEnd!),
      paidAmount: invoiceMoney(entry.invoice.amountPaid),
      unusedRent: invoiceMoney(entry.rentalCredit - entry.faultCredit),
      unusedServices: invoiceMoney(entry.serviceCredit), facilityFaultCredit: invoiceMoney(entry.faultCredit),
      waived: invoiceMoney(min(entry.credit, entry.invoice.balanceDue)), refund: invoiceMoney(entry.refund),
    })),
  };
}

export async function applyEarlyReturn(tx: Prisma.TransactionClient, plan: ReturnPeriodPlan, targetId: string, returnCode: string, now: Date) {
  const refundSources: { invoiceId: string; paymentIds: string[]; amount: number }[] = [];
  for (const entry of plan) {
    if (!entry.credit) continue;
    const { invoice, refund, outstanding } = entry;
    if (invoice.balanceDue > 0n) {
      const [bank, online] = await Promise.all([
        tx.paymentSubmission.count({ where: { invoiceId: invoice.id, status: 'PENDING_VERIFICATION' } }),
        tx.onlinePaymentTransaction.count({ where: { invoiceId: invoice.id, OR: [
          { status: 'PENDING', createdAt: { gt: new Date(+now - ONLINE_PAYMENT_TTL_MS) } }, { reconciliation: { is: { status: { in: ['PENDING_REVIEW', 'REFUND_REQUIRED'] } } } },
        ] } }),
      ]);
      if (bank || online) throw new ConflictException(`Hóa đơn ${invoice.invoiceCode} có giao dịch đang đối soát.`);
      const changed = await tx.invoice.updateMany({ where: { id: invoice.id, status: invoice.status, amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue },
        data: { status: 'VOID', balanceDue: 0n, voidedAt: now, voidReason: `Điều chỉnh trả kho trước hạn ${returnCode}`,
          ...(outstanding > 0n ? { billingCycle: null, renewalCycle: null } : {}) } });
      if (changed.count !== 1) throw new ConflictException('Hóa đơn vừa thay đổi. Hãy tải lại hồ sơ trả kho.');
      if (outstanding > 0n) {
        const adjustedUnits = entry.breakdown?.units.map(unit => unit.contractId === targetId
          ? { ...unit, rentalAmount: invoiceMoney(BigInt(unit.rentalAmount) - entry.rentalCredit) } : unit);
        const unpaid = invoice.amountPaid === 0n;
        const totals = unpaid ? { rentalAmount: invoice.rentalAmount - entry.rentalCredit,
          serviceAmount: invoice.serviceAmount - entry.serviceCredit, depositAmount: invoice.depositAmount, chargeAmount: invoice.chargeAmount, totalAmount: outstanding }
          : { rentalAmount: 0n, serviceAmount: 0n, depositAmount: 0n, chargeAmount: outstanding, totalAmount: outstanding };
        const breakdown = unpaid && adjustedUnits && entry.serviceCredit === 0n
          ? invoiceBreakdown(invoice.billingPeriodStart!, invoice.billingPeriodEnd!, adjustedUnits, entry.breakdown!.sharedServices, totals) : undefined;
        await tx.invoice.create({ data: { ...totals, invoiceCode: `${invoice.invoiceCode}-${returnCode}`, replacesInvoiceId: invoice.id,
          reservationId: invoice.reservationId,
          type: invoice.type, billingCycle: invoice.billingCycle, renewalRequestId: invoice.renewalRequestId, renewalCycle: invoice.renewalCycle,
          billingPeriodStart: invoice.billingPeriodStart, billingPeriodEnd: invoice.billingPeriodEnd, dueAt: invoice.dueAt,
          storageTypeIdSnapshot: invoice.storageTypeIdSnapshot, currency: invoice.currency, status: 'OPEN', amountPaid: 0n, balanceDue: outstanding,
          pricingSnapshot: { ...(invoice.pricingSnapshot as Prisma.InputJsonObject | null), adjustment: PERIOD_CLOSEOUT, returnCode, originalInvoiceCode: invoice.invoiceCode, breakdown: null,
            credit: invoiceMoney(entry.credit), priorPayment: invoiceMoney(invoice.amountPaid), ...(breakdown ? { breakdown } : {}) },
        } });
      }
    }
    if (refund > 0n) {
      const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { id: true, amount: true }, orderBy: { id: 'asc' } });
      if (payments.reduce((sum, payment) => sum + payment.amount, 0n) !== invoice.amountPaid) throw new ConflictException(`Cần đối chiếu các khoản thu của hóa đơn ${invoice.invoiceCode} trước khi lập khoản hoàn.`);
      refundSources.push({ invoiceId: invoice.id, paymentIds: payments.map(payment => payment.id), amount: invoiceMoney(refund) });
    }
  }
  return refundSources;
}
