type Contract = { id: string; contractCode: string; termsAcceptedAt?: Date | null };
type Invoice = { type: string; reservation: { quantity: number; contracts: Contract[] }; renewalRequest?: { id: string; status: string; appendixAcceptedAt?: Date | null } | null };

export function supportsOnlinePayment(invoice: { type: string; pricingSnapshot?: unknown; depositSettlementId?: string | null }) {
  if (['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return true;
  const pricing = invoice.pricingSnapshot as { adjustment?: string; sourceInvoiceId?: string; returnRequestId?: string; transferId?: string } | null;
  return invoice.type === 'SETTLEMENT' && !invoice.depositSettlementId &&
    (pricing?.adjustment === 'PAYMENT_OVERDUE' && Boolean(pricing.sourceInvoiceId) ||
      ['PERIOD_CLOSEOUT_V1', 'RETURN_OVERDUE'].includes(pricing?.adjustment ?? '') && Boolean(pricing?.returnRequestId) ||
      ['TRANSFER_FINANCE', 'TRANSFER_RETURN_BALANCE'].includes(pricing?.adjustment ?? '') && Boolean(pricing?.transferId));
}

/** Display metadata only; BillingService still validates signatures inside payment transactions. */
export function invoiceSigningRequirements(invoice: Invoice) {
  if (invoice.type === 'INITIAL') {
    const contracts = invoice.reservation.contracts.filter(contract => !contract.termsAcceptedAt).map(contract => ({ id: contract.id, code: contract.contractCode }));
    return { required: true, complete: contracts.length === 0 && invoice.reservation.contracts.length === invoice.reservation.quantity && invoice.reservation.quantity > 0, contracts, renewalId: null };
  }
  if (invoice.type === 'RENEWAL') {
    const renewal = invoice.renewalRequest;
    return { required: true, complete: Boolean(renewal && (renewal.appendixAcceptedAt || renewal.status === 'COMPLETED')), contracts: [], renewalId: renewal?.id ?? null };
  }
  return { required: false, complete: true, contracts: [], renewalId: null };
}
