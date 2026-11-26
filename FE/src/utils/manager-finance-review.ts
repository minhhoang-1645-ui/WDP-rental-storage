export const financeReviewTypes = {
  submissions: { api: '/manager/payment-submissions', pending: ['PENDING_VERIFICATION'] },
  reconciliation: { api: '/manager/online-payment-reconciliations', pending: ['PENDING_REVIEW', 'REFUND_REQUIRED'] },
} as const;

export type FinanceReviewType = keyof typeof financeReviewTypes;
export const managerPaymentsPath = '/manager/operations/payments';

export function managerFinanceReviewPath(kind: FinanceReviewType, record = '', invoiceId = '', from = '') {
  const query = new URLSearchParams({ review: kind });
  if (record) query.set('record', record);
  if (from) query.set('from', from);
  const path = invoiceId ? '/manager/operations/invoices/' + encodeURIComponent(invoiceId) : managerPaymentsPath;
  return path + '?' + query;
}
