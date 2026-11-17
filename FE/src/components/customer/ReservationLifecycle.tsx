import type { ReservationRentalSummary } from '../../types/booking';
import { formatPortalDate, moneyLabel } from './CustomerPortalHelpers';
import { RentalPaymentDetailsView, RentalPeriodCaption } from './RentalAccountDetails';

export function ReservationPaymentSummary({ summary }: { summary?: ReservationRentalSummary }) {
  const details = summary?.paymentDetails;
  return <div className="reservation-payment-summary">
    <span className="reservation-paid-total">Đã thu: <strong>{summary ? moneyLabel(details?.totalPaid ?? summary.totalPaid) : 'Chưa có dữ liệu'}</strong></span>
    <span>Chưa thanh toán: <strong>{summary ? moneyLabel(details?.totalOutstanding ?? Math.max(0, summary.totalInvoiced - summary.totalPaid)) : 'Chưa có dữ liệu'}</strong></span>
  </div>;
}

export function ReservationLifecycle({ summary }: { summary?: ReservationRentalSummary }) {
  if (!summary) return null;
  return <section className="reservation-lifecycle" aria-label="Cập nhật kỳ thuê">
    <h3>Kho và thanh toán</h3>
    <p className="lifecycle-current-unit"><strong>Kho hiện tại: </strong>{summary.currentUnits.map(unit => unit.unitCode).join(', ') || 'Chưa được cấp kho'}</p>
    <RentalPeriodCaption period={summary.rentalPeriod} />
    <dl className="lifecycle-totals lifecycle-totals--compact">
      <div><dt>Đã thu, gồm tiền cọc</dt><dd>{moneyLabel(summary.paymentDetails?.totalPaid ?? summary.totalPaid)}</dd></div>
      <div><dt>Chưa thanh toán</dt><dd>{moneyLabel(summary.paymentDetails?.totalOutstanding ?? Math.max(0, summary.totalInvoiced - summary.totalPaid))}</dd></div>
    </dl>
    <details className="lifecycle-disclosure"><summary>Xem chi tiết thanh toán và thay đổi</summary>
    {summary.paymentDetails ? <RentalPaymentDetailsView details={summary.paymentDetails} /> : <p>Đã thu gia hạn: <strong>{moneyLabel(summary.renewalPaid)}</strong>.</p>}
    {summary.renewals.length > 0 && <div className="lifecycle-events"><h4>Lịch sử gia hạn</h4>{summary.renewals.map(item => <article key={item.id}>
      <strong>Gia hạn {item.months} tháng · {item.status === 'COMPLETED' ? 'Đã hoàn tất' : item.status === 'REJECTED' ? 'Đã từ chối' : 'Đang xử lý'}</strong>
      <span>{formatPortalDate(item.previousEndDate)} – {formatPortalDate(item.endDate)}</span>
      {item.discount > 0 && <span>Trước ưu đãi: {moneyLabel(item.amount + item.discount)} · Giảm {moneyLabel(item.discount)}</span>}
      <span>Tiền gia hạn sau ưu đãi: <strong>{moneyLabel(item.amount)}</strong></span>
      <span>Đã thanh toán: <strong>{moneyLabel(item.paid)}</strong></span>{!['REJECTED', 'CANCELLED'].includes(item.status) && <span>Còn lại theo báo giá gia hạn: <strong>{moneyLabel(Math.max(0, item.amount - item.paid))}</strong></span>}<small>{item.code}</small>
    </article>)}</div>}
    {summary.transfers.length > 0 && <div className="lifecycle-events"><h4>Lịch sử chuyển kho</h4>{summary.transfers.map(item => <article key={item.id}>
      <strong>{item.from} → {item.to}</strong><span>Hoàn tất {formatPortalDate(item.completedAt ?? '', true)}</span>
      <small>{item.handoverReport ? 'Đã ghi nhận thu chìa khóa kho cũ và bàn giao chìa khóa kho mới.' : 'Hồ sơ cũ chưa có biên nhận đổi chìa khóa; liên hệ nhân viên để đối chiếu.'}</small>
      <small>{item.code}</small>
    </article>)}</div>}
    {!summary.renewals.length && !summary.transfers.length && <p>Chưa có gia hạn hoặc chuyển kho.</p>}
    </details>
  </section>;
}
