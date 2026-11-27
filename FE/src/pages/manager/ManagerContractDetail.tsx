import type { ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Download, ExternalLink, Eye, FileText, History, Layers, List, Mail, Phone, Printer, ReceiptText, RefreshCw, User, Warehouse } from 'lucide-react';
import { useDocumentFile } from '../../components/customer/useDocumentFile';
import { OperationsLink as Link } from '../../components/manager/OperationsLink';
import { ManagerContractQuote } from '../../components/manager/ManagerPricingExplanation';
import { LoadState, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { at, code, customer, date, first, label, money, object, rows, type Row } from '../../components/manager/portal-data';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { transferLocation } from '../../utils/transfer-request';
import './manager-contract-detail.css';

type Props = {
  row: Row; id: string; returnPath: string; timeline: { key: string; label: string; value: string }[];
  refresh: () => void; refreshing: boolean; error: string; children?: ReactNode;
};
type Fact = [typeof User, string, ReactNode];

function ContractFacts({ items }: { items: Fact[] }) {
  return <dl className="contract-facts">{items.map(([Icon, title, value]) => <div key={title}>
    <dt><Icon size={16} aria-hidden="true" />{title}</dt><dd>{value || 'Chưa cập nhật'}</dd>
  </div>)}</dl>;
}

export function ManagerContractDetail({ row, id, returnPath, timeline, refresh, refreshing, error, children }: Props) {
  const person = customer(row);
  const email = first(person, 'email'), phone = first(person, 'phone', 'phoneNumber');
  const reservation = object(row.reservation);
  const reservationId = first(reservation, 'id');
  const reference = first(reservation, 'reference') || first(row, 'reservationReference');
  const units = rows(row.storageUnits);
  const unit = object(row.storageUnit ?? row.unit);
  const relatedUnits = units.length ? units : Object.keys(unit).length ? [unit] : [];
  const unitNames = relatedUnits.map(item => first(item, 'unitCode', 'unitNumber')).filter(Boolean).join(', ');
  const contractCode = code(row);
  const orderQuote = object(row.reservationPricing ?? reservation.quoteSnapshot);
  const orderScope = Object.keys(orderQuote).length > 0;
  const quote = orderScope ? orderQuote : object(row.quote ?? row.quoteSnapshot);
  const duration = quote.billingMode === 'DAILY' ? quote.billableDays : quote.termMonths;
  const billingPlan = quote.paymentPlan ?? row.paymentPlan;
  const period = [
    typeof duration === 'number' && duration > 0 ? duration + (quote.billingMode === 'DAILY' ? ' ngày' : ' tháng') : '',
    billingPlan === 'PREPAID' ? 'Trả trước toàn kỳ' : billingPlan ? label(billingPlan) : '',
  ].filter(Boolean).join(' · ');
  const lease = [row.startDate && date(row.startDate), row.endDate && date(row.endDate)].filter(Boolean).join(' – ');
  const signed = Boolean(first(row, 'terms.acceptedAt'));
  const pdf = useDocumentFile('/manager/documents/contracts/' + encodeURIComponent(id), contractCode);
  const invoices = rows(row.invoices ?? at(row, 'billingSummary.invoices'));
  const size = typeof reservation.quantity === 'number' ? reservation.quantity + ' kho' : '';
  const facility = first(reservation, 'facility.name');
  const unitLink = (item: Row) => first(item, 'id')
    ? <Link to={'/manager/units/' + encodeURIComponent(first(item, 'id'))}>{first(item, 'unitCode', 'unitNumber') || 'Xem kho'}</Link>
    : first(item, 'unitCode', 'unitNumber') || 'Chưa cập nhật';

  return <section className="contract-dashboard record-detail-page">
    <header className="contract-header">
      <div><nav className="contract-breadcrumb" aria-label="Đường dẫn hợp đồng"><Link to={returnPath}><ArrowLeft size={16} /> Hợp đồng</Link><span aria-hidden="true">/</span><span aria-current="page">Chi tiết hợp đồng</span></nav>
        <div className="contract-title"><h1>Hợp đồng thuê kho{unitNames ? ' – ' + unitNames : ''}</h1>{Boolean(row.status) && <Status value={row.status} />}</div>
        <CopyRecordCode value={contractCode} label="Mã hợp đồng" />
      </div>
      <div className="contract-header-actions"><button className="button-secondary" onClick={() => window.print()}><Printer size={16} /> In hồ sơ</button>
        <button className="button-secondary" disabled={refreshing} aria-label="Làm mới hồ sơ" onClick={refresh}><RefreshCw size={16} /></button><RefreshStatus active={refreshing} /></div>
    </header>
    {error && <LoadState loading={false} error={error} retry={refresh} />}
    <dl className="contract-card contract-overview">
      <div><Warehouse size={26} /><div><dt>Kho thuê</dt><dd>{unitNames || 'Chưa cập nhật'}</dd></div></div>
      <div><CalendarDays size={26} /><div><dt>Thời hạn thuê</dt><dd>{lease || 'Chưa cập nhật'}</dd></div></div>
      <div><Layers size={26} /><div><dt>Kỳ thuê</dt><dd>{period || 'Chưa cập nhật'}</dd></div></div>
    </dl>
    <div className="contract-grid">
      <div className="contract-column">
        <section className="contract-card"><h2><FileText size={19} /> Thông tin hợp đồng</h2>
          <ContractFacts items={[[User, 'Khách hàng', first(person, 'fullName', 'name')], [Mail, 'Email', email && <a key="email" href={'mailto:' + email}>{email}</a>], [Phone, 'Điện thoại', phone && <a key="phone" href={'tel:' + phone}>{phone}</a>]]} />
          <ContractFacts items={[
            [CalendarDays, 'Mã đặt kho', reservationId ? <Link key="reservation" to={'/manager/reservations/' + encodeURIComponent(reservationId)}>{reference || reservationId}</Link> : reference],
            [Layers, 'Loại kho', first(row, 'storageType.name', 'storageUnit.storageType.name')],
            [List, 'Số lượng kho của đơn', size],
          ]} />
        </section>
        <section className="contract-card"><h2><Warehouse size={19} /> Thông tin kho</h2>
          {relatedUnits.length ? relatedUnits.map(item => <dl className="contract-unit" key={first(item, 'id', 'unitCode', 'unitNumber')}>
            <div><dt>Mã kho</dt><dd>{unitLink(item)}</dd></div>
            <div><dt>Tình trạng kho</dt><dd>{item.physicalStatus || item.status ? <Status value={item.physicalStatus ?? item.status} /> : 'Chưa cập nhật'}</dd></div>
            <div><dt>Vị trí</dt><dd>{transferLocation(item) || 'Chưa cập nhật'}{facility && <small>{facility}</small>}</dd></div>
          </dl>) : <p className="contract-muted">Chưa có thông tin kho của hợp đồng.</p>}
        </section>
        <section className="contract-card"><h2><ReceiptText size={19} /> Hóa đơn theo kỳ</h2>
          {reference ? <Link className="contract-inline-link" to={'/manager/operations/invoices?' + new URLSearchParams({ search: reference })}>Xem hóa đơn của đơn đặt kho <ExternalLink size={14} /></Link>
            : !invoices.length && <p className="contract-muted">Chưa có hóa đơn liên quan.</p>}
          {!!invoices.length && <ul className="contract-invoices">{invoices.map(invoice => <li key={first(invoice, 'id', 'invoiceCode')}>
            <Link to={'/manager/operations/invoices/' + encodeURIComponent(first(invoice, 'id', 'invoiceCode'))}>{first(invoice, 'invoiceCode')}</Link>
            {invoice.billingPeriodStart && invoice.billingPeriodEnd ? <span>{date(invoice.billingPeriodStart)} – {date(invoice.billingPeriodEnd)}</span> : null}
            {typeof invoice.totalAmount === 'number' && <strong>{money(invoice.totalAmount)}</strong>}<Status value={invoice.status} />
          </li>)}</ul>}
        </section>
      </div>
      <aside className="contract-column contract-side">
        <section className="contract-card contract-document"><h2><FileText size={19} /> Tài liệu hợp đồng</h2>
          <div className="contract-file"><FileText size={28} /><div><strong>{contractCode}.pdf</strong><small>{signed ? 'Bản đã ký · PDF' : 'Bản chưa ký · PDF'}</small></div></div>
          <div className="contract-file-actions">
            <button className="button-secondary contract-pdf-view" disabled={pdf.busy} onClick={() => void pdf.open(false)}><Eye size={16} /> Xem / in PDF</button>
            <button className="button-secondary" disabled={pdf.busy} onClick={() => void pdf.open(true)}><Download size={16} /> Tải PDF</button>
          </div>
          {pdf.busy && <p role="status" className="contract-muted">Đang tải tài liệu…</p>}
          {pdf.error && <p role="alert" className="portal-error">{pdf.error}</p>}
        </section>
        {Object.keys(quote).length > 0 && <ManagerContractQuote quote={quote} orderScope={orderScope} />}
      </aside>
    </div>
    <DetailDisclosure title={<><History size={18} /> Lịch sử xử lý</>}>
      {timeline.length ? <ol className="contract-history">{timeline.map(event => <li key={event.key}>
        <strong>{event.label}</strong><time dateTime={event.value}>{date(event.value, true)}</time>
      </li>)}</ol> : <p className="contract-muted">Chưa có lịch sử xử lý.</p>}
      {children}
    </DetailDisclosure>
  </section>;
}
