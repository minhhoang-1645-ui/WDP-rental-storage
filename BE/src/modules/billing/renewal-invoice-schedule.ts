import { businessToday } from '../../business-date.js';

export function isScheduledRenewalInvoice(invoice: { type?: string; renewalCycle?: number | null; dueAt?: Date | null }, now = new Date()) {
  return invoice.type === 'RENEWAL' && (invoice.renewalCycle ?? 0) > 1 && !!invoice.dueAt && invoice.dueAt > businessToday(now);
}

/** Read the same approval scope used for returning the current contract period. */
export const closeoutReservationSelect = {
  id: true, customerId: true, status: true, expiresAt: true, quantity: true,
  contracts: { select: { id: true, status: true, endDate: true } },
  supportRequests: {
    where: { subject: 'Đề nghị trả kho trước hạn', category: 'OTHER', status: 'RESOLVED', lastAction: 'EARLY_RETURN_APPROVED', resolvedBy: { role: 'MANAGER' } },
    select: { id: true, rentalContractId: true, subject: true, category: true, status: true, lastAction: true, lastActionIdempotencyKey: true, earlyReturnFinancialReview: true, resolvedBy: { select: { role: true } } },
  },
} as const;

type CloseoutReservation = {
  quantity?: number;
  contracts?: Array<{ id?: string; status?: string; endDate?: Date | null }>;
  supportRequests?: Array<{ id?: string; rentalContractId?: string | null; subject?: string; category?: string; status?: string; lastAction?: string | null; lastActionIdempotencyKey?: string | null; earlyReturnFinancialReview?: unknown; resolvedBy?: { role?: string } | null }>;
};

export const renewalInvoiceScope = { select: { rentalContractId: true } } as const;

export function closeoutPaymentAllowed(reservation?: CloseoutReservation | null, rentalContractId?: string | null) {
  const contracts = reservation?.contracts ?? [];
  return (reservation?.supportRequests ?? []).some(request => {
    if (request.subject !== 'Đề nghị trả kho trước hạn' || request.category !== 'OTHER' || request.status !== 'RESOLVED'
      || request.lastAction !== 'EARLY_RETURN_APPROVED' || request.resolvedBy?.role !== 'MANAGER') return false;
    if ((request.earlyReturnFinancialReview as { policy?: string } | null)?.policy === 'PERIOD_CLOSEOUT_V1') return false;
    if (rentalContractId && request.rentalContractId && request.rentalContractId !== rentalContractId) return false;
    const targets = request.rentalContractId ? contracts.filter(contract => contract.id === request.rentalContractId) : contracts;
    if (targets.length !== (request.rentalContractId ? 1 : reservation?.quantity) || !targets.length
      || targets.some(contract => !['ACTIVE', 'COMPLETED'].includes(contract.status ?? '') || !contract.endDate || !Number.isFinite(+contract.endDate))) return false;
    const dates = new Set(targets.map(contract => contract.endDate!.toISOString().slice(0, 10)));
    return dates.size === 1 && request.lastActionIdempotencyKey === `early-return:${request.id}:${[...dates][0]}`;
  });
}

export function invoicePaymentBlockedBySchedule(invoice: { type?: string; renewalCycle?: number | null; dueAt?: Date | null; reservation?: CloseoutReservation | null; renewalRequest?: { rentalContractId?: string | null } | null }, now = new Date()) {
  return isScheduledRenewalInvoice(invoice, now) && !closeoutPaymentAllowed(invoice.reservation, invoice.renewalRequest?.rentalContractId);
}
