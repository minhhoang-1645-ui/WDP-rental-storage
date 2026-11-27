import { useId, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, BarChart3, Box, CalendarDays, CircleCheck, Clock3, CreditCard,
  Database, Download, Eye, FileText, Home, Info, Layers, LayoutGrid, Printer, RefreshCw, Users, Wallet,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentFile } from '../../components/customer/useDocumentFile';
import { InvoiceBreakdown } from '../../components/customer/InvoiceBreakdown';
import { ManagerFinanceReview } from '../../components/manager/ManagerFinanceReview';
import { OperationsLink as Link } from '../../components/manager/OperationsLink';
import { RefreshStatus, Status } from '../../components/manager/PortalUi';
import { code, customer, date, first, label, money, object, rows, type Row } from '../../components/manager/portal-data';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { hasDraft } from '../../services/live-events';
import type { CustomerInvoice } from '../../types/customer';
import { ManagerActions } from './ManagerActions';
import './manager-invoice-detail.css';

const tabs = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutGrid },
  { key: 'payments', label: 'Khoản thu', icon: Database },
  { key: 'transactions', label: 'Giao dịch', icon: ArrowLeftRight },
  { key: 'history', label: 'Nhật ký', icon: Clock3 },
] as const;
type Tab = typeof tabs[number]['key'];
type Event = { key: string; label: string; value: string; detail?: string };
type InvoiceProps = {
  row: Row; id: string; returnPath: string; timeline: Event[]; canRecord: boolean;
  refresh: () => void; refreshing: boolean; notice: string; onNotice: (text: string) => void;
};

function Heading({ icon: Icon, children }: { icon: typeof Box; children: ReactNode }) {
  return <h2 className="invoice-dashboard-heading"><span><Icon size={18} aria-hidden="true" /></span>{children}</h2>;
}

