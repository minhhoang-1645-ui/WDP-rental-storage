import type { PricingEstimate } from '../../types/booking';
import { serviceDisplayName } from '../../utils/service-labels';

const money = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND',maximumFractionDigits:0 }).format(value) : 'Chờ xác nhận';
const date = (value: string) => value.split('-').reverse().join('/');
export function QuoteBreakdown({ quote }: { quote: PricingEstimate }) {
  const initial = quote.initialPaymentBreakdown;
  return <div className="quote-breakdown">
    {typeof quote.monthlyUnitPrice === 'number' && <p className="quote-unit-price">Đơn giá một kho: <strong>{money(quote.monthlyUnitPrice)}/tháng</strong>{quote.billingMode === 'DAILY' && <span> · Thuê ngày được tính theo đơn giá tháng ÷ 30.</span>}</p>}
    <h4>Chi phí dự kiến cho cả kỳ thuê</h4>
    <div className="quote-breakdown-lines">{quote.lineItems.map((item,index) => <div key={`${item.code}:${index}`} className={Number(item.amount) < 0 ? 'is-discount' : ''}><span><strong>{serviceDisplayName(item.code,item.label)}</strong><small>{item.basis}</small></span><b>{money(item.amount)}</b></div>)}</div>
    <div className="quote-breakdown-total"><span>Tổng cả kỳ, bao gồm tiền cọc</span><strong>{money(quote.quotedTotalAmount ?? quote.grandTotal)}</strong></div>
    {typeof quote.estimatedInitialAmountDue === 'number' && <section className="quote-initial-payment" aria-label="Khoản thanh toán lần đầu">
      <h4>Dự kiến thanh toán lần đầu</h4>
      {initial && <><p>Kỳ đầu: {date(initial.periodStart)}–{date(initial.periodEnd)} (không tính ngày kết thúc)</p><div className="quote-breakdown-lines"><div><span>Tiền thuê kho kỳ đầu</span><b>{money(initial.rentalAmount)}</b></div><div><span>Tiền cọc thu một lần</span><b>{money(initial.depositAmount)}</b></div>{initial.purchaseAddOnAmount > 0 && <div><span>Vật tư mua một lần</span><b>{money(initial.purchaseAddOnAmount)}</b></div>}{initial.rentalAddOnAmount > 0 && <div><span>Thiết bị đến kỳ tính phí lần đầu</span><b>{money(initial.rentalAddOnAmount)}</b></div>}</div></>}
      <div className="quote-breakdown-total"><span>Khoản đầu tiên dự kiến</span><strong>{money(quote.estimatedInitialAmountDue)}</strong></div>
      {initial && initial.remainingAmount > 0 && <p>Các kỳ sau dự kiến: <strong>{money(initial.remainingAmount)}</strong>. Tiền cọc không thu lại trong các kỳ này.</p>}
    </section>}
    <p className="quote-breakdown-note">{quote.paymentPlan === 'PAY_MONTHLY' ? 'Tổng cả kỳ khác số cần trả lần đầu. ' : ''}Tiền cọc không được chiết khấu và không phải tiền thuê. Số tiền cần trả và hạn thanh toán được ghi trên từng hóa đơn.</p>
  </div>;
}
