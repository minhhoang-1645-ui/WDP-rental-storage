import { CopyRecordCode } from '../workspace/RecordIdentity';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import type { CustomerInvoice } from '../../types/customer';
import { CustomerStatus } from './CustomerPortalUi';
import { customerStatusLabel, formatPortalDate, moneyLabel } from './CustomerPortalHelpers';
import { InvoiceBreakdown } from './InvoiceBreakdown';
import { DocumentFile } from './DocumentFile';
import '../../styles/customer-invoice.css';

export function CustomerInvoiceDetails({ invoice }: { invoice: CustomerInvoice }) {
  const money = (value: number) => moneyLabel(value, invoice.currency);
  const unitCount = invoice.breakdown?.units.length || invoice.reservation.quantity;
  const adjustment = invoice.breakdown?.adjustmentAmount ?? invoice.chargeAmount ?? 0;

  return <div className="customer-invoice-details">
    <section aria-labelledby="customer-invoice-information">
      <div className="customer-invoice-heading">
        <h3 id="customer-invoice-information">{customerStatusLabel(invoice.type)}</h3>
        <CustomerStatus status={invoice.status} />
      </div>
      <dl className="customer-invoice-meta">
        <div><dt>Mã hóa đơn</dt><dd><CopyRecordCode value={invoice.invoiceCode} label="Hóa đơn" /></dd></div>
        <div><dt>Kho</dt><dd>{unitCount} kho{invoice.reservation.storageType?.name && ` · ${invoice.reservation.storageType.name}`}</dd></div>
        <div><dt>Ngày lập</dt><dd>{formatPortalDate(invoice.issuedAt)}</dd></div>
        <div><dt>Hạn thanh toán</dt><dd>{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</dd></div>
      </dl>
      {invoice.overduePayment && <p className="customer-inline-notice">Đã quá hạn {invoice.overduePayment.days} ngày.
        {typeof invoice.overduePayment.graceDays === 'number' && ' Số ngày cho phép quá hạn theo điều khoản: ' + invoice.overduePayment.graceDays + ' ngày.'}
        {invoice.overduePayment.withinGrace ? ' Đang trong thời gian cho phép quá hạn.' : ' Đã hết thời gian cho phép quá hạn.'}</p>}
      {invoice.status === 'VOID' && invoice.voidReason && <p className="customer-inline-notice">{invoice.voidReason}</p>}
    </section>

    {invoice.status !== 'VOID' && <div className="customer-invoice-amount">
      <span>{invoice.status === 'PAID' ? 'Đã thanh toán' : 'Còn phải trả'}</span>
      <strong>{money(invoice.status === 'PAID' ? invoice.amountPaid : invoice.balanceDue)}</strong>
      {invoice.status === 'PAID' && <small>Còn phải trả {money(invoice.balanceDue)}</small>}
    </div>}

    <section aria-labelledby="customer-invoice-lines">
      <h3 id="customer-invoice-lines">Các khoản phải trả</h3>
      <InvoiceBreakdown details={invoice.breakdown} currency={invoice.currency} />
    </section>

    <section aria-labelledby="customer-invoice-total">
      <h3 id="customer-invoice-total">Tổng thanh toán</h3>
      <dl className="customer-invoice-totals">
        <div><dt>Tiền thuê</dt><dd>{money(invoice.rentalAmount)}</dd></div>
        <div><dt>Tiền cọc</dt><dd>{money(invoice.depositAmount)}</dd></div>
        <div><dt>Dịch vụ</dt><dd>{money(invoice.serviceAmount ?? 0)}</dd></div>
        {adjustment !== 0 && <div><dt>Điều chỉnh khác</dt><dd>{money(adjustment)}</dd></div>}
        <div className="customer-invoice-total"><dt>Tổng hóa đơn</dt><dd>{money(invoice.totalAmount)}</dd></div>
        {invoice.status !== 'PAID' && <div><dt>Đã thanh toán</dt><dd>{money(invoice.amountPaid)}</dd></div>}
      </dl>
    </section>

    <DetailDisclosure title="Tệp hóa đơn">
      <DocumentFile path={`/customer/documents/invoices/${encodeURIComponent(invoice.id)}`} name={invoice.invoiceCode} signed={invoice.signing?.complete} />
    </DetailDisclosure>
  </div>;
}
