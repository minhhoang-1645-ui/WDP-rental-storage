import { InvoiceBreakdown } from '../../components/customer/InvoiceBreakdown';
import { first, money, object, rows, type Row } from '../../components/manager/portal-data';
import { Facts, Status } from '../../components/manager/PortalUi';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import type { CustomerInvoice } from '../../types/customer';
import { quotePaymentSummary } from '../../utils/quote-payment-summary';

export type ReservationInvoice = {
  code: string;
  status: string;
  total: number;
  paid: number;
  balance: number;
  currency: string;
  breakdown: CustomerInvoice['breakdown'];
};

export function StaffReservationPayment({ row, invoice }: { row: Row; invoice?: ReservationInvoice | null }) {
  const quote = object(row.quote);
  const initial = object(quote.initialPaymentBreakdown);
  const summary = quotePaymentSummary(quote);
  const rent = quote.rentalAmount ?? quote.rentalSubtotal;
  const deposit = quote.depositAmount ?? quote.deposit;
  const term = quote.billingMode === 'DAILY' && first(quote, 'billableDays') ? `${first(quote, 'billableDays')} ngày`
    : first(quote, 'termMonths') || first(row, 'durationMonths') ? `${first(quote, 'termMonths') || first(row, 'durationMonths')} tháng` : '';
  const services = rows(quote.services);
  const hasQuote = summary.total !== null || typeof rent === 'number' || typeof deposit === 'number';
  const isVoided = invoice?.status === 'VOID';
  const showPartialAmounts = invoice && !isVoided && (invoice.status === 'PARTIALLY_PAID' || invoice.paid > 0 && invoice.balance > 0);
  const invoiceStatus = invoice?.status === 'OPEN' ? 'Chưa thanh toán' : isVoided ? 'Đã hủy hóa đơn' : undefined;
  const firstDue = summary.first ?? (typeof initial.totalAmount === 'number' ? initial.totalAmount : null);
  const quantity = Number(row.quantity);
  const averageDeposit = typeof deposit === 'number' && quantity > 1 && Number.isSafeInteger(deposit / quantity) ? deposit / quantity : null;

  return <section className="manager-section" id="reservation-payment" aria-labelledby="reservation-payment-title">
    <h2 id="reservation-payment-title">Thanh toán</h2>
    {invoice && <div className="staff-booking-payment-status"><strong>{invoice.code}</strong><Status value={invoice.status} text={invoiceStatus} /></div>}
    {!hasQuote && !invoice ? <p>Chưa có số liệu thanh toán.</p> : <dl className="staff-booking-facts staff-booking-amounts">
      {(invoice || firstDue !== null) && <div>
        <dt>{invoice ? 'Hóa đơn ban đầu' : 'Thanh toán lần đầu dự kiến'}</dt>
        <dd>{money(invoice?.total ?? firstDue)}</dd>
      </div>}
      {typeof rent === 'number' && <div><dt>Tiền thuê cả kỳ{term && ` · ${term}`}</dt><dd>{money(rent)}</dd></div>}
      {typeof deposit === 'number' && <div><dt>Tiền cọc</dt><dd>{money(deposit)}</dd></div>}
      {summary.total !== null && <div><dt>Tổng dự kiến gồm cọc</dt><dd>{money(summary.total)}</dd></div>}
      {showPartialAmounts && <><div><dt>Đã thanh toán</dt><dd>{money(invoice.paid)}</dd></div>
        <div><dt>Còn phải trả kỳ đầu</dt><dd>{money(invoice.balance)}</dd></div></>}
      {typeof quote.paymentPlan === 'string' && <div><dt>Hình thức thanh toán</dt><dd>{summary.plan}</dd></div>}
    </dl>}
    {(hasQuote || invoice) && <DetailDisclosure title="Xem cách tính">
      <Facts items={[
        ['Số lượng kho', first(row, 'quantity')],
        ...(term ? [['Thời hạn', term] as [string, string]] : []),
        ...(quote.billingMode === 'DAILY' && first(quote, 'dailyUnitPrice')
          ? [['Đơn giá kho / ngày', money(Number(quote.dailyUnitPrice))] as [string, string]]
          : typeof quote.monthlyUnitPrice === 'number' ? [['Đơn giá kho / tháng', money(quote.monthlyUnitPrice)] as [string, string]] : []),
        ...(typeof quote.discountAmount === 'number' && quote.discountAmount > 0 ? [['Giảm giá', money(quote.discountAmount)] as [string, string]] : []),
        ...(!invoice?.breakdown && averageDeposit !== null ? [['Cọc bình quân mỗi kho theo báo giá', money(averageDeposit)] as [string, string]] : []),
        ...(summary.remaining !== null && summary.remaining > 0 ? [['Các kỳ tiếp theo (dự kiến)', summary.laterCount !== null
          ? `${summary.laterCount} kỳ × ${money(summary.laterEach)}` : money(summary.remaining)] as [string, string]] : []),
        ...(!invoice && typeof initial.rentalAmount === 'number' ? [['Tiền thuê kỳ đầu dự kiến', money(initial.rentalAmount)] as [string, string]] : []),
      ]} />
      {invoice?.breakdown && <InvoiceBreakdown details={invoice.breakdown} currency={invoice.currency} />}
      {services.length > 0 && (!invoice?.breakdown || summary.monthly) && <section aria-label="Dịch vụ theo báo giá">
        <h3>Dịch vụ theo báo giá cả kỳ</h3>
        <ul className="staff-booking-service-lines">{services.map(item => <li key={first(item, 'serviceId', 'code')}>
          <span>{first(item, 'name')} × {first(item, 'quantity')}</span><strong>{money(item.amount)}</strong>
        </li>)}</ul>
      </section>}
      {invoice && !invoice.breakdown && <p>Hóa đơn này chỉ có số tiền tổng hợp theo chứng từ đã lưu.</p>}
    </DetailDisclosure>}
  </section>;
}
