import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { savedInvoiceBreakdown } from '../billing/invoice-breakdown.js';
import { returnReadiness } from './early-return-finance.js';
import { PERIOD_CLOSEOUT } from './early-return-classification.js';

export const returnInvoiceFields = {
  id: true, reservationId: true, invoiceCode: true, type: true, status: true, totalAmount: true, amountPaid: true, balanceDue: true,
  rentalAmount: true, depositAmount: true, serviceAmount: true, chargeAmount: true, pricingSnapshot: true,
  billingPeriodStart: true, billingPeriodEnd: true, billingCycle: true, renewalCycle: true, renewalRequestId: true,
  dueAt: true, currency: true, storageTypeIdSnapshot: true, facilityIdSnapshot: true,
  depositSettlement: { select: { returnRequest: { select: { inspections: { select: { rentalContractId: true } } } } } },
  renewalRequest: { select: { rentalContractId: true } },
} satisfies Prisma.InvoiceSelect;

type ReturnInvoice = {
  invoiceCode: string; type: string; status: string; totalAmount: bigint; amountPaid: bigint; balanceDue: bigint;
  rentalAmount: bigint; depositAmount: bigint; serviceAmount: bigint; chargeAmount: bigint; pricingSnapshot: unknown;
  depositSettlement?: { returnRequest: { inspections: { rentalContractId: string }[] } } | null;
  renewalRequest?: { rentalContractId: string | null } | null;
};

function verifiedBreakdown(invoice: ReturnInvoice, allIds: ReadonlySet<string>) {
  const details = savedInvoiceBreakdown(invoice.pricingSnapshot, invoice);
  if (!details?.units.length) return null;
  const ids = new Set(details.units.map(unit => unit.contractId));
  return ids.size === details.units.length && [...ids].every(id => allIds.has(id)) ? details : null;
}

type InvoiceScope = 'RELATED' | 'UNRELATED' | 'UNKNOWN';

function returnInvoiceScope(invoice: ReturnInvoice, targetIds: string[], allIds: ReadonlySet<string>, trackCleared = false): InvoiceScope {
  if (invoice.type === 'SETTLEMENT') {
    const adjustment = invoice.pricingSnapshot as { adjustment?: string; rentalContractId?: string; contracts?: string[] } | null;
    const related = adjustment?.adjustment === 'RETURN_OVERDUE' ? adjustment.contracts
      : [PERIOD_CLOSEOUT, 'TRANSFER_FINANCE', 'TRANSFER_RETURN_BALANCE'].includes(adjustment?.adjustment ?? '') && adjustment?.rentalContractId ? [adjustment.rentalContractId] : undefined;
    if (Array.isArray(related) && related.length && related.every(id => allIds.has(id))) {
      return targetIds.some(id => related.includes(id)) ? 'RELATED' : 'UNRELATED';
    }
    const links = invoice.depositSettlement?.returnRequest.inspections;
    if ((!links?.length || links.some(link => !allIds.has(link.rentalContractId))) && targetIds.length < allIds.size) return 'UNKNOWN';
    if (links?.length && !links.some(link => targetIds.includes(link.rentalContractId))) return 'UNRELATED';
    if (!trackCleared && invoice.amountPaid !== 0n && links?.some(link => !targetIds.includes(link.rentalContractId))) return 'UNKNOWN';
  } else if (invoice.type === 'RENEWAL' && invoice.renewalRequest?.rentalContractId) {
    const renewalContract = invoice.renewalRequest.rentalContractId;
    if (!allIds.has(renewalContract)) return 'UNKNOWN';
    if (!targetIds.includes(renewalContract)) return 'UNRELATED';
    const details = verifiedBreakdown(invoice, allIds);
    if (!details || details.units.length !== 1 || details.units[0].contractId !== renewalContract) return 'UNKNOWN';
  } else if (targetIds.length < allIds.size) {
    const details = verifiedBreakdown(invoice, allIds);
    if (!details || (invoice.type === 'INITIAL' && details.units.length !== allIds.size)) return 'UNKNOWN';
    const applies = details.units.some(unit => targetIds.includes(unit.contractId) && (unit.rentalAmount > 0 || unit.depositAmount > 0));
    const shared = details.sharedServices.some(service => service.amount > 0) || details.adjustmentAmount > 0;
    if (!applies && !shared) return 'UNRELATED';
    if (!trackCleared && invoice.amountPaid !== 0n && (shared ||
      details.units.some(unit => !targetIds.includes(unit.contractId) && (unit.rentalAmount > 0 || unit.depositAmount > 0)))) return 'UNKNOWN';
  }
  return 'RELATED';
}

