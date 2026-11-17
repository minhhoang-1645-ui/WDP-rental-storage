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

const invoiceTitle = (invoice: RentalInvoiceLine) => invoice.type === 'INITIAL' ? 'Kỳ đầu' : invoice.type === 'RECURRING' ? 'Tiền thuê' : invoice.type === 'RENEWAL' ? 'Gia hạn' : 'Phí quyết toán';
const groupTitle = (type: string, title: string) => ({ INITIAL: 'Kỳ đầu (gồm cọc)', RECURRING: 'Các kỳ tiếp theo', RENEWAL: 'Gia hạn' })[type] ?? title;

export function RentalPaymentDetailsView({ details }: { details?: RentalPaymentDetails }) {
  if (!details) return null;
  return <section className="rental-account-details" aria-label="Chi tiết các khoản thanh toán">
    <h3>Thanh toán</h3>
    <dl className="lifecycle-totals lifecycle-totals--compact">
      <div><dt>Đã thu (gồm cọc)</dt><dd>{moneyLabel(details.totalPaid)}</dd></div>
      <div><dt>Chưa thanh toán</dt><dd>{moneyLabel(details.totalOutstanding)}</dd></div>
    </dl>
    {details.groups.length === 0 ? <p>Chưa có hóa đơn hoặc giao dịch thanh toán được ghi nhận cho đơn này.</p> : details.groups.map(group => <section className="rental-account-group" key={group.type} aria-label={group.title}>
      <details className="rental-account-group-disclosure"><summary><strong>{groupTitle(group.type, group.title)}</strong><span>Đã thu <b>{moneyLabel(group.paid)}</b> · Chưa thanh toán <b>{moneyLabel(group.balance)}</b></span></summary>
      <ul>{group.invoices.map((invoice, index) => <li key={invoice.id || index}>
        <div className="rental-invoice-description"><strong>{invoiceTitle(invoice)}</strong>
          {invoice.periodStart && invoice.periodEnd && <span>Kỳ: {formatPortalDate(invoice.periodStart)} – {formatPortalDate(invoice.periodEnd)}</span>}
          <span className="rental-invoice-components">{[
            invoice.rental > 0 ? `tiền thuê ${moneyLabel(invoice.rental)}` : '',
            invoice.deposit > 0 ? `tiền cọc ${moneyLabel(invoice.deposit)}` : '',
            invoice.services > 0 ? `dịch vụ ${moneyLabel(invoice.services)}` : '',
            invoice.charges > 0 ? `phí ${moneyLabel(invoice.charges)}` : '',
          ].filter(Boolean).join(' + ') || moneyLabel(invoice.total)}</span>
          <small>{invoice.code}</small>
        </div>
        <dl className="rental-invoice-amounts"><div><dt>Đã thu</dt><dd>{moneyLabel(invoice.paid)}</dd></div><div><dt>Chưa thanh toán</dt><dd>{moneyLabel(invoice.balance)}</dd></div></dl>
        {invoice.balance > 0 && <p className={`rental-invoice-due${invoice.dueState === 'OVERDUE' ? ' is-overdue' : ''}`}>
          {invoice.dueAt ? `${invoice.dueState === 'UPCOMING' ? 'Chưa đến hạn' : invoice.dueState === 'OVERDUE' ? 'Quá hạn' : 'Đến hạn'} · ${formatPortalDate(invoice.dueAt)}` : 'Xem hóa đơn để kiểm tra hạn thanh toán'}
        </p>}
      </li>)}</ul></details>
    </section>)}
  </section>;
}
