export function isScheduledRenewalInvoice(invoice: { type?: string; renewalCycle?: number | null; dueAt?: Date | null }, now = new Date()) {
  return invoice.type === 'RENEWAL' && (invoice.renewalCycle ?? 0) > 1 && !!invoice.dueAt && invoice.dueAt > now;
}

/** Read the same approval scope used for returning the current contract period. */
export const closeoutReservationSelect = {
  id: true, customerId: true, status: true, expiresAt: true, quantity: true,
  contracts: { select: { id: true, status: true, endDate: true } },
  supportRequests: {
    where: { subject: 'Đề nghị trả kho trước hạn', category: 'OTHER', status: 'RESOLVED', lastAction: 'EARLY_RETURN_APPROVED', resolvedBy: { role: 'MANAGER' } },
    select: { id: true, subject: true, category: true, status: true, lastAction: true, lastActionIdempotencyKey: true, resolvedBy: { select: { role: true } } },
  },
} as const;

type CloseoutReservation = {
  quantity?: number;
  contracts?: Array<{ status?: string; endDate?: Date | null }>;
  supportRequests?: Array<{ id?: string; subject?: string; category?: string; status?: string; lastAction?: string | null; lastActionIdempotencyKey?: string | null; resolvedBy?: { role?: string } | null }>;
};

export function closeoutPaymentAllowed(reservation?: CloseoutReservation | null) {
  const contracts = reservation?.contracts ?? [];
  if (!contracts.length || contracts.length !== reservation?.quantity || contracts.some(contract => !['ACTIVE', 'COMPLETED'].includes(contract.status ?? '') || !contract.endDate || !Number.isFinite(contract.endDate.getTime()))) return false;
  const ends = new Set(contracts.map(contract => contract.endDate!.toISOString().slice(0, 10)));
  if (ends.size !== 1) return false;
  const endDate = [...ends][0];
  return (reservation?.supportRequests ?? []).some(request => request.subject === 'Đề nghị trả kho trước hạn' && request.category === 'OTHER'
    && request.status === 'RESOLVED' && request.lastAction === 'EARLY_RETURN_APPROVED' && request.resolvedBy?.role === 'MANAGER'
    && request.lastActionIdempotencyKey === `early-return:${request.id}:${endDate}`);
}

export function invoicePaymentBlockedBySchedule(invoice: { type?: string; renewalCycle?: number | null; dueAt?: Date | null; reservation?: CloseoutReservation | null }, now = new Date()) {
  return isScheduledRenewalInvoice(invoice, now) && !closeoutPaymentAllowed(invoice.reservation);
}
