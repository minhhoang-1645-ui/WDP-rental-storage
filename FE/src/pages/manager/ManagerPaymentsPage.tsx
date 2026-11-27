import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ManagerFinanceReview } from '../../components/manager/ManagerFinanceReview';
import { ManagerTableFilter, ManagerTableSearch } from '../../components/manager/ManagerTaskTable';
import { LoadState, PageHeader } from '../../components/manager/PortalUi';
import { date, first, label, money, type Page, type Row } from '../../components/manager/portal-data';
import { DatePicker } from '../../components/workspace/DateTimeFields';
import { InternalPagination } from '../../components/workspace/InternalPagination';
import { useApiResource } from '../../services/useApiResource';
import { financeReviewTypes, managerPaymentsPath } from '../../utils/manager-finance-review';
import './manager-payments.css';

type PaymentPage = Page<Row> & { summary: { total: string; online: string; cash: string; transfer: string } };
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const methods: [string, string][] = [['', 'Tất cả phương thức'], ['PAYOS', 'payOS'], ['VNPAY', 'VNPay'], ['CASH', 'Tiền mặt'], ['BANK_TRANSFER', 'Chuyển khoản ngân hàng']];

export function ManagerPaymentsPage() {
  const { user } = useAuth();
  const identity = user?.id ?? '';
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const exceptions = params.has('review') || params.get('tab') === 'exceptions';
  const search = params.get('search') ?? '';
  const method = params.get('method') ?? '';
  const from = params.get('receivedFrom') ?? '';
  const to = params.get('receivedTo') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Number(params.get('limit')) || 20;
  const invalid = Boolean(from && to && from > to);
  const query = new URLSearchParams({ page: String(page), limit: String(limit), search, method, from, to });
  const payments = useApiResource<PaymentPage>(invalid ? null : '/manager/payments?' + query, identity);
  const submissions = useApiResource<{ total: number }>(financeReviewTypes.submissions.api + '?status=PENDING_VERIFICATION&limit=1', identity);
  const pending = useApiResource<{ total: number }>(financeReviewTypes.reconciliation.api + '?status=PENDING_REVIEW&limit=1', identity);
  const refund = useApiResource<{ total: number }>(financeReviewTypes.reconciliation.api + '?status=REFUND_REQUIRED&limit=1', identity);
  const count = submissions.data && pending.data && refund.data ? submissions.data.total + pending.data.total + refund.data.total : undefined;
  const summary = payments.data?.summary;
  const onlineTotal = summary && BigInt(summary.online) + BigInt(summary.transfer);
  const reviewHistory = params.get('reviewView') === 'history';
  const refreshPayments = () => { payments.refresh(); submissions.refresh(); pending.refresh(); refund.refresh(); };

  function update(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (key !== 'page') next.delete('page');
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true, preventScrollReset: true });
  }
  function reviewSearch(kind?: keyof typeof financeReviewTypes, history = false) {
    const next = new URLSearchParams(params);
    for (const key of ['tab', 'review', 'record', 'reviewView']) next.delete(key);
    if (kind) next.set('review', kind);
    if (history) next.set('reviewView', 'history');
    return next.toString();
  }

  return <section className="manager-payments">
    <PageHeader title="Khoản thu" description="Theo dõi các khoản thanh toán đã ghi nhận tại cơ sở.">
      <button type="button" className="button-secondary" onClick={() => { refreshPayments(); setRefreshVersion(value => value + 1); }}
        disabled={payments.refreshing || submissions.refreshing || pending.refreshing || refund.refreshing}><RefreshCw size={16} aria-hidden="true" /> Làm mới</button>
    </PageHeader>
    <dl className="manager-payment-totals">
      <div><dt>Tổng khoản thu</dt><dd>{summary ? currency.format(BigInt(summary.total)) : '—'}</dd></div>
      <div><dt>Thanh toán trực tuyến</dt><dd>{onlineTotal !== undefined ? currency.format(onlineTotal) : '—'}</dd></div>
      <div><dt>Tiền mặt</dt><dd>{summary ? currency.format(BigInt(summary.cash)) : '—'}</dd></div>
    </dl>
    <div className="manager-payment-meta">
      <p className="manager-payment-caption">Số liệu chưa trừ các khoản hoàn tiền</p>
      <Link className="portal-text-button" to={{ search: reviewSearch(exceptions ? undefined : 'reconciliation', !exceptions) }}>
        {exceptions ? 'Về lịch sử khoản thu' : 'Tra cứu đối soát'}
      </Link>
    </div>
    {exceptions ? <ManagerFinanceReview key={reviewHistory ? 'history' : 'pending'} showAllInitially={reviewHistory}
      onSaved={refreshPayments} refreshVersion={refreshVersion} />
      : <div className="manager-section">
        {count !== undefined && count > 0 && <div className="manager-payment-review-alert">
          <span role="status"><AlertCircle size={16} aria-hidden="true" />Có {count} giao dịch cần đối soát</span>
          <Link className="button-secondary" to={{ search: reviewSearch(pending.data?.total || refund.data?.total ? 'reconciliation' : 'submissions') }}>Xem và xử lý</Link>
        </div>}
        <div className="portal-toolbar">
          <ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Khách hàng, mã kho, hóa đơn, mã giao dịch" />
          <ManagerTableFilter label="Phương thức thanh toán" value={method} onChange={value => update('method', value)} options={methods} />
          <DatePicker label="Ghi nhận từ ngày" value={from} max={to || undefined} onChange={value => update('receivedFrom', value)} />
          <DatePicker label="Ghi nhận đến ngày" value={to} min={from || undefined} onChange={value => update('receivedTo', value)} />
        </div>
        {invalid && <p role="alert">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
        <LoadState loading={payments.loading} error={payments.error} retry={payments.refresh} />
        {payments.data && <>
          {payments.data.items.length ? <div className="manager-payment-table">
            <table aria-label="Lịch sử khoản thu"><thead><tr>
              {['Khách hàng', 'Mã kho', 'Mã hóa đơn', 'Phương thức', 'Số tiền đã thu', 'Thời gian ghi nhận', 'Thao tác'].map(title => <th key={title} scope="col">{title}</th>)}
            </tr></thead><tbody>
              {payments.data.items.map(row => <tr key={first(row, 'id')}>
                <td>{first(row, 'invoice.reservation.customer.fullName') || '—'}</td>
                <td>{first(row, 'unitCode') || '—'}</td>
                <td>{first(row, 'invoice.invoiceCode')}</td>
                <td>{row.method === 'PAYOS' ? 'payOS' : row.method === 'VNPAY' ? 'VNPay' : label(row.method)}</td>
                <td>{money(row.amount)}</td>
                <td>{date(row.receivedAt, true)}</td>
                <td><Link to={managerPaymentsPath + '/' + encodeURIComponent(first(row, 'id'))}
                  state={{ returnTo: location.pathname + location.search }}>Xem chi tiết</Link></td>
              </tr>)}
            </tbody></table>
          </div> : <p className="manager-payment-empty" role="status">Không có khoản thu phù hợp.</p>}
          <InternalPagination page={page} limit={limit} total={payments.data.total} onChange={value => update('page', String(value))}
            onLimitChange={value => update('limit', String(value))} />
        </>}
      </div>}
  </section>;
}
