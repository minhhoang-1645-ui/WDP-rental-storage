import type { RentalPaymentDetails, RentalPeriodSummary, RentalInvoiceLine } from '../../types/rental-account';
import { formatPortalDate, moneyLabel } from './CustomerPortalHelpers';

export function RentalPeriodCaption({ period }: { period?: RentalPeriodSummary }) {
  if (!period) return null;
  return <small className="rental-period-caption">{period.originalMonths === null ? 'Kỳ thuê ban đầu theo ngày' : `${period.originalMonths} tháng ban đầu`}{period.extendedMonths > 0 ? ` + ${period.extendedMonths} tháng gia hạn${period.totalMonths === null ? '' : ` = ${period.totalMonths} tháng`}` : ' · Chưa gia hạn'}</small>;
}

export function RentalPeriodDetails({ period }: { period: RentalPeriodSummary }) {
  return <div className="rental-period-details">
    <RentalPeriodCaption period={period} />
    <dl className="customer-facts">
      <div><dt>Kỳ thuê ban đầu{period.originalMonths !== null ? ` · ${period.originalMonths} tháng` : ''}</dt><dd>{formatPortalDate(period.originalStartDate)} – {formatPortalDate(period.originalEndDate)}</dd></div>
      <div><dt>Gia hạn đã hoàn tất</dt><dd>{period.extendedMonths ? `${period.extendedMonths} tháng` : 'Chưa gia hạn'}</dd></div>
      <div><dt>Toàn bộ thời gian thuê hiện tại{period.totalMonths !== null ? ` · ${period.totalMonths} tháng` : ''}</dt><dd>{formatPortalDate(period.currentStartDate)} – {formatPortalDate(period.currentEndDate)}</dd></div>
    </dl>
    <p className="customer-note">Thời gian thuê hiện tại đã bao gồm các lần gia hạn hoàn tất.</p>
  </div>;
}

const invoiceTitle = (invoice: RentalInvoiceLine) => invoice.type === 'INITIAL' ? 'Hóa đơn lần đầu' : invoice.type === 'RECURRING' ? 'Tiền thuê kỳ tiếp theo của đơn ban đầu' : invoice.type === 'RENEWAL' ? 'Hóa đơn gia hạn' : 'Phí quyết toán';

export function RentalPaymentDetailsView({ details }: { details?: RentalPaymentDetails }) {
  if (!details) return null;
  return <section className="rental-account-details" aria-label="Chi tiết các khoản thanh toán">
    <h3>Đã thu và các khoản còn lại</h3>
    <dl className="lifecycle-totals">
      <div><dt>Tổng đã thu, gồm tiền cọc</dt><dd>{moneyLabel(details.totalPaid)}</dd></div>
      <div><dt>Còn lại theo hóa đơn</dt><dd>{moneyLabel(details.totalOutstanding)}</dd></div>
      <div><dt>Tổng giá trị đã lập hóa đơn</dt><dd>{moneyLabel(details.totalInvoiced)}</dd></div>
    </dl>
    {details.groups.length === 0 ? <p>Chưa có hóa đơn hoặc giao dịch thanh toán được ghi nhận cho đơn này.</p> : details.groups.map(group => <section className="rental-account-group" key={group.type} aria-label={group.title}>
      <header><h4>{group.title}</h4><p>Đã thu <strong>{moneyLabel(group.paid)}</strong> · Còn lại <strong>{moneyLabel(group.balance)}</strong></p></header>
      <ul>{group.invoices.map((invoice, index) => <li key={invoice.id || index}>
        <div className="rental-invoice-description"><strong>{invoiceTitle(invoice)}</strong>
          {invoice.periodStart && invoice.periodEnd && <span>Kỳ: {formatPortalDate(invoice.periodStart)} – {formatPortalDate(invoice.periodEnd)}</span>}
          <span className="rental-invoice-components">Hóa đơn gồm: {[
            invoice.rental > 0 ? `tiền thuê ${moneyLabel(invoice.rental)}` : '',
            invoice.deposit > 0 ? `tiền cọc ${moneyLabel(invoice.deposit)}` : '',
            invoice.services > 0 ? `dịch vụ ${moneyLabel(invoice.services)}` : '',
            invoice.charges > 0 ? `phí được duyệt ${moneyLabel(invoice.charges)}` : '',
          ].filter(Boolean).join(' + ') || moneyLabel(invoice.total)}</span>
          <small>{invoice.code}</small>
        </div>
        <dl className="rental-invoice-amounts"><div><dt>Thành tiền</dt><dd>{moneyLabel(invoice.total)}</dd></div><div><dt>Đã thu</dt><dd>{moneyLabel(invoice.paid)}</dd></div><div><dt>Còn lại</dt><dd>{moneyLabel(invoice.balance)}</dd></div></dl>
        <p className={`rental-invoice-due${invoice.dueState === 'OVERDUE' && invoice.balance > 0 ? ' is-overdue' : ''}`}>
          {invoice.balance === 0 ? 'Đã thanh toán đủ hóa đơn này' : invoice.dueAt ? `${invoice.dueState === 'UPCOMING' ? 'Chưa đến hạn' : invoice.dueState === 'OVERDUE' ? 'Đã quá hạn' : 'Đến hạn hôm nay'} · Hạn thanh toán ${formatPortalDate(invoice.dueAt)}` : 'Chưa thanh toán đủ · Xem hóa đơn để kiểm tra hạn thanh toán'}
        </p>
      </li>)}</ul>
    </section>)}
    <p className="customer-note">Các khoản còn lại được ghi riêng theo từng hóa đơn; thanh toán gia hạn không thay thế tiền thuê còn thiếu của kỳ ban đầu. Ngày kết thúc mỗi kỳ không được tính thêm tiền thuê.</p>
  </section>;
}
