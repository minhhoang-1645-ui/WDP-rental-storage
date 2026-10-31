import { date, first, label, money, object, rows } from '../manager/portal-data';
import { DocumentFile } from './DocumentFile';

export function ContractRenewalHistory({ contract: value, scope }: { contract: unknown; scope: 'customer' | 'manager' | 'staff/management' }) {
  const contract = object(value), renewals = rows(contract.renewals);
  if (!renewals.length) return null;
  return <section className="customer-panel" aria-label="Lịch sử gia hạn của hợp đồng">
    <h2>Lịch sử gia hạn của hợp đồng</h2>
    <p>Hạn thuê hiện tại: <strong>{date(contract.endDate)}</strong>. Chỉ cập nhật hạn mới sau khi gia hạn được chấp thuận, phụ lục được ký và thanh toán kích hoạt được xác nhận.</p>
    {renewals.map(renewal => <article className="transfer-destination-context" key={first(renewal, 'id')}>
      <strong>{first(renewal, 'renewalCode')} · {label(renewal.status)}</strong>
      <p>Hạn cũ: <strong>{date(renewal.previousEndDate)}</strong> → Đề nghị đến: <strong>{date(renewal.requestedEndDate)}</strong> · Thêm {first(renewal, 'termMonths')} tháng</p>
      <p>Tổng tiền gia hạn của đơn thuê: <strong>{money(object(renewal.quote).totalAmount)}</strong> · {label(renewal.paymentPlan)}</p>
      <small>Gửi lúc {date(renewal.requestedAt, true)} · Người yêu cầu: {first(renewal, 'requestedBy.fullName') || 'Chưa ghi nhận'}</small>
      {Boolean(renewal.reviewedAt) && <small>Xét duyệt: {date(renewal.reviewedAt, true)} · {first(renewal, 'reviewedBy.fullName') || 'Hệ thống / hồ sơ cũ chưa ghi người duyệt'}</small>}
      {Boolean(renewal.rejectionReason) && <p>Lý do từ chối: {first(renewal, 'rejectionReason')}</p>}
      <p>{renewal.status === 'COMPLETED' ? `Đã áp dụng hạn mới${renewal.activatedAt ? ` từ ${date(renewal.activatedAt, true)}` : '; hồ sơ cũ chưa có thời điểm thanh toán kích hoạt'}.` : renewal.status === 'APPROVED_PENDING_PAYMENT' ? first(renewal, 'appendix.acceptedAt') ? 'Đã ký phụ lục; chờ xác nhận thanh toán kích hoạt. Chưa áp dụng hạn mới.' : 'Đã chấp thuận; chờ ký phụ lục và thanh toán kích hoạt. Chưa áp dụng hạn mới.' : 'Chưa áp dụng thay đổi thời hạn hợp đồng.'}</p>
      {Boolean(renewal.appendix) && <p>Phụ lục: <strong>{first(renewal, 'appendix.code')}</strong> · {first(renewal, 'appendix.acceptedAt') ? `Đã ký bởi ${first(renewal, 'appendix.acceptanceName') || 'khách hàng'} lúc ${date(first(renewal, 'appendix.acceptedAt'), true)}` : 'Chưa ký'}</p>}
      {rows(renewal.invoices).map(invoice => <p key={first(invoice, 'id')}>Hóa đơn {first(invoice, 'invoiceCode')} · {label(invoice.status)}<br />Giá trị: {money(invoice.totalAmount)} · Đã trả: {money(invoice.amountPaid)} · Còn lại: {money(invoice.balanceDue)}{invoice.paidAt ? ` · Thanh toán đủ lúc ${date(invoice.paidAt, true)}` : ''}</p>)}
      {object(renewal.appendix).available === true && <DocumentFile path={`/${scope}/documents/renewals/${encodeURIComponent(first(renewal, 'id'))}`} name={first(renewal, 'appendix.code')} signed={Boolean(first(renewal, 'appendix.acceptedAt'))} />}
    </article>)}
  </section>;
}
