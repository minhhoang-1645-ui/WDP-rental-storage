export function isScheduledRenewalInvoice(invoice: { type?: string; renewalCycle?: number | null; dueAt?: Date | null }, now = new Date()) {
  return invoice.type === 'RENEWAL' && (invoice.renewalCycle ?? 0) > 1 && !!invoice.dueAt && invoice.dueAt > now;
}