export function ManagerInvoiceDetail({ row, id, returnPath, timeline, canRecord, refresh, refreshing, notice, onNotice }: InvoiceProps) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => params.has('review') ? 'transactions' : 'overview');
  const activeTab = params.has('review') && params.has('record') ? 'transactions' : tab;
  const [visitedTransactions, setVisitedTransactions] = useState(tab === 'transactions');
  const [financeRevision, setFinanceRevision] = useState(0);
  const tabId = useId();
  const invoiceCode = code(row);
  const file = useDocumentFile(`/manager/documents/invoices/${encodeURIComponent(id)}`, invoiceCode);
  const contracts = rows(row.contracts);
  const payments = rows(row.payments);
  const breakdown = row.breakdown as CustomerInvoice['breakdown'];
  const units = [...new Set((breakdown?.units?.length ? breakdown.units.map(unit => unit.unitCode) :
    contracts.map(contract => first(contract, 'storageUnit.unitCode', 'unit.unitCode', 'unitCode'))).filter(Boolean))];
  const person = customer(row);
  const reservation = object(row.reservation);
  const reference = first(reservation, 'reference');
  const total = row.totalAmount;
  const paid = row.amountPaid;
  const percent = typeof total === 'number' && Number.isFinite(total) && total > 0 &&
    typeof paid === 'number' && Number.isFinite(paid) ? Math.round(Math.max(0, Math.min(1, paid / total)) * 100) : 0;

  function selectTab(next: Tab) {
    setTab(next);
    if (next === 'transactions') setVisitedTransactions(true);
    else if (params.has('record')) setParams(previous => {
      const nextParams = new URLSearchParams(previous);
      nextParams.delete('record');
      return nextParams;
    }, { replace: true, preventScrollReset: true });
  }

  function refreshAll() {
    refresh();
    setFinanceRevision(value => value + 1);
  }

  const period = [date(row.billingPeriodStart), date(row.billingPeriodEnd)].filter(value => value !== '—').join(' – ');
  const bookingDeadline = row.type === 'INITIAL' ? first(reservation, 'expiresAt') : '';
  const overdue = object(row.overduePayment);
  const events: Event[] = [...timeline, ...([['issuedAt', 'Phát hành hóa đơn'], ['voidedAt', 'Hủy hóa đơn']] as const)
    .flatMap(([key, label]) => first(row, key) ? [{ key, label, value: first(row, key) }] : []),
  ...payments.flatMap(payment => first(payment, 'receivedAt') ? [{
    key: 'payment-' + first(payment, 'id', 'paymentCode'), label: 'Ghi nhận khoản thu',
    value: first(payment, 'receivedAt'), detail: [first(payment, 'recordedBy.fullName'), money(payment.amount)].filter(Boolean).join(' · '),
  }] : [])]
    .sort((a, b) => Date.parse(b.value) - Date.parse(a.value));
  const metrics = [
    { label: 'Tổng hóa đơn', value: total, icon: Layers, style: 'total' },
    { label: 'Đã thu', value: paid, icon: CircleCheck, style: 'paid' },
    { label: 'Còn phải thu', value: row.balanceDue, icon: Wallet, style: Number(row.balanceDue) > 0 ? 'due' : 'settled' },
  ];

  return <section className="invoice-dashboard record-detail-page">
    <nav className="invoice-dashboard-breadcrumb" aria-label="Đường dẫn hóa đơn">
      <Link to={returnPath}><Home size={16} aria-hidden="true" />Hóa đơn</Link>
      <span aria-hidden="true">/</span><span aria-current="page">{units.length === 1 ? units[0] : invoiceCode}</span>
    </nav>
    <header className="invoice-dashboard-header">
      <div>
        <div className="invoice-dashboard-title"><h1>Hóa đơn{units.length === 1 ? ` – ${units[0]}` : units.length > 1 ? ` – ${units.length} kho` : ''}</h1><Status value={row.status} /></div>
        <div className="invoice-dashboard-code"><CopyRecordCode value={invoiceCode} label="Mã hóa đơn" /></div>
      </div>
      <div className="invoice-dashboard-actions">
        <button type="button" className="button-secondary" disabled={file.busy} onClick={() => void file.open(false)}><FileText size={16} />Xem PDF</button>
        <button type="button" className="button-secondary" disabled={file.busy} onClick={() => void file.open(true)}><Download size={16} />Tải PDF</button>
        <button type="button" className="button-primary" onClick={() => window.print()}><Printer size={16} />In hóa đơn</button>
        <button type="button" className="button-secondary" title="Làm mới hóa đơn" aria-label="Làm mới hóa đơn" disabled={refreshing} onClick={() => {
          if (hasDraft()) { onNotice('Hãy lưu hoặc xóa nội dung đang nhập trước khi làm mới hóa đơn.'); return; }
          onNotice(''); refreshAll();
        }}><RefreshCw size={17} /></button>
      </div>
    </header>
    <RefreshStatus active={refreshing} />
    {notice && <p className="portal-success" role="status">{notice}</p>}
    {file.error && <p className="portal-error" role="alert">{file.error}</p>}
    <dl className="invoice-dashboard-metrics">
      {metrics.map(({ label, value, icon: Icon, style }) => <div className={`invoice-dashboard-card invoice-metric is-${style}`} key={label}>
        <span className="invoice-metric-icon"><Icon size={26} aria-hidden="true" /></span><div><dt>{label}</dt><dd>{money(value)}</dd></div>
      </div>)}
    </dl>
    <div className="invoice-dashboard-grid">
      <div className="invoice-dashboard-column">
        <section className="invoice-dashboard-card">
          <Heading icon={Users}>Khách hàng & thuê kho</Heading>
          <div className="invoice-paired">
            <dl className="invoice-dashboard-facts">
              <div><dt>Khách hàng</dt><dd>{first(person, 'fullName') || '—'}</dd></div>
              {first(person, 'email') && <div><dt>Email</dt><dd><a href={`mailto:${first(person, 'email')}`}>{first(person, 'email')}</a></dd></div>}
              {first(person, 'phone') && <div><dt>Số điện thoại</dt><dd><a href={`tel:${first(person, 'phone')}`}>{first(person, 'phone')}</a></dd></div>}
            </dl>
            <dl className="invoice-dashboard-facts">
              {units.length > 0 && <div><dt>Kho</dt><dd>{units.map(unit => {
                const unitId = first(contracts.find(contract => first(contract, 'storageUnit.unitCode', 'unit.unitCode', 'unitCode') === unit) ?? {}, 'storageUnit.id', 'unit.id');
                return unitId ? <Link key={unit} to={`/manager/units/${encodeURIComponent(unitId)}`}>{unit}</Link> : <span key={unit}>{unit}</span>;
              })}</dd></div>}
              {reference && <div><dt>Đơn đặt kho</dt><dd><Link to={`/manager/reservations/${encodeURIComponent(reference)}`}>{reference}</Link></dd></div>}
              {first(reservation, 'storageType.name') && <div><dt>Loại kho</dt><dd>{first(reservation, 'storageType.name')}</dd></div>}
              {first(reservation, 'quantity') && <div><dt>Số lượng</dt><dd>{first(reservation, 'quantity')} kho</dd></div>}
              {first(reservation, 'facility.name') && <div><dt>Cơ sở</dt><dd>{first(reservation, 'facility.name')}</dd></div>}
              {contracts.length === 1 && <div><dt>Hợp đồng</dt><dd><Link to={`/manager/operations/contracts/${encodeURIComponent(first(contracts[0], 'id', 'contractCode'))}`}>{first(contracts[0], 'contractCode')}</Link> <Status value={contracts[0].status} /></dd></div>}
            </dl>
          </div>
        </section>
        <div className="invoice-dashboard-tabs" role="tablist" aria-label="Nội dung hóa đơn">
          {tabs.map(({ key, label, icon: Icon }, index) => <button type="button" key={key} role="tab" id={`${tabId}-${key}-tab`}
            aria-selected={activeTab === key} aria-controls={`${tabId}-${key}`} tabIndex={activeTab === key ? 0 : -1}
            onClick={() => selectTab(key)} onKeyDown={event => {
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'ArrowRight' ? (index + 1) % tabs.length : -1;
              if (next < 0) return;
              event.preventDefault();
              selectTab(tabs[next].key);
              document.getElementById(`${tabId}-${tabs[next].key}-tab`)?.focus();
            }}><Icon size={18} aria-hidden="true" />{label}</button>)}
        </div>
        {tabs.map(({ key }) => <div key={key} role="tabpanel" id={`${tabId}-${key}`} aria-labelledby={`${tabId}-${key}-tab`} hidden={key !== activeTab} className="invoice-dashboard-panel" data-invoice-tab={key}>
          {key === 'overview' && <>
            <section className="invoice-dashboard-card">
              <Heading icon={Box}>Chi tiết hóa đơn</Heading>
              <InvoiceBreakdown details={breakdown} currency={first(row, 'currency') || undefined} />
              <div className="invoice-paired invoice-overview-details">
                <dl className="invoice-dashboard-facts">
                  {period && <div><dt><CalendarDays size={16} />Kỳ thu</dt><dd>{period}</dd></div>}
                  <div><dt><CalendarDays size={16} />Hạn thanh toán</dt><dd>{bookingDeadline ? date(bookingDeadline, true) : date(row.dueAt)}</dd></div>
                  <div><dt><FileText size={16} />Loại hóa đơn</dt><dd>{label(row.type)}</dd></div>
                  {Number(overdue.days) > 0 && <div><dt>Quá hạn</dt><dd>{first(overdue, 'days')} ngày</dd></div>}
                  {first(overdue, 'graceDays') && <div><dt>Thời gian gia hạn</dt><dd>{first(overdue, 'graceDays')} ngày</dd></div>}
                  {first(overdue, 'managerReviewOn') && <div><dt>Mốc quản lý xử lý</dt><dd>{date(first(overdue, 'managerReviewOn'))}</dd></div>}
                </dl>
                <dl className="invoice-charge-lines">
                  <div><dt>Tiền thuê</dt><dd>{money(row.rentalAmount)}</dd></div>
                  <div><dt>Tiền cọc</dt><dd>{money(row.depositAmount)}</dd></div>
                  <div><dt>Dịch vụ bổ sung</dt><dd>{money(row.serviceAmount)}</dd></div>
                  {Number(row.chargeAmount) !== 0 && typeof row.chargeAmount === 'number' && <div><dt>Phí được duyệt</dt><dd>{money(row.chargeAmount)}</dd></div>}
                  <div className="invoice-charge-total"><dt>Tổng hóa đơn</dt><dd>{money(total)}</dd></div>
                </dl>
              </div>
              {row.isPastDue === true && <p className="booking-alert is-error">Hóa đơn đã quá hạn thanh toán.</p>}
              {overdue.rentDebtRequiresReconciliation === true && <p>Cần đối soát khoản đã thu để xác định tiền thuê còn nợ.</p>}
              {first(row, 'voidReason') && <p>{first(row, 'voidReason')}</p>}
              {(['replacesInvoice', 'replacementInvoice'] as const).map((field, index) => {
                const target = first(row, field + '.id');
                return target && <p key={field}>{index === 0 ? 'Thay hóa đơn ' : 'Được thay bằng '}<Link to={`/manager/operations/invoices/${encodeURIComponent(target)}`}>{first(row, field + '.invoiceCode')}</Link></p>;
              })}
            </section>
            {!!contracts.length && <section className="invoice-dashboard-card">
              <Heading icon={FileText}>Hợp đồng liên quan</Heading>
              <div className="manager-table-wrap invoice-dashboard-table"><table className="manager-table">
                <thead><tr><th scope="col">Số hợp đồng</th><th scope="col">Kho</th><th scope="col">Trạng thái</th></tr></thead>
                <tbody>{contracts.map(contract => <tr key={first(contract, 'id', 'contractCode')}>
                  <th scope="row"><Link to={`/manager/operations/contracts/${encodeURIComponent(first(contract, 'id', 'contractCode'))}`}>{first(contract, 'contractCode')}</Link></th>
                  <td>{first(contract, 'storageUnit.unitCode', 'unit.unitCode', 'unitCode') || '—'}</td><td><Status value={contract.status} /></td>
                </tr>)}</tbody>
              </table></div>
            </section>}
          </>}
          {key === 'payments' && <section className="invoice-dashboard-card">
            <Heading icon={Database}>Khoản thu đã ghi nhận ({payments.length})</Heading>
            {!payments.length ? <p>Hóa đơn này chưa có khoản thu.</p> : <div className="invoice-payments-table"><table>
              <thead><tr><th scope="col">Mã khoản thu</th><th scope="col">Ngày nhận</th><th scope="col">Phương thức</th><th scope="col">Mã giao dịch</th><th scope="col" className="invoice-numeric">Số tiền</th><th scope="col">Người ghi nhận</th></tr></thead>
              <tbody>{payments.map(payment => <tr key={first(payment, 'id', 'paymentCode')}>
                <th scope="row"><Link to={`/manager/operations/payments/${encodeURIComponent(first(payment, 'id', 'paymentCode'))}`}>{first(payment, 'paymentCode')}</Link></th>
                <td data-label="Ngày nhận"><time dateTime={first(payment, 'receivedAt') || undefined}>{date(payment.receivedAt, true)}</time></td>
                <td data-label="Phương thức"><span>{label(payment.method)}</span></td><td data-label="Mã giao dịch"><span>{first(payment, 'reference') || '—'}</span></td>
                <td data-label="Số tiền" className="invoice-numeric"><strong>{money(payment.amount)}</strong></td><td data-label="Người ghi nhận"><span>{first(payment, 'recordedBy.fullName') || '—'}</span></td>
              </tr>)}</tbody>
            </table></div>}
          </section>}
          {key === 'transactions' && (visitedTransactions || activeTab === 'transactions') && <ManagerFinanceReview invoice={row} onSaved={refresh} refreshVersion={financeRevision} />}
          {key === 'history' && <section className="invoice-dashboard-card">
            <Heading icon={Clock3}>Nhật ký hóa đơn</Heading>
            {!events.length ? <p>Hóa đơn này chưa có nhật ký.</p> : <ol className="invoice-dashboard-history">{events.map(event => <li key={event.key}>
              <strong>{event.label}</strong><time dateTime={event.value}>{date(event.value, true)}</time>{event.detail && <small>{event.detail}</small>}
            </li>)}</ol>}
          </section>}
        </div>)}
      </div>
      <aside className="invoice-dashboard-column" aria-label="Thanh toán và tài liệu">
        <section className="invoice-dashboard-card">
          <Heading icon={BarChart3}>Tiến độ thanh toán</Heading>
          <div className="invoice-progress"><progress value={percent} max={100} aria-label="Tiến độ thanh toán" /><strong>{percent}%</strong></div>
          <dl className="invoice-progress-legend">
            <div><dt><span />Đã thu</dt><dd>{money(paid)}</dd></div>
            <div><dt><span />Còn phải thu</dt><dd>{money(row.balanceDue)}</dd></div>
          </dl>
        </section>
        {canRecord && <section className="invoice-dashboard-card invoice-record-payment">
          <Heading icon={CreditCard}>Ghi nhận thanh toán</Heading>
          {row.status === 'VOID' ? <p>Hóa đơn đã hủy.</p> : <ManagerActions key={`${id}:${row.updatedAt ?? row.status}`} resource="invoices" row={row} id={id}
            refresh={refreshAll} onSuccess={onNotice} />}
          {row.status !== 'VOID' && Number(row.balanceDue) > 0 && <p className="invoice-payment-warning"><Info size={17} />Chỉ ghi nhận khoản thu đã được xác minh.</p>}
        </section>}
        <section className="invoice-dashboard-card">
          <Heading icon={FileText}>Tệp hóa đơn</Heading>
          <div className="invoice-dashboard-file"><span className="invoice-file-icon"><FileText size={24} /></span><div><strong>{invoiceCode}.pdf</strong><small>Tài liệu PDF</small></div>
            <button type="button" className="button-secondary" title="Xem tệp PDF" aria-label="Xem tệp PDF" disabled={file.busy} onClick={() => void file.open(false)}><Eye size={17} /></button>
            <button type="button" className="button-secondary" title="Tải tệp PDF" aria-label="Tải tệp PDF" disabled={file.busy} onClick={() => void file.open(true)}><Download size={17} /></button>
          </div>
        </section>
      </aside>
    </div>
  </section>;
}
