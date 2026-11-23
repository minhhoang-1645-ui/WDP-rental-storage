import { Facts } from './PortalUi';
import { label, money, object, rows, first, type Row } from './portal-data';

/** Display saved backend pricing; never recalculate installments from catalog prices. */
export function ManagerPricingExplanation({ quote, emphasizeInstallments = false }: { quote: Row; emphasizeInstallments?: boolean }) {
  const initial = object(quote.initialPaymentBreakdown);
  const installmentAmounts: [string, string][] = [
    ...(typeof initial.totalAmount === 'number' ? [['Dự kiến thanh toán lần đầu', money(initial.totalAmount)]] as [string, string][] : []),
    ...(typeof initial.remainingAmount === 'number' ? [['Dự kiến các kỳ tiếp theo', money(initial.remainingAmount)]] as [string, string][] : []),
  ];
  const period = quote.billingMode === 'DAILY' ? `${quote.billableDays} ngày` : typeof quote.termMonths === 'number' ? `${quote.termMonths} tháng` : 'Chưa có thời hạn';
  const services = [
    ['Dịch vụ mua', quote.purchaseAddOnAmount],
    ['Dịch vụ thuê', quote.rentalAddOnAmount],
  ] as const;
  return <section className="manager-section saved-quote" aria-label="Báo giá kỳ thuê">
    <header><h2>Báo giá kỳ thuê</h2><p>{period} · {label(quote.paymentPlan)}</p></header>
    <dl className="saved-quote-amounts">
      <div><dt>{typeof quote.discountAmount === 'number' && quote.discountAmount > 0 ? 'Tiền thuê sau giảm giá' : 'Tiền thuê'}</dt><dd>{money(quote.rentalAmount)}</dd></div>
      <div><dt>Tiền cọc</dt><dd>{money(quote.depositAmount)}</dd></div>
      {services.filter(([, amount]) => amount != null && amount !== 0).map(([title, amount]) => <div key={title}><dt>{title}</dt><dd>{money(amount)}</dd></div>)}
      <div className="saved-quote-total"><dt>Tổng báo giá (gồm cọc)</dt><dd>{money(quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal)}</dd></div>
    </dl>
    {emphasizeInstallments && installmentAmounts.length > 0 && <Facts items={installmentAmounts} />}
    <details className="saved-quote-details"><summary>Xem chi tiết báo giá</summary>
      <Facts items={[
      ['Giá niêm yết / tháng / kho', money(quote.monthlyUnitPrice)],
      ['Tiền thuê trước giảm giá', money(quote.baseRentalAmount)],
      [`Giảm giá${typeof quote.discountPercent === 'number' ? ` (${quote.discountPercent}%)` : ''}`, money(quote.discountAmount)],
    ]} />
    {Object.keys(initial).length > 0 && <><h3>Thanh toán theo báo giá</h3><Facts items={[
      ['Tiền thuê kỳ đầu', money(initial.rentalAmount)], ['Cọc thu lần đầu', money(initial.depositAmount)],
      ['Mua dịch vụ lần đầu', money(initial.purchaseAddOnAmount)], ['Thuê dịch vụ kỳ đầu', money(initial.rentalAddOnAmount)],
      ...(!emphasizeInstallments ? [['Tổng lần đầu', money(initial.totalAmount)], ['Dự kiến các kỳ tiếp theo', money(initial.remainingAmount)]] as [string, string][] : []),
    ]} /></>}
    {rows(quote.lineItems).length > 0 && <div className="saved-quote-calculation"><h3>Cách tính</h3>{rows(quote.lineItems).map((item, index) => <div className="portal-quote-line" key={`${first(item, 'code')}:${index}`}><span>{first(item, 'label')}<small>{first(item, 'basis')}</small></span><strong>{money(item.amount)}</strong></div>)}</div>}
    </details>
  </section>;
}
