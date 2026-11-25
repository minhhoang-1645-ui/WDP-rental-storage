import { ConflictException } from '@nestjs/common';
import { businessToday } from '../../business-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { invoiceBreakdown, invoiceMoney, savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';
import { prepaidTerms, pricingPolicyValidators, type PricingPolicySnapshot } from '../policies/pricing-policy.js';
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
export type ReturnServicePeriod = { id: string; serviceStartDate: Date | null; serviceEndDate: Date | null; fulfillmentStatus?: string | null };
const min = (a: bigint, b: bigint) => a < b ? a : b;
const positive = (amount: bigint) => amount > 0n ? amount : 0n;
const day = (value: Date) => value.toISOString().slice(0, 10);
export const protectedFacilityReturn = (facility?: { operationalStatus: string; closureMode: string | null } | null) =>
  facility?.operationalStatus === 'CLOSING' && facility.closureMode === 'REQUIRED_RELOCATION';

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

export function planEarlyReturn(invoices: Invoice[], targetId: string, contractIds: string[], cutoff: Date, prorateFacilityFault = false, services: ReturnServicePeriod[] = [], protectedReturn = false) {
  const single = contractIds.length === 1;
  const entries = invoices.flatMap(invoice => {
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
    const quote = invoice.pricingSnapshot as { paymentPlan?: string; billingMode?: string; termMonths?: number; monthlyUnitPrice?: number; pricingPolicy?: PricingPolicySnapshot } | null;
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
    const unusedRent = targetRent - monthlyShare(targetRent, cycles, kept);
    const signed = !protectedReturn && !prorateFacilityFault && cutoff < end ? quote?.pricingPolicy?.earlyReturn : undefined;
    const terms = signed ? pricingPolicyValidators.earlyReturn(signed.value) : undefined;
    let rentAdjustment = unusedRent;
    if (unusedRent > 0n && terms?.refundMode === 'NONE' && invoice.amountPaid > 0n) {
      if (invoice.amountPaid !== invoice.totalAmount) throw new ConflictException(`Cần đối soát khoản đã trả một phần trên hóa đơn ${invoice.invoiceCode}.`);
      rentAdjustment = 0n;
    }
    if (cycles > 1 && kept > 0 && kept < cycles && terms?.refundMode === 'RECALCULATE_DISCOUNT') {
      const rate = targetUnit?.monthlyRate ?? (solo ? quote?.monthlyUnitPrice : undefined);
      if (!Number.isSafeInteger(rate) || rate! <= 0 || !quote?.pricingPolicy?.prepaid) {
        throw new ConflictException(`Hóa đơn ${invoice.invoiceCode} thiếu đơn giá hoặc bảng ưu đãi đã cam kết. Cần đối soát.`);
      }
      const table = pricingPolicyValidators.prepaid(quote.pricingPolicy.prepaid.value);
      const eligible = [...prepaidTerms].reverse().find(term => term <= kept && table[term].enabled);
      const gross = BigInt(rate!) * BigInt(kept);
      const discount = (gross * BigInt(eligible ? table[eligible].percent : 0) + 50n) / 100n;
      rentAdjustment = targetRent - (gross - discount);
    }
    let serviceCredit = 0n;
    if (solo && kept === 0) serviceCredit = invoice.serviceAmount;
    if (solo && kept > 0 && cutoff < end && invoice.serviceAmount > 0n) {
      if (!breakdown && kept < cycles) throw new ConflictException(`Cần đối soát các dịch vụ trả trước trên hóa đơn ${invoice.invoiceCode}.`);
      for (const service of breakdown?.sharedServices ?? []) {
        const period = services.find(row => row.id === service.id);
        if (service.billingUnit === 'ONE_TIME') {
          if (period?.fulfillmentStatus === 'RESERVED') serviceCredit += BigInt(service.amount);
          continue;
        }
        if (service.amount === 0) continue;
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
    if (solo && kept > 0 && cutoff >= end) {
      for (const service of breakdown?.sharedServices ?? [])
        if (service.billingUnit === 'ONE_TIME' && services.find(row => row.id === service.id)?.fulfillmentStatus === 'RESERVED')
          serviceCredit += BigInt(service.amount);
    }
    const rentalCredit = positive(rentAdjustment) + faultCredit;
    const credit = rentalCredit + serviceCredit;
    if (credit && !solo && invoice.amountPaid > 0n && invoice.status !== 'PAID') throw new ConflictException(`Hóa đơn chung ${invoice.invoiceCode} đã trả một phần. Cần phân bổ khoản thu trước khi chấm dứt.`);
    const obligation = invoice.totalAmount - credit;
    if (invoice.amountPaid > invoice.totalAmount || invoice.balanceDue !== invoice.totalAmount - invoice.amountPaid) {
      throw new ConflictException(`Số đã thu trên hóa đơn ${invoice.invoiceCode} chưa khớp. Cần đối soát.`);
    }
    return [{ invoice, breakdown, rentalCredit, serviceCredit, credit, obligation, faultCredit, unusedRent,
      additionalCharge: positive(-rentAdjustment), penaltyAmount: 0n, signed, terms,
      refund: positive(invoice.amountPaid - obligation), outstanding: positive(obligation - invoice.amountPaid), solo,
      retainedRent: targetRent - rentalCredit, retainedServices: solo ? invoice.serviceAmount - serviceCredit : 0n,
      lastCycleStart: kept ? day(cycleStart) : null, lastCycleEnd: kept ? day(nextBoundary) : null }];
  });
  const feeEntry = entries.filter(entry => entry.terms).sort((a, b) => +a.invoice.billingPeriodStart! - +b.invoice.billingPeriodStart! || a.invoice.id.localeCompare(b.invoice.id))[0];
  if (feeEntry?.terms) {
    const { feeMethod, feeAmount } = feeEntry.terms;
    const unusedRent = entries.filter(entry => entry.signed?.version === feeEntry.signed?.version).reduce((sum, entry) => sum + entry.unusedRent, 0n);
    feeEntry.penaltyAmount = feeMethod === 'FIXED_AMOUNT' ? BigInt(feeAmount)
      : feeMethod === 'UNUSED_RENT_PERCENTAGE' ? (unusedRent * BigInt(feeAmount) + 50n) / 100n : 0n;
    feeEntry.additionalCharge += feeEntry.penaltyAmount;
  }
  return entries;
}

export type ReturnPeriodPlan = ReturnType<typeof planEarlyReturn>;

function netReturnAmounts(plan: ReturnPeriodPlan) {
  const refund = plan.reduce((sum, entry) => sum + entry.refund, 0n);
  const charges = plan.reduce((sum, entry) => sum + entry.additionalCharge, 0n);
  return { refundOffset: min(refund, charges), refund: positive(refund - charges), due: positive(charges - refund) };
}

export function summarizeEarlyReturn(plan: ReturnPeriodPlan, effectiveDate: string) {
  const sum = (map: (entry: ReturnPeriodPlan[number]) => bigint) => invoiceMoney(plan.reduce((amount, entry) => amount + map(entry), 0n));
  const lastCycle = plan.filter(entry => entry.lastCycleStart).sort((a, b) => a.lastCycleStart!.localeCompare(b.lastCycleStart!)).at(-1);
  const net = netReturnAmounts(plan);
  return { policy: PERIOD_CLOSEOUT, effectiveDate,
    lastCycleStart: lastCycle?.lastCycleStart ?? null, lastCycleEnd: lastCycle?.lastCycleEnd ?? null,
    rentalAmount: sum(entry => entry.retainedRent), serviceAmount: sum(entry => entry.retainedServices),
    outstandingAmount: plan.some(entry => !entry.solo && entry.invoice.amountPaid > 0n && entry.outstanding > 0n && entry.retainedRent > 0n)
      ? null : invoiceMoney(net.due + plan.reduce((total, entry) => total + (entry.solo ? entry.outstanding : min(entry.outstanding, entry.retainedRent)), 0n)),
    waivedAmount: sum(entry => min(entry.credit, entry.invoice.balanceDue)),
    refundAmount: invoiceMoney(net.refund), refundOffset: invoiceMoney(net.refundOffset), additionalCharge: invoiceMoney(net.due),
    facilityFaultCredit: sum(entry => entry.faultCredit), penaltyAmount: sum(entry => entry.penaltyAmount),
    adjustedInvoices: plan.filter(entry => entry.credit > 0n).map(entry => ({
      id: entry.invoice.id, code: entry.invoice.invoiceCode, type: entry.invoice.type,
      periodStart: day(entry.invoice.billingPeriodStart!), periodEnd: day(entry.invoice.billingPeriodEnd!),
      paidAmount: invoiceMoney(entry.invoice.amountPaid),
      unusedRent: invoiceMoney(entry.unusedRent),
      unusedServices: invoiceMoney(entry.serviceCredit), facilityFaultCredit: invoiceMoney(entry.faultCredit),
      waived: invoiceMoney(min(entry.credit, entry.invoice.balanceDue)), refund: invoiceMoney(entry.refund),
    })),
  };
}

export async function applyEarlyReturn(tx: Prisma.TransactionClient, plan: ReturnPeriodPlan, targetId: string, returnCode: string, now: Date, returnRequestId?: string) {
  const net = netReturnAmounts(plan);
  let remainingOffset = net.refundOffset;
  const refundSources: { invoiceId: string; paymentIds: string[]; amount: number; offsetAmount?: number }[] = [];
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
          storageTypeIdSnapshot: invoice.storageTypeIdSnapshot, facilityIdSnapshot: invoice.facilityIdSnapshot, currency: invoice.currency, status: 'OPEN', amountPaid: 0n, balanceDue: outstanding,
          pricingSnapshot: { ...(invoice.pricingSnapshot as Prisma.InputJsonObject | null), adjustment: PERIOD_CLOSEOUT, returnCode, originalInvoiceCode: invoice.invoiceCode, breakdown: null,
            credit: invoiceMoney(entry.credit), priorPayment: invoiceMoney(invoice.amountPaid), ...(breakdown ? { breakdown } : {}) },
        } });
      }
    }
    if (refund > 0n) {
      const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { id: true, amount: true }, orderBy: { id: 'asc' } });
      if (payments.reduce((sum, payment) => sum + payment.amount, 0n) !== invoice.amountPaid) throw new ConflictException(`Cần đối chiếu các khoản thu của hóa đơn ${invoice.invoiceCode} trước khi lập khoản hoàn.`);
      const offset = min(remainingOffset, refund);
      remainingOffset -= offset;
      refundSources.push({ invoiceId: invoice.id, paymentIds: payments.map(payment => payment.id), amount: invoiceMoney(refund - offset),
        ...(offset ? { offsetAmount: invoiceMoney(offset) } : {}) });
    }
  }
  if (net.due > 0n) {
    if (!returnRequestId) throw new ConflictException('Khoản phải thu cần gắn với hồ sơ trả kho.');
    const { invoice } = plan.find(entry => entry.additionalCharge > 0n)!;
    await tx.invoice.create({ data: { invoiceCode: `${returnCode}-EARLY`, reservationId: invoice.reservationId,
      type: 'SETTLEMENT', rentalAmount: 0n, depositAmount: 0n, serviceAmount: 0n, chargeAmount: net.due,
      totalAmount: net.due, balanceDue: net.due, billingCycle: null, dueAt: businessToday(now), currency: invoice.currency,
      storageTypeIdSnapshot: invoice.storageTypeIdSnapshot, facilityIdSnapshot: invoice.facilityIdSnapshot,
      pricingSnapshot: { adjustment: PERIOD_CLOSEOUT, returnCode, returnRequestId, rentalContractId: targetId,
        items: plan.filter(entry => entry.additionalCharge > 0n).map(entry => ({ invoiceId: entry.invoice.id,
          policyVersion: entry.signed?.version ?? null, charge: invoiceMoney(entry.additionalCharge), fee: invoiceMoney(entry.penaltyAmount) })),
        refundOffset: invoiceMoney(net.refundOffset) },
    } });
  }
  return refundSources;
}
