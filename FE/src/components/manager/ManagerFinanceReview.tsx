import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSearch, RefreshCw, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { mutate } from '../../services/portal';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { financeReviewTypes, type FinanceReviewType } from '../../utils/manager-finance-review';
import { normalizeSearch } from '../../utils/notification-tools';
import { useConfirmation } from '../workspace/ConfirmationProvider';
import { ManagerTaskTable, ManagerTableFilter, ManagerTableSearch } from './ManagerTaskTable';
import { Facts, Modal, Status } from './PortalUi';
import { date, first, money, object, type Row } from './portal-data';

const reviewLabels = { submissions: 'Thông báo chuyển khoản', reconciliation: 'Đối soát giao dịch' };
const statuses: Record<FinanceReviewType, [string, string][]> = {
  submissions: [['PENDING_VERIFICATION', 'Chờ xác minh'], ['VERIFIED', 'Đã xác minh'], ['REJECTED', 'Từ chối']],
  reconciliation: [['PENDING_REVIEW', 'Chờ đối soát'], ['REFUND_REQUIRED', 'Cần hoàn tiền'], ['RECONCILED', 'Đã xử lý']],
};
const recordCode = (row: Row) => first(row, 'submissionCode', 'reconciliationCode');
const invoiceCode = (row: Row) => first(row, 'invoice.invoiceCode', 'transaction.invoice.invoiceCode');
const invoiceId = (row: Row) => first(row, 'invoice.id', 'transaction.invoice.id');
const customerName = (row: Row) => first(row, 'customer.fullName', 'transaction.invoice.reservation.customer.fullName');
const reference = (row: Row) => first(row, 'transferReference', 'providerTransactionId');

