import { RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useInternalListResource } from '../../components/workspace/useInternalListResource';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { code, date, first, recordId, type Row } from '../../components/manager/portal-data';
import { staffTaskPageSize } from '../../utils/internal-pagination';
import { recordIdentity } from '../../utils/record-identity';

const title = 'Kho đang thuê';
const columns: StaffColumn<Row>[] = [
  { key: 'person', label: 'Khách hàng', cell: row => <><strong>{first(row, 'customer.fullName') || '—'}</strong><CopyRecordCode value={code(row)} /></> },
  { key: 'unit', label: 'Kho', cell: row => recordIdentity(row, 'rentals').location || '—' },
  { key: 'date', label: 'Ngày hết hạn', cell: row => date(first(row, 'effectiveEndDate', 'endDate')) },
  { key: 'status', label: 'Trạng thái', cell: row => <Status value={row.rentalState} /> },
  { key: 'action', label: 'Thao tác', cell: row => <Link className="button-secondary" to={`/staff/rentals/${encodeURIComponent(recordId(row))}`}>Xem chi tiết</Link> },
];

export function StaffListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const suppliedStatus = params.get('status');
  const status = suppliedStatus === 'OVERDUE' || suppliedStatus === 'ACTIVE' ? suppliedStatus : '';
  const limit = staffTaskPageSize(params);
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('overdue', String(status === 'OVERDUE'));
  const resource = useInternalListResource<Row>(`/staff/rentals?${query}`, user?.id ?? '', true, true);
  const items = resource.data?.items ?? [];
  const change = (key: string, value: string) =>
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  return <section>
    <PageHeader title={title}>
      <Link to="/staff/overstays" className="button-secondary">Kho quá hạn tôi phụ trách</Link>
      <button type="button" className="button-secondary" onClick={resource.refresh} disabled={resource.loading || resource.refreshing}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={resource.refreshing} />
    </PageHeader>
    <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm hồ sơ<input type="search" maxLength={100} placeholder="Mã hồ sơ, khách hàng, kho…" value={search}
        onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Trạng thái<select value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option><option value="ACTIVE">Trong hạn</option><option value="OVERDUE">Quá hạn</option>
      </select></label>
      {(search || status) && <button type="button" className="button-secondary" onClick={() => setParams(params.has('limit') ? { limit: String(limit) } : {}, { replace: true })}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={resource.loading} error={resource.error} retry={resource.refresh}
      placeholder={<StaffTaskTable title={title} columns={columns} items={[]} rowKey={recordId} loadingRows={5} />} />
    {resource.data && <>
      {items.length ? <StaffTaskTable title={title} columns={columns} items={items} rowKey={recordId} /> : <Empty title="Chưa có kho đang thuê phù hợp" />}
      <StaffTaskPagination page={page} limit={limit} total={resource.data.total} onChange={value => change('page', String(value))}
        onLimitChange={value => change('limit', String(value))} />
    </>}
  </section>;
}
