/** Presentation only: amounts come from the quote, never reconstruct an invoice or a price policy. */
type QuoteSource = { estimatedInitialAmountDue?: unknown; quotedTotalAmount?: unknown; grandTotal?: unknown; initialPaymentBreakdown?: unknown; paymentPlan?: unknown; billingMode?: unknown; termMonths?: unknown; addOnTotalAmount?: unknown };
const amount = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function quotePaymentSummary(quote: QuoteSource) {
  const initial = quote.initialPaymentBreakdown && typeof quote.initialPaymentBreakdown === 'object' ? quote.initialPaymentBreakdown as Record<string, unknown> : {};
  const first = amount(quote.estimatedInitialAmountDue);
  const total = amount(quote.quotedTotalAmount) ?? amount(quote.grandTotal);
  const remaining = amount(initial.remainingAmount) ?? (first !== null && total !== null && total >= first ? total - first : null);
  const monthly = quote.paymentPlan === 'PAY_MONTHLY' && quote.billingMode === 'MONTHLY';
  const terms = typeof quote.termMonths === 'number' && Number.isSafeInteger(quote.termMonths) ? quote.termMonths : 0;
  const rent = amount(initial.rentalAmount);
  // Services may be billed in different cycles. Show equal installments only when the quote proves it.
  const equalPayments = monthly && terms > 1 && quote.addOnTotalAmount === 0 && rent !== null && remaining === rent * (terms - 1);
  return { first, total, remaining, monthly, laterCount: equalPayments ? terms - 1 : null, laterEach: equalPayments ? rent : null,
    plan: monthly ? 'Trả theo tháng' : quote.billingMode === 'DAILY' ? 'Trả trọn kỳ thuê ngắn ngày' : quote.paymentPlan === 'PREPAID' ? 'Trả trước toàn kỳ' : 'Theo phương án đã chọn' };
}
export function quotePeriod(start: unknown, endExclusive: unknown) {
  if (typeof start !== 'string' || typeof endExclusive !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(endExclusive)) return '';
  const first = new Date(start+'T00:00:00Z'), end = new Date(endExclusive+'T00:00:00Z');
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(end.getTime()) || end <= first || first.toISOString().slice(0,10)!==start || end.toISOString().slice(0,10)!==endExclusive) return '';
  const format = (date: Date) => date.toLocaleDateString('vi-VN', {timeZone:'UTC'});
  return `${format(first)} – hết ${format(new Date(end.getTime()-86400000))}`;
}
