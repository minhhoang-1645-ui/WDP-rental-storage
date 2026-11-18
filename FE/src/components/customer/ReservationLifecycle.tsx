import type { ReservationRentalSummary } from '../../types/booking';
import { moneyLabel, quoteLabel } from './CustomerPortalHelpers';

export function ReservationPaymentSummary({ amount }: { amount?: number | null }) {
  return <strong className="reservation-original-price">{quoteLabel(amount)}</strong>;
}

export function ReservationLifecycle({ summary, monthlyAmount }: { summary?: ReservationRentalSummary; monthlyAmount?: number }) {
  if (!summary) return null;
  return <section className="reservation-lifecycle" aria-label="Cập nhật kỳ thuê">
    <h3>Kho và thanh toán</h3>
    <p className="lifecycle-current-unit"><strong>Kho hiện tại: </strong>{summary.currentUnits.map(unit => unit.unitCode).join(', ') || 'Chưa được cấp kho'}</p>
    <dl className="lifecycle-totals lifecycle-totals--compact">
      <div><dt>Đã thanh toán (gồm cọc)</dt><dd>{moneyLabel(summary.paymentDetails?.totalPaid ?? summary.totalPaid)}</dd></div>
      <div><dt>Tiền thuê / tháng</dt><dd>{monthlyAmount === undefined ? 'Xem hóa đơn' : moneyLabel(monthlyAmount)}</dd></div>
    </dl>
  </section>;
}