/** Shared invoices remain payable documents. An unallocated partial payment is never assigned to one unit. */
export function contractReturnReadiness(invoices: ReturnInvoice[], targetIds: string[], allContractIds: string[]) {
  const collected: ReturnInvoice[] = [];
  const allIds = new Set(allContractIds);
  for (const invoice of invoices) {
    if (invoice.status === 'VOID' || invoice.balanceDue === 0n) continue;
    const scope = returnInvoiceScope(invoice, targetIds, allIds);
    if (scope === 'UNKNOWN') return { ...returnReadiness(null), requiresReconciliation: true };
    if (scope === 'RELATED') collected.push(invoice);
  }
  const readiness = returnReadiness(collected);
  return { ...readiness, requiresReconciliation: readiness.totalOutstanding === null };
}

export function depositRefundLedger(invoices: (ReturnInvoice & { id: string; paidAt: Date | null; voidedAt: Date | null })[],
  targetIds: string[], allContractIds: string[]) {
  const allIds = new Set(allContractIds);
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const outstanding: ReturnInvoice[] = [];
  let latestClearance: Date | null = null;
  for (const invoice of invoices) {
    const cleared = invoice.status === 'VOID' || invoice.balanceDue === 0n;
    const pricing = invoice.pricingSnapshot as { adjustment?: string; sourceInvoiceId?: string } | null;
    const source = pricing?.adjustment === 'PAYMENT_OVERDUE' && pricing.sourceInvoiceId ? byId.get(pricing.sourceInvoiceId) : null;
    const scope = source ? returnInvoiceScope(source, targetIds, allIds, true)
      : returnInvoiceScope(invoice, targetIds, allIds, cleared);
    if (scope === 'UNRELATED') continue;
    if (cleared) {
      const date = invoice.status === 'VOID' ? invoice.voidedAt : invoice.paidAt;
      if (date && (!latestClearance || date > latestClearance)) latestClearance = date;
    } else if (scope === 'UNKNOWN') {
      return { outstandingBalance: null, latestClearance: null };
    } else {
      outstanding.push(invoice);
    }
  }
  return { outstandingBalance: returnReadiness(outstanding).totalOutstanding, latestClearance };
}

export function contractDeposit(invoices: ReturnInvoice[], targetIds: string[], allContractIds: string[], quote: unknown, legacy: boolean) {
  const initial = invoices.filter(invoice => invoice.type === 'INITIAL' && invoice.status !== 'VOID');
  const paid = initial[0];
  if (initial.length !== 1 || paid.status !== 'PAID' || paid.balanceDue !== 0n || paid.amountPaid !== paid.totalAmount) {
    throw new ConflictException({ code: 'RETURN_INITIAL_PAYMENT_UNVERIFIED', message: 'Cần đối soát hóa đơn ban đầu và số tiền đã thu trước khi nhận trả kho.' });
  }
  const allIds = new Set(allContractIds);
  const details = verifiedBreakdown(paid, allIds);
  if (details?.units.length === allIds.size) {
    return details.units.filter(unit => targetIds.includes(unit.contractId)).reduce((sum, unit) => sum + BigInt(unit.depositAmount), 0n);
  }
  const historicalDeposit = (quote as { depositAmount?: number } | null)?.depositAmount;
  if ((allIds.size === 1 || legacy && targetIds.length === allIds.size)
      && Number.isSafeInteger(historicalDeposit) && BigInt(historicalDeposit!) === paid.depositAmount) return paid.depositAmount;
  if (legacy) throw new ConflictException({ code: 'DEPOSIT_HISTORY_MISMATCH', message: 'Tiền cọc trên hóa đơn ban đầu chưa khớp hồ sơ thuê lịch sử. Cần quản lý đối soát.' });
  throw new ConflictException({ code: 'RETURN_DEPOSIT_ALLOCATION_REQUIRED', message: 'Chưa xác định được tiền cọc của hợp đồng từ hóa đơn đã thu. Cần quản lý đối soát trước khi nhận trả kho.' });
}

export function recordedContractDeposit(invoices: ReturnInvoice[], targetIds: string[], allContractIds: string[], quote: unknown, legacy: boolean) {
  if (!targetIds.length) return null;
  try {
    return Number(contractDeposit(invoices, targetIds, allContractIds, quote, legacy));
  } catch (error) {
    if (!(error instanceof ConflictException)) throw error;
    return null;
  }
}
