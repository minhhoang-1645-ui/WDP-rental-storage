import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, History } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { useCustomerPagination } from '../../components/customer/useCustomerPagination';
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi';
import { formatPortalDate, quoteLabel } from '../../components/customer/CustomerPortalHelpers';
import { bookingHistory, matchesHistorySearch } from '../../utils/booking-history';
import type { Row } from '../../components/manager/portal-data';

export function CustomerBookingHistoryPage() {
  const { user } = useAuth();
  const reservations = useApiResource<Row[]>('/reservations', user?.id ?? '', true);
  const contracts = usePaginatedResource<Row>('/customer/contracts?limit=100', user?.id ?? '', true);
  const [search, setSearch] = useState(''), [phase, setPhase] = useState('');
  const entries = bookingHistory(reservations.data ?? [], contracts.data?.items ?? []);
  const shown = entries.filter(entry => (!phase || entry.phase === phase) && matchesHistorySearch(entry.searchText, search));
  const { items, pagination, reset } = useCustomerPagination(shown);
  const loading = reservations.loading || contracts.loading;
  const refresh = () => { reservations.refresh(); contracts.refresh(); };
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Kho của bạn" title="Lịch sử đặt kho" description="Xem toàn bộ kho đã đặt, kho đang thuê, kho đã trả và những yêu cầu đã hủy hoặc hết hạn." action={<button className="button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} />Làm mới lịch sử</button>} />
    <div className="customer-filter-row booking-history-filters">
      <label className="field-label">Tìm trong lịch sử<input type="search" value={search} maxLength={150} placeholder="Mã đơn, tên kho, mã kho hoặc hợp đồng…" onChange={event => { setSearch(event.target.value); reset(); }} /></label>
      <label className="field-label">Trạng thái thuê<select aria-label="Trạng thái lịch sử" value={phase} onChange={event => { setPhase(event.target.value); reset(); }}><option value="">Tất cả</option>{[...new Map(entries.map(entry => [entry.phase, entry.phaseLabel]))].map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
    </div>
    {loading ? <PortalLoading label="Đang tải lịch sử đặt kho…" /> : reservations.error || contracts.error ? <PortalError message={reservations.error || contracts.error} onRetry={refresh} /> : <>
      <p>{shown.length} / {entries.length} đơn đặt kho</p>
      {!items.length ? <PortalEmpty icon={<History size={28} />} title={entries.length ? 'Không có lịch sử phù hợp' : 'Bạn chưa có lịch sử đặt kho'}><Link className="button-secondary" to="/storage">Xem kho đang cung cấp</Link></PortalEmpty> : <div className="customer-card-list">{items.map(entry => {
        const product = entry.reservation.product as Row | undefined, quote = entry.reservation.quote as Row | undefined;
        return <article key={entry.reference} className="customer-panel customer-record-card booking-history-card">
          <div className="customer-record-heading"><div><small>{entry.reference} · Đặt ngày {formatPortalDate(String(entry.reservation.createdAt))}</small><h2>{String(product?.name ?? 'Kho đã đặt')}</h2></div><strong className="customer-history-status">{entry.phaseLabel}</strong></div>
          <dl className="customer-record-facts"><div><dt>Thời hạn theo hợp đồng / đơn</dt><dd>{formatPortalDate(entry.startDate)} – {formatPortalDate(entry.endDate)}</dd></div><div><dt>Số kho đã đặt</dt><dd>{Number(entry.reservation.quantity ?? 0)}</dd></div><div><dt>Kho được cấp theo hợp đồng</dt><dd>{entry.unitCodes.join(', ') || 'Chưa được cấp kho'}</dd></div><div><dt>Báo giá tại thời điểm đặt</dt><dd>{quoteLabel(Number(quote?.quotedTotalAmount ?? quote?.grandTotal))}</dd></div></dl>
          <details className="customer-inline-notice">
            <summary>Xem các mốc của lần đặt này</summary>
            <ul>
              <li>Đặt kho ngày {formatPortalDate(String(entry.reservation.createdAt), true)}</li>
              {typeof entry.reservation.confirmedAt === 'string' && <li>Xác nhận đặt kho ngày {formatPortalDate(entry.reservation.confirmedAt, true)}</li>}
              {entry.phase === 'EXPIRED' && typeof entry.reservation.expiresAt === 'string' && <li>Hết hạn giữ kho ngày {formatPortalDate(entry.reservation.expiresAt, true)}</li>}
            </ul>
            {entry.contracts.map(contract => {
              const terms = contract.terms as Row | undefined;
              const unit = contract.storageUnit as Row | undefined;
              return <div key={String(contract.id)}>
                <strong>{String(contract.contractCode)}{unit?.unitCode ? ` · ${String(unit.unitCode)}` : ''}</strong>
                <ul>
                  {typeof terms?.acceptedAt === 'string' && <li>Ký hợp đồng ngày {formatPortalDate(terms.acceptedAt, true)}</li>}
                  {typeof contract.activatedAt === 'string' && <li>Bắt đầu sử dụng kho ngày {formatPortalDate(contract.activatedAt, true)}</li>}
                  {typeof contract.completedAt === 'string' && <li>Kết thúc hợp đồng ngày {formatPortalDate(contract.completedAt, true)}</li>}
                </ul>
              </div>;
            })}
          </details>
          {entry.contracts.length > 0 && <div className="customer-actions"><Link className="button-secondary" to={`/customer/contracts?reservation=${encodeURIComponent(entry.reference)}`}>Xem hợp đồng liên quan</Link></div>}
        </article>;
      })}</div>}
      {pagination}
    </>}
  </section>;
}