export function ManagerFinanceReview({ invoice, onSaved, refreshVersion }: { invoice?: Row; onSaved: () => void; refreshVersion?: number }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = params.get('review') === 'reconciliation' ? 'reconciliation' : 'submissions';
  const record = params.has('review') ? params.get('record') ?? '' : '';
  const currentInvoice = invoice && first(invoice, 'id');
  const invoiceQuery = invoice ? new URLSearchParams({ invoiceCode: first(invoice, 'invoiceCode') }) : null;
  const submissions = usePaginatedResource<Row>(financeReviewTypes.submissions.api + (invoiceQuery ? '?' + invoiceQuery : ''), user?.id);
  // The reconciliation API is facility-scoped and does not accept an invoice filter.
  const reconciliation = usePaginatedResource<Row>(financeReviewTypes.reconciliation.api, user?.id);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ text: string; followup?: string }>();
  const resource = kind === 'submissions' ? submissions : reconciliation;
  const entries = (result: typeof resource) => (result.data?.items ?? []).filter(row => !currentInvoice || currentInvoice === invoiceId(row));
  const pending = (row: Row, group: FinanceReviewType) => financeReviewTypes[group].pending.some(status => status === row.status);
  const records = entries(resource);
  const selected = record ? records.find(row => first(row, 'id') === record || recordCode(row) === record) : undefined;
  const term = normalizeSearch(search.trim());
  const filtered = records.filter(row => (filter === 'all' || (filter === 'pending' ? pending(row, kind) : row.status === filter))
    && normalizeSearch([recordCode(row), invoiceCode(row), customerName(row), reference(row)].join(' ')).includes(term));
  const [limit, setLimit] = useState(10);
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / limit)));
  const refresh = () => { submissions.refresh(); reconciliation.refresh(); };
  const appliedRefresh = useRef(refreshVersion);
  const { refresh: refreshSubmissions } = submissions;
  const { refresh: refreshReconciliation } = reconciliation;
  useEffect(() => {
    if (appliedRefresh.current === refreshVersion) return;
    appliedRefresh.current = refreshVersion;
    refreshSubmissions();
    refreshReconciliation();
  }, [refreshVersion, refreshSubmissions, refreshReconciliation]);

  function open(group: FinanceReviewType, id = '') {
    if (group !== kind) { setFilter('pending'); setSearch(''); setPage(1); }
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('review', group);
      if (id) next.set('record', id);
      else next.delete('record');
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  const start = (visiblePage - 1) * limit;
  const pageCount = Math.ceil(filtered.length / limit);
  return <section className={invoice ? 'invoice-review invoice-dashboard-card' : 'manager-section'} aria-labelledby="finance-review-title">
    <header className="invoice-review-header"><div>
    <h2 id="finance-review-title">Giao dịch cần xử lý</h2>
    <p>{invoice ? 'Xác minh và đối soát giao dịch của hóa đơn.' : 'Xác minh thông báo chuyển khoản và xử lý giao dịch chưa thể ghi nhận vào hóa đơn.'}</p>
    </div>{invoice && <button type="button" className="button-secondary" disabled={submissions.refreshing || reconciliation.refreshing} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>}</header>
    <div className={invoice ? 'invoice-review-nav' : 'portal-toolbar'} role="group" aria-label="Loại giao dịch">
      {(['submissions', 'reconciliation'] as const).map(group => {
        const result = group === 'submissions' ? submissions : reconciliation;
        const count = result.data ? entries(result).filter(row => pending(row, group)).length : null;
        return <button type="button" key={group} className={kind === group ? 'button-primary' : 'button-secondary'}
          aria-pressed={kind === group} onClick={() => open(group)}>
          {reviewLabels[group]}{count !== null ? ` (${count})` : ''}
        </button>;
      })}
      {!invoice && refreshVersion === undefined && <button type="button" className="button-secondary" disabled={submissions.refreshing || reconciliation.refreshing} onClick={refresh}>Làm mới giao dịch</button>}
    </div>
    {notice && <div className="portal-success" role="status">
      {notice.text}{notice.followup && <button className="button-secondary" type="button" onClick={() => open('reconciliation', notice.followup)}>Xem hồ sơ đối soát</button>}
    </div>}
    {record && !selected && !resource.loading && !resource.refreshing && !resource.error && <p role="status">
      Không tìm thấy giao dịch tại cơ sở đang quản lý.{' '}
      <button type="button" className="portal-text-button" onClick={() => open(kind)}>Xem danh sách giao dịch</button>
    </p>}
    {invoice ? <>
      <div className="invoice-review-filters">
        <label className="invoice-review-search"><Search size={17} aria-hidden="true" /><input aria-label="Tìm kiếm" placeholder="Tìm mã giao dịch, hóa đơn, khách hàng..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <ManagerTableFilter label="Trạng thái giao dịch" value={filter} onChange={value => { setFilter(value); setPage(1); }} options={[[ 'pending', 'Cần xử lý' ], ['all', 'Tất cả trạng thái'], ...statuses[kind]]} />
        {(search || filter !== 'pending') && <button type="button" className="button-secondary" onClick={() => { setSearch(''); setFilter('pending'); setPage(1); }}>Xóa bộ lọc</button>}
      </div>
      <div className="invoice-review-table" tabIndex={0} role="region" aria-label={reviewLabels[kind]} aria-busy={resource.loading || resource.refreshing}>
        <table><thead><tr>{['Mã giao dịch', 'Thời gian', 'Số tiền', 'Trạng thái', 'Thao tác'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>
          {resource.error || resource.loading || !filtered.length ? <tr><td colSpan={5}>
            <div className="invoice-review-empty" role={resource.error ? 'alert' : 'status'}>
              {resource.error ? <>{resource.error} <button type="button" className="button-secondary" onClick={resource.refresh}>Thử lại</button></> : resource.loading ? 'Đang tải giao dịch…' : <>
                <span><FileSearch size={38} aria-hidden="true" /></span><strong>Không có giao dịch</strong>
                <p>{term || filter !== 'pending' && filter !== 'all' ? 'Không có giao dịch phù hợp với bộ lọc hiện tại.' : filter === 'pending' ? 'Hiện không có giao dịch cần xử lý.' : 'Hóa đơn này chưa có giao dịch.'}</p>
              </>}
            </div>
          </td></tr> : filtered.slice(start, start + limit).map(row => <tr key={first(row, 'id')}>
            <td><button type="button" className="portal-text-button" onClick={() => open(kind, first(row, 'id'))}>{recordCode(row)}</button></td>
            <td>{date(first(row, 'submittedAt', 'createdAt'), true)}</td><td>{money(row.amount)}</td>
            <td><Status value={row.status} text={statuses[kind].find(([value]) => value === row.status)?.[1]} /></td>
            <td><button type="button" className="button-secondary" aria-label={'Xem giao dịch ' + recordCode(row)} onClick={() => open(kind, first(row, 'id'))}>{pending(row, kind) ? kind === 'submissions' ? 'Xử lý' : 'Đối soát' : 'Xem'}</button></td>
          </tr>)}
        </tbody></table>
      </div>
      {!resource.loading && !resource.error && <footer className="invoice-review-footer">
        <span>{filtered.length ? `${start + 1}–${Math.min(start + limit, filtered.length)} trên ${filtered.length}` : '0'} giao dịch</span>
        {filtered.length > 0 && <ManagerTableFilter label="Số dòng" value={String(limit)} onChange={value => { setLimit(Number(value)); setPage(1); }} options={['10', '20', '50'].map(value => [value, `${value} / trang`])} />}
        {pageCount > 1 && <nav aria-label="Phân trang giao dịch"><button type="button" className="button-secondary" aria-label="Trang trước" disabled={visiblePage === 1} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={16} /></button><span>{visiblePage} / {pageCount}</span><button type="button" className="button-secondary" aria-label="Trang sau" disabled={visiblePage === pageCount} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={16} /></button></nav>}
      </footer>}
    </> : <ManagerTaskTable title={reviewLabels[kind]} items={filtered.slice(start, start + limit)}
      total={filtered.length} page={visiblePage} limit={limit} update={(key, value) => {
        if (key === 'page') setPage(Number(value));
        if (key === 'limit') { setLimit(Number(value)); setPage(1); }
      }}
      rowKey={row => first(row, 'id')} loading={resource.loading} refreshing={resource.refreshing} error={resource.error} retry={resource.refresh}
      rowDetail={row => ({ open: () => open(kind, first(row, 'id')), label: 'Xem giao dịch ' + recordCode(row) })}
      columns={[
        { key: 'code', label: 'Hồ sơ / Hóa đơn', cell: row => <><strong>{recordCode(row)}</strong><small>{invoiceCode(row)}</small></> },
        { key: 'customer', label: 'Khách hàng', cell: customerName },
        { key: 'amount', label: 'Số tiền', cell: row => money(row.amount) },
        { key: 'time', label: 'Ngày ghi nhận', cell: row => date(first(row, 'submittedAt', 'createdAt'), true) },
        { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.status} text={statuses[kind].find(([value]) => value === row.status)?.[1]} /> },
      ]}
      toolbar={<>
        <ManagerTableSearch placeholder="Mã giao dịch, hóa đơn hoặc khách hàng" value={search} onChange={value => { setSearch(value); setPage(1); }} />
        <ManagerTableFilter label="Trạng thái giao dịch" value={filter} onChange={value => { setFilter(value); setPage(1); }}
          options={[[ 'pending', 'Cần xử lý' ], ['all', 'Tất cả trạng thái'], ...statuses[kind]]} />
      </>} />}
    {selected && <FinanceReviewDialog key={kind + ':' + first(selected, 'id')} kind={kind} row={selected}
      onClose={() => open(kind)} onReconcile={id => open('reconciliation', id)} onSaved={result => {
        const followup = kind === 'submissions' ? first(result, 'reconciliation.id') : '';
        setNotice({ text: followup ? 'Đã chuyển giao dịch sang đối soát. Hóa đơn chưa nhận khoản tiền này.' : 'Đã lưu kết quả xử lý giao dịch.',
          followup });
        open(kind);
        refresh();
        onSaved();
      }} />}
  </section>;
}

function FinanceReviewDialog({ kind, row, onClose, onSaved, onReconcile }: {
  kind: FinanceReviewType; row: Row; onClose: () => void; onSaved: (row: Row) => void; onReconcile: (id: string) => void;
}) {
  const confirm = useConfirmation();
  const lock = useRef(false);
  const [bankRef, setBankRef] = useState('');
  const [note, setNote] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isReconciliation = kind === 'reconciliation';
  const pending = row.status === (isReconciliation ? 'PENDING_REVIEW' : 'PENDING_VERIFICATION');
  const refund = isReconciliation && row.status === 'REFUND_REQUIRED';
  const needsReference = refund || !isReconciliation;
  const canConfirm = verified && note.trim().length >= 3 && (!needsReference || bankRef.trim().length >= (refund ? 2 : 1));
  const related = first(row, 'reconciliation.id');
  const payment = first(row, 'verifiedPayment.id');
  const invoice = invoiceId(row);
  async function submit(action: 'verify' | 'reject' | 'REFUND_REQUIRED' | 'RECONCILED') {
    if (lock.current || note.trim().length < 3) return;
    lock.current = true;
    try {
      const title = action === 'verify' ? 'Xác minh đã nhận tiền' : action === 'reject' ? 'Từ chối thông báo chuyển khoản'
        : action === 'REFUND_REQUIRED' ? 'Yêu cầu hoàn tiền' : refund ? 'Ghi nhận đã hoàn tiền' : 'Kết thúc đối soát';
      const description = action === 'REFUND_REQUIRED' ? 'Hồ sơ sẽ chuyển sang chờ hoàn tiền ngoài hệ thống.'
        : action === 'reject' ? note.trim() : `${money(row.amount)} · Hóa đơn ${invoiceCode(row)}`;
      if (!await confirm({ title, description, confirmLabel: title, destructive: action === 'reject' })) return;
      setBusy(true);
      setError('');
      const body = isReconciliation
        ? { resolution: action, resolutionNote: note.trim(), refundReference: bankRef.trim(), refundConfirmed: verified }
        : action === 'verify' ? { reference: bankRef.trim(), note: note.trim() } : { reason: note.trim() };
      const result = await mutate(`${financeReviewTypes[kind].api}/${encodeURIComponent(first(row, 'id'))}/${isReconciliation ? 'resolve' : action}`, 'POST', body);
      onSaved(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu quyết định.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title={recordCode(row)} busy={busy} onClose={onClose}>
    <Facts items={[
      ['Khách hàng', customerName(row)],
      ['Hóa đơn', invoice ? <Link to={'/manager/operations/invoices/' + encodeURIComponent(invoice)}>{invoiceCode(row)}</Link> : invoiceCode(row)],
      ['Trạng thái hóa đơn', <Status value={first(row, 'invoice.status', 'transaction.invoice.status')} />],
      ['Số tiền giao dịch', money(row.amount)],
      ...(row.invoice ? [['Số dư hóa đơn', money(object(row.invoice).balanceDue)] as [string, string]] : []),
      ['Nguồn giao dịch', row.source === 'VNPAY' ? 'VNPay' : 'Chuyển khoản ngân hàng'],
      ['Mã giao dịch', reference(row) || '—'],
      ['Mã giao dịch gốc', first(row, 'transaction.merchantOrderRef') || '—'],
      ['Thời điểm ghi nhận', date(first(row, 'submittedAt', 'createdAt'), true)],
      ['Lý do / Nội dung', first(row, 'reason', 'customerNote') || '—'],
      ['Trạng thái', <Status value={row.status} />],
      ['Kết quả xử lý', first(row, 'resolutionNote', 'rejectionReason') || '—'],
      ['Người xử lý', first(row, 'reviewedBy.fullName') || '—'],
      ['Đã xử lý lúc', date(row.reviewedAt, true)],
    ]} />
    {payment && <Link to={'/manager/operations/payments/' + encodeURIComponent(payment)}>Xem khoản thu đã ghi nhận</Link>}
    {related && <button type="button" className="button-secondary" onClick={() => onReconcile(related)}>Xem hồ sơ đối soát liên quan</button>}
    {(pending || refund) && <div className="portal-form">
      <p>{isReconciliation ? 'Đối chiếu kết quả thực tế trước khi cập nhật. Thao tác này chỉ ghi nhận quyết định và kết quả.' : 'Chỉ xác minh sau khi đã đối chiếu khoản tiền thực nhận tại ngân hàng.'}</p>
      {needsReference && <label className="field-label">{refund ? 'Mã giao dịch hoàn tiền' : 'Mã giao dịch ngân hàng đã kiểm tra'}
        <input value={bankRef} onChange={event => setBankRef(event.target.value)} maxLength={200} disabled={busy} />
      </label>}
      <label className="field-label">Ghi chú / Lý do<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <label className="portal-checkbox"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} disabled={busy} />
        {refund ? 'Tôi xác nhận khoản tiền đã được hoàn thực tế.' : 'Tôi đã kiểm tra và xác nhận kết quả thực tế.'}</label>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="button-primary" disabled={busy || !canConfirm} onClick={() => void submit(isReconciliation ? 'RECONCILED' : 'verify')}>
        {refund ? 'Ghi nhận đã hoàn tiền' : isReconciliation ? 'Xác nhận đã xử lý' : 'Xác minh đã nhận tiền'}
      </button>
      {pending && <button type="button" className="button-secondary" disabled={busy || note.trim().length < 3}
        onClick={() => void submit(isReconciliation ? 'REFUND_REQUIRED' : 'reject')}>
        {isReconciliation ? 'Yêu cầu hoàn tiền' : 'Từ chối yêu cầu'}
      </button>}
    </div>}
  </Modal>;
}
