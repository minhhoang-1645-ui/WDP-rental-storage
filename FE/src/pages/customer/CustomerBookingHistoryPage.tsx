import { useState } from 'react';

import { ReservationLifecycle } from '../../components/customer/ReservationLifecycle';
import type { ReservationRentalSummary } from '../../types/booking';
import { Link, useSearchParams } from 'react-router-dom';
import { DetailCard } from '../../components/workspace/DetailRow';
import { ChevronDown, RefreshCw, History } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { useListPagination } from '../../components/workspace/useListPagination';
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi';
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers';
import { bookingHistory, matchesHistorySearch } from '../../utils/booking-history';
import type { Row } from '../../components/manager/portal-data';

export function CustomerBookingHistoryPage() {
  const { user } = useAuth();
  const reservations = useApiResource<Row[]>('/reservations', user?.id ?? '', true);
  const contracts = usePaginatedResource<Row>('/customer/contracts?limit=100', user?.id ?? '', true);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const phase = params.get('phase') ?? '';
  function setFilter(key: 'search' | 'phase', value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      return next;
    }, { replace: true });
  }
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleDetails = (reference: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(reference)) next.delete(reference); else next.add(reference);
    return next;
  });
  const entries = bookingHistory(reservations.data ?? [], contracts.data?.items ?? []);
  const shown = entries.filter(entry => (!phase || entry.phase === phase) && matchesHistorySearch(entry.searchText, search));
  const { items, pagination } = useListPagination(shown);
  const loading = reservations.loading || contracts.loading;
  const refresh = () => { reservations.refresh(); contracts.refresh(); };
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Kho của bạn" title="Lịch sử đặt kho" action={<button className="button-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} />Làm mới lịch sử</button>} />
    <div className="customer-filter-row booking-history-filters">
      <label className="field-label">Tìm trong lịch sử<input type="search" value={search} maxLength={150} placeholder="Mã đơn, tên kho, mã kho hoặc hợp đồng…" onChange={event => setFilter('search', event.target.value)} /></label>
      <label className="field-label">Trạng thái thuê<select aria-label="Trạng thái lịch sử" value={phase} onChange={event => setFilter('phase', event.target.value)}><option value="">Tất cả</option>{[...new Map(entries.map(entry => [entry.phase, entry.phaseLabel]))].map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
    </div>
    {loading ? <PortalLoading label="Đang tải lịch sử đặt kho…" /> : reservations.error || contracts.error ? <PortalError message={reservations.error || contracts.error} onRetry={refresh} /> : <>
      <p>{shown.length} / {entries.length} đơn đặt kho</p>
      {!items.length ? <PortalEmpty icon={<History size={28} />} title={entries.length ? 'Không có lịch sử phù hợp' : 'Bạn chưa có lịch sử đặt kho'}><Link className="button-secondary" to="/storage">Xem kho đang cung cấp</Link></PortalEmpty> : <div className="customer-card-list">{items.map(entry => {
        const product = entry.reservation.product as Row | undefined;
        const summary = entry.reservation.rentalSummary as ReservationRentalSummary | undefined;
        const isExpanded = expanded.has(entry.reference);
        const detailId = `booking-history-details-${encodeURIComponent(entry.reference)}`;
        return <DetailCard key={entry.reference} className="customer-panel customer-record-card booking-history-card" detail={{ to: `/customer/reservations/${encodeURIComponent(entry.reference)}`, label: `Xem đơn đặt kho ${entry.reference}` }}>
          <div className="customer-record-heading"><div><small>{entry.reference} · Đặt ngày {formatPortalDate(String(entry.reservation.createdAt))}</small><h2>{String(product?.name ?? 'Kho đã đặt')}</h2></div><strong className="customer-history-status">{entry.phaseLabel}</strong></div>
          <dl className="customer-record-facts booking-history-summary"><div><dt>Thời gian thuê</dt><dd>{formatPortalDate(entry.startDate)} – {formatPortalDate(entry.endDate)}</dd></div><div><dt>Kho · {Number(entry.reservation.quantity ?? 0)}</dt><dd>{entry.unitCodes.join(', ') || 'Chưa cấp kho'}</dd></div><div><dt>Đã thu</dt><dd>{summary ? moneyLabel(summary.paymentDetails?.totalPaid ?? summary.totalPaid) : 'Chưa có dữ liệu'}</dd></div><div><dt>Chưa thanh toán</dt><dd>{summary ? moneyLabel(summary.paymentDetails?.totalOutstanding ?? Math.max(0, summary.totalInvoiced - summary.totalPaid)) : 'Chưa có dữ liệu'}</dd></div></dl>
          <button type="button" className="button-secondary booking-history-toggle" aria-expanded={isExpanded} aria-controls={detailId} onClick={() => toggleDetails(entry.reference)}>
            {isExpanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}<ChevronDown size={17} aria-hidden="true" />
          </button>
          <div id={detailId} className="booking-history-details" hidden={!isExpanded}>

          <ReservationLifecycle summary={summary} monthlyAmount={typeof (entry.reservation.quote as Row | undefined)?.monthlyUnitPrice === 'number' ? Number((entry.reservation.quote as Row).monthlyUnitPrice) * Number(entry.reservation.quantity ?? 1) : undefined} />
          <details className="customer-inline-notice">
            <summary>Các mốc xử lý</summary>
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
          </div>
        </DetailCard>;
      })}</div>}
      {pagination}
    </>}
  </section>;
}
