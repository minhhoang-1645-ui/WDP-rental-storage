import type { ReservationRentalSummary } from '../../types/booking';
import { formatPortalDate, moneyLabel } from './CustomerPortalHelpers';

export function ReservationPaymentSummary({ summary, original }: { summary?: ReservationRentalSummary; original: number | null }) {
  return <div className="reservation-payment-summary">
    <span>Ban đầu: <strong>{original === null ? 'Chưa có báo giá' : moneyLabel(original)}</strong></span>
    {summary && summary.renewals.length > 0 && <>
      <span>Gia hạn đã thu: <strong>{moneyLabel(summary.renewalPaid)}</strong></span>
      <span className="reservation-paid-total">Tổng đã thu: <strong>{moneyLabel(summary.totalPaid)}</strong></span>
      <small>Tổng đã thu gồm tiền cọc, nếu có.</small>
    </>}
  </div>;
}

export function ReservationLifecycle({ summary }: { summary?: ReservationRentalSummary }) {
  if (!summary) return null;
  return <section className="reservation-lifecycle" aria-label="Cập nhật kỳ thuê">
    <h3>Kho hiện tại và các lần thay đổi</h3>
    <p><strong>Kho theo hợp đồng hiện tại: </strong>{summary.currentUnits.map(unit => unit.unitCode).join(', ') || 'Chưa được cấp kho'}</p>
    <dl className="lifecycle-totals">
      <div><dt>Tổng hóa đơn có hiệu lực</dt><dd>{moneyLabel(summary.totalInvoiced)}</dd></div>
      <div><dt>Đã thanh toán gia hạn</dt><dd>{moneyLabel(summary.renewalPaid)}</dd></div>
      <div><dt>Tổng đã thanh toán, gồm cọc</dt><dd>{moneyLabel(summary.totalPaid)}</dd></div>
    </dl>
    {summary.renewals.length > 0 && <div className="lifecycle-events"><h4>Lịch sử gia hạn</h4>{summary.renewals.map(item => <article key={item.id}>
      <strong>Gia hạn {item.months} tháng · {item.status === 'COMPLETED' ? 'Đã hoàn tất' : item.status === 'REJECTED' ? 'Đã từ chối' : 'Đang xử lý'}</strong>
      <span>{formatPortalDate(item.previousEndDate)} – {formatPortalDate(item.endDate)}</span>
      {item.discount > 0 && <span>Trước ưu đãi: {moneyLabel(item.amount + item.discount)} · Giảm {moneyLabel(item.discount)}</span>}
      <span>Tiền gia hạn sau ưu đãi: <strong>{moneyLabel(item.amount)}</strong></span>
      <span>Đã thanh toán: <strong>{moneyLabel(item.paid)}</strong></span><small>{item.code}</small>
    </article>)}</div>}
    {summary.transfers.length > 0 && <div className="lifecycle-events"><h4>Lịch sử chuyển kho</h4>{summary.transfers.map(item => <article key={item.id}>
      <strong>{item.from} → {item.to}</strong><span>Hoàn tất {formatPortalDate(item.completedAt ?? '', true)}</span>
      <small>{item.handoverReport ? 'Đã ghi nhận thu chìa khóa kho cũ và bàn giao chìa khóa kho mới.' : 'Hồ sơ cũ chưa có biên nhận đổi chìa khóa; liên hệ nhân viên để đối chiếu.'}</small>
      <small>{item.code}</small>
    </article>)}</div>}
  </section>;
}
