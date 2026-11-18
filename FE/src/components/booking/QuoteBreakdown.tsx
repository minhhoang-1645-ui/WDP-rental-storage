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
      <p className="quote-plan-label">{summary.plan}{quote.termMonths ? ` · Thuê ${quote.termMonths} tháng` : ''}{quote.quantity ? ` · ${quote.quantity} kho` : ''}</p>
      <p>Gồm các khoản bên dưới.</p>
      {period && <p className="quote-covered-period">Tiền thuê trong khoản này: {period}.</p>}
      {initial && <div className="quote-initial-lines">
        <div><span>{summary.monthly ? 'Tiền thuê tháng đầu' : 'Tiền thuê cả kỳ'}{Number(quote.discountPercent)>0 ? ` (đã giảm ${quote.discountPercent}%)` : ''}</span><b>{money(initial.rentalAmount)}</b></div>
        {initial.depositAmount>0 && <div><span>Tiền cọc bảo đảm · thu một lần</span><b>{money(initial.depositAmount)}</b></div>}
        {initial.purchaseAddOnAmount>0 && <div><span>Vật tư/dịch vụ mua một lần</span><b>{money(initial.purchaseAddOnAmount)}</b></div>}
        {initial.rentalAddOnAmount>0 && <div><span>Dịch vụ/thiết bị thuê trong kỳ đầu</span><b>{money(initial.rentalAddOnAmount)}</b></div>}
      </div>}
      {initial?.depositAmount===0 && <p className="quote-no-deposit">Kho này không thu tiền cọc.</p>}
      {Number(initial?.depositAmount)>0 && <p>Tiền cọc được hoàn sau khi trừ các khoản phải trả khi trả kho.</p>}
      <p className="quote-payment-timing">Ký hợp đồng rồi thanh toán theo hóa đơn.</p>
    </section>
    {summary.remaining!==null && <section className="quote-later-payment" aria-label="Các kỳ thanh toán sau">
      <div><span>{summary.remaining>0 ? 'Thanh toán ở các kỳ sau' : 'Không còn khoản thanh toán kỳ sau'}</span><strong>{money(summary.remaining)}</strong></div>
      {summary.laterCount!==null && <p>{summary.laterCount} kỳ còn lại × {money(summary.laterEach)}/kỳ.</p>}
      {summary.remaining>0 && <p>{summary.laterCount===null ? 'Số tiền từng kỳ được ghi trên hóa đơn tương ứng. ' : ''}Khoản này trả ở kỳ sau, không thu thêm cọc.</p>}
    </section>}
    <section className="quote-term-summary" aria-label="Tổng tiền cho toàn bộ kỳ thuê">
      <h4>Tổng tiền cả kỳ thuê</h4>
      <div className="quote-breakdown-lines">
        {typeof quote.rentalAmount==='number' && <div><span>Tiền thuê kho cả kỳ{Number(quote.discountAmount)>0 ? ' (đã trừ ưu đãi)' : ''}<small>{quotePeriod(quote.startDate, quote.endDate)}</small></span><b>{money(quote.rentalAmount)}</b></div>}
        {Number(quote.addOnTotalAmount)>0 && <div><span>Dịch vụ và vật tư cả kỳ<small>Chi tiết từng dịch vụ ở phần cách tính bên dưới.</small></span><b>{money(quote.addOnTotalAmount)}</b></div>}
        {Number(quote.depositAmount)>0 && <div><span>Tiền cọc bảo đảm<small>Đã tính trong lần đầu; không thu thêm ở các kỳ sau.</small></span><b>{money(quote.depositAmount)}</b></div>}
      </div>
      <div className="quote-breakdown-total"><span>{Number(quote.depositAmount)>0 ? 'Tổng dự kiến cả kỳ, gồm cọc' : 'Tổng dự kiến cả kỳ'}</span><strong>{money(summary.total)}</strong></div>
      <p className="quote-total-explanation">Gồm lần thanh toán đầu và các kỳ sau.{summary.monthly && Number(summary.remaining)>0 ? ' Bạn không phải trả toàn bộ số này trong lần đầu.' : ''}</p>
    </section>
    <details className="quote-cost-details"><summary>Xem cách tính và chi tiết cả kỳ</summary>
      {typeof quote.monthlyUnitPrice==='number' && <p className="quote-unit-price">Đơn giá một kho: <strong>{money(quote.monthlyUnitPrice)}/tháng</strong></p>}
      <div className="quote-breakdown-lines">{quote.lineItems.map((item,index)=><div key={`${item.code}:${index}`} className={Number(item.amount)<0?'is-discount':''}><span><strong>{serviceDisplayName(item.code,item.label)}</strong><small>{item.code==='storage-rent' && rentalBasis ? rentalBasis : item.basis}</small></span><b>{money(item.amount)}</b></div>)}</div>
      {Number(quote.discountAmount)>0 && <p className="quote-breakdown-note">Ưu đãi chỉ giảm tiền thuê kho; không giảm tiền cọc hoặc dịch vụ.</p>}
      {Number(quote.depositAmount)>0 && <p className="quote-breakdown-note">Tiền cọc được đối chiếu và quyết toán khi trả kho theo hợp đồng; không phải tiền thuê.</p>}
    </details>
  </div>;
}
