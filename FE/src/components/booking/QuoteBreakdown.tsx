import { ChevronDown } from 'lucide-react';
import type { PricingEstimate } from '../../types/booking';
import { serviceDisplayName } from '../../utils/service-labels';
import { quotePaymentSummary, quotePeriod } from '../../utils/quote-payment-summary';

const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const bookingMoney = (amount: number | null | undefined) => typeof amount === 'number' && Number.isFinite(amount) ? formatMoney.format(amount) : 'Chờ báo giá';

export function QuoteBreakdown({ quote }: { quote: PricingEstimate }) {
  const initial = quote.initialPaymentBreakdown;
  const { first, total, remaining, laterCount, laterEach } = quotePaymentSummary(quote);
  const hasLaterPayments = remaining !== null && remaining > 0;
  const deposit = initial?.depositAmount ?? quote.depositAmount ?? quote.deposit;
  const term = quote.billingMode === 'DAILY' ? `${quote.billableDays} ngày` : `${quote.termMonths} tháng`;

  return <div className="quote-breakdown booking-price">
    <section className="booking-first-payment" aria-label="Khoản thanh toán lần đầu">
      <h4>{(quote.paymentPlan === 'PREPAID' || quote.billingMode === 'DAILY') ? 'Thanh toán một lần' : 'Thanh toán lần đầu'}</h4>
      <strong className="quote-first-amount" aria-label="Số tiền thanh toán lần đầu dự kiến">{bookingMoney(first)}</strong>
      <p className="booking-quote-muted">Dự kiến · sau khi ký hợp đồng</p>
    </section>
    <dl className="booking-price-facts">
      <div><dt>Tiền cọc trong lần đầu</dt><dd>{bookingMoney(deposit)}</dd></div>
      {hasLaterPayments && <div>
        <dt>Các kỳ tiếp theo{laterCount !== null && <small>{laterCount} kỳ × {bookingMoney(laterEach)}/kỳ</small>}</dt>
        <dd>{bookingMoney(remaining)}</dd>
      </div>}
      <div><dt>Tổng dự kiến cả kỳ</dt><dd>{bookingMoney(total)}</dd></div>
    </dl>
    <details className="booking-disclosure quote-cost-details">
      <summary>Xem chi tiết giá <ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="booking-detail-sections">
        <section aria-label="Chi phí cả kỳ">
          <h5>Chi phí cả kỳ</h5>
          <dl className="booking-price-facts">
            {quote.lineItems.map((item, index) => {
              const rental = item.code === 'storage-rent';
              const basis = rental && quote.billingMode === 'MONTHLY' && quote.monthlyUnitPrice != null
                ? `${quote.quantity ?? 1} kho · ${bookingMoney(quote.monthlyUnitPrice)}/tháng · ${term}`
                : item.code === 'deposit' ? 'Theo chính sách loại kho' : item.basis;
              return <div key={`${item.code}:${index}`}>
                <dt>{serviceDisplayName(item.code, item.label)}{basis && <small>{basis}</small>}</dt>
                <dd>{bookingMoney(item.amount)}</dd>
              </div>;
            })}
          </dl>
        </section>
        {initial && <section aria-label="Các khoản trong lần đầu">
          <h5>Các khoản trong lần đầu</h5>
          <p className="booking-quote-muted">{quotePeriod(initial.periodStart, initial.periodEnd)}</p>
          <dl className="booking-price-facts">
            <div><dt>Tiền thuê</dt><dd>{bookingMoney(initial.rentalAmount)}</dd></div>
            <div><dt>Tiền cọc</dt><dd>{bookingMoney(initial.depositAmount)}</dd></div>
            {initial.purchaseAddOnAmount > 0 && <div><dt>Vật tư mua một lần</dt><dd>{bookingMoney(initial.purchaseAddOnAmount)}</dd></div>}
            {initial.rentalAddOnAmount > 0 && <div><dt>Dịch vụ thuê</dt><dd>{bookingMoney(initial.rentalAddOnAmount)}</dd></div>}
            <div><dt>Thanh toán lần đầu</dt><dd>{bookingMoney(first)}</dd></div>
          </dl>
        </section>}
      </div>
    </details>
  </div>;
}
