import { Facts } from './PortalUi';
import { Coins } from 'lucide-react';
import { label, money, object, rows, first, type Row } from './portal-data';

export function ManagerContractQuote({ quote, orderScope }: { quote: Row; orderScope: boolean }) {
  const daily = quote.billingMode === 'DAILY';
  const duration = daily ? quote.billableDays : quote.termMonths;
  const unit = daily ? 'ngày' : 'tháng';
  const rate = daily ? quote.dailyUnitPrice : quote.monthlyUnitPrice;
  const dailyFraction = daily && typeof rate === 'string' ? /^(\d+)\/(\d+)$/.exec(rate) : null;
  const displayRate = dailyFraction ? `(${money(Number(dailyFraction[1]))} ÷ ${dailyFraction[2]})`
    : money(daily && typeof rate === 'string' && rate.trim() ? Number(rate) : rate);
  const total = quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal;
  const adjustments: [string, unknown][] = [
    ['Chiết khấu', typeof quote.discountAmount === 'number' ? -quote.discountAmount : null],
    ['Dịch vụ mua', quote.purchaseAddOnAmount], ['Dịch vụ thuê', quote.rentalAddOnAmount],
    ...rows(quote.lineItems).filter(item => !['storage-rent', 'prepaid-discount', 'deposit'].includes(String(item.code)) && !String(item.code).startsWith('service-')).map((item): [string, unknown] => [first(item, 'label'), item.amount]),
  ];
  const charges = adjustments.filter((item): item is [string, number] => typeof item[1] === 'number' && Number.isFinite(item[1]) && item[1] !== 0);
  const { quantity } = quote;
  const rent = quote.baseRentalAmount ?? quote.rentalAmount;
  const unitRate = daily && typeof rate === 'string' && rate.trim() ? Number(rate) : rate;
  const equation = typeof unitRate === 'number' && Number.isFinite(unitRate) && typeof duration === 'number' && duration > 0
    && typeof quantity === 'number' && quantity > 0 && unitRate * duration * quantity === rent
    ? `${displayRate} × ${duration} ${unit}${quantity > 1 ? ` × ${quantity} kho` : ''} = ${money(rent)}`
    : '';
  return <section className="contract-card contract-quote">
    <h2><Coins size={19} /> Báo giá toàn kỳ thuê</h2>
    {orderScope && <p className="contract-muted">Áp dụng cho toàn bộ đơn đặt kho{typeof quote.quantity === 'number' && quote.quantity > 1 ? ` · ${quote.quantity} kho` : ''}.</p>}
    <dl className="contract-quote-lines">
      <div><dt>Thời gian thuê</dt><dd>{typeof duration === 'number' && duration > 0 ? `${duration} ${unit}` : 'Chưa cập nhật'}</dd></div>
      <div><dt>Tiền thuê mỗi {unit} / kho</dt><dd>{displayRate}</dd></div>
      {equation && <div className="contract-quote-equation"><dt>Tiền thuê cả kỳ</dt><dd>{equation}</dd></div>}
      <div><dt>Tiền đặt cọc</dt><dd>{quote.depositAmount === 0 ? 'Không cần đặt cọc' : money(quote.depositAmount)}</dd></div>
      {charges.map(([title, amount], index) => <div key={title + index}><dt>{title}</dt><dd>{money(amount)}</dd></div>)}
      <div className="contract-quote-total"><dt>Tổng cả kỳ{typeof quote.depositAmount === 'number' && quote.depositAmount > 0 ? ' (gồm cọc)' : ''}</dt><dd>{money(total)}</dd></div>
    </dl>
  </section>;
}

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
