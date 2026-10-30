import type { PricingEstimate } from '../../types/booking';
import { serviceDisplayName } from '../../utils/service-labels';
import { quotePaymentSummary, quotePeriod } from '../../utils/quote-payment-summary';

const money = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', {style:'currency',currency:'VND',maximumFractionDigits:0}).format(value) : 'Chờ xác nhận';
export function QuoteBreakdown({ quote }: { quote: PricingEstimate }) {
  const initial = quote.initialPaymentBreakdown;
  const summary = quotePaymentSummary(quote);
  const period = initial ? quotePeriod(initial.periodStart,initial.periodEnd) : '';
  const rentalBasis = quote.monthlyUnitPrice !== undefined && quote.quantity
    ? quote.billingMode === 'DAILY' ? `(${money(quote.monthlyUnitPrice)}/tháng ÷ 30) × ${quote.billableDays} ngày × ${quote.quantity} kho`
    : `${money(quote.monthlyUnitPrice)}/tháng × ${quote.termMonths} tháng × ${quote.quantity} kho` : '';
  return <div className="quote-breakdown">
    <section className="quote-initial-payment" aria-label="Khoản thanh toán lần đầu">
      <div className="quote-first-heading"><h4>Thanh toán lần đầu</h4><span>Dự kiến</span></div>
      <strong className="quote-first-amount" aria-label="Số tiền thanh toán lần đầu dự kiến">{money(summary.first)}</strong>
      <p className="quote-plan-label">{summary.plan}{quote.termMonths ? ` · Thuê ${quote.termMonths} tháng` : ''}</p>
      {period && <p className="quote-covered-period">Tiền thuê trong khoản này: {period}.</p>}
      {initial && <div className="quote-initial-lines">
        <div><span>{summary.monthly ? 'Tiền thuê tháng đầu' : 'Tiền thuê cả kỳ'}{Number(quote.discountPercent)>0 ? ` (đã giảm ${quote.discountPercent}%)` : ''}</span><b>{money(initial.rentalAmount)}</b></div>
        {initial.depositAmount>0 && <div><span>Tiền cọc · chỉ thu một lần</span><b>{money(initial.depositAmount)}</b></div>}
        {initial.purchaseAddOnAmount>0 && <div><span>Vật tư mua một lần</span><b>{money(initial.purchaseAddOnAmount)}</b></div>}
        {initial.rentalAddOnAmount>0 && <div><span>Thiết bị tính phí trong khoản đầu</span><b>{money(initial.rentalAddOnAmount)}</b></div>}
      </div>}
      {initial?.depositAmount===0 && <p className="quote-no-deposit">Kho này không thu tiền cọc.</p>}
      <p className="quote-payment-timing">Báo giá dự kiến. Thanh toán theo hóa đơn sau khi đơn được xác nhận và hợp đồng đã ký.</p>
    </section>
    {summary.remaining!==null && <section className="quote-later-payment" aria-label="Các kỳ thanh toán sau">
      <div><span>{summary.remaining>0 ? 'Còn lại trong các kỳ sau' : 'Không còn tiền thuê/dịch vụ của báo giá này ở kỳ sau'}</span><strong>{money(summary.remaining)}</strong></div>
      {summary.laterCount!==null && <p>{summary.laterCount} kỳ còn lại × {money(summary.laterEach)}/kỳ.</p>}
      {summary.remaining>0 && <p>{summary.laterCount===null ? 'Số tiền từng kỳ được ghi trên hóa đơn tương ứng. ' : ''}Khoản này chưa thu trong lần đầu. Tiền cọc không thu lại.</p>}
    </section>}
    <div className="quote-breakdown-total"><span>Tổng chi phí cả kỳ</span><strong>{money(summary.total)}</strong></div>
    <p className="quote-total-explanation">Đã gồm tiền thuê sau ưu đãi, dịch vụ và cọc nếu có. Đây không phải khoản thu thêm.</p>
    <details className="quote-cost-details"><summary>Xem cách tính và chi tiết cả kỳ</summary>
      {typeof quote.monthlyUnitPrice==='number' && <p className="quote-unit-price">Đơn giá một kho: <strong>{money(quote.monthlyUnitPrice)}/tháng</strong></p>}
      <div className="quote-breakdown-lines">{quote.lineItems.map((item,index)=><div key={`${item.code}:${index}`} className={Number(item.amount)<0?'is-discount':''}><span><strong>{serviceDisplayName(item.code,item.label)}</strong><small>{item.code==='storage-rent' && rentalBasis ? rentalBasis : item.basis}</small></span><b>{money(item.amount)}</b></div>)}</div>
      {Number(quote.discountAmount)>0 && <p className="quote-breakdown-note">Ưu đãi chỉ giảm tiền thuê kho; không giảm tiền cọc hoặc dịch vụ.</p>}
      {Number(quote.depositAmount)>0 && <p className="quote-breakdown-note">Tiền cọc được đối chiếu và quyết toán khi trả kho theo hợp đồng; không phải tiền thuê.</p>}
    </details>
  </div>;
}
