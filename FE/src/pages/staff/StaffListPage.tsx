import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { date } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useListPagination } from '../../components/workspace/useListPagination';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { normalizeSearch } from '../../utils/notification-tools';
import { staffRentalPeriod, staffRentalPeriods, staffRentalsPath, staffRentalTarget, useStaffRentalToday, type StaffRental, type StaffRentalContract } from './staff-rentals';

const title = 'Kho đang thuê';
type RentalRow = { reservationId: string; customer: string; contract: StaffRentalContract; period: keyof typeof staffRentalPeriods };

const columns: StaffColumn<RentalRow>[] = [
  { key: 'unit', label: 'Khách hàng / Kho', cell: ({ customer, contract }) => <><strong>{contract.unit.unitCode}</strong><small>{customer}</small></> },
  { key: 'start', label: 'Bắt đầu thuê', cell: ({ contract }) => date(contract.startDate) },
  { key: 'end', label: 'Hết hạn', cell: ({ contract }) => date(contract.endDate) },
  { key: 'status', label: 'Trạng thái', cell: ({ period }) => <Status value={staffRentalPeriods[period].badge} text={staffRentalPeriods[period].label} /> },
];

export function StaffListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const requestedPeriod = params.get('status');
  const period = requestedPeriod === 'EXPIRING' || requestedPeriod === 'OVERDUE' || requestedPeriod === 'ACTIVE' ? requestedPeriod : '';
  // The API pages reservations. Fetch its authorized pages, then paginate and filter individual contracts.
  const resource = usePaginatedResource<StaffRental>(staffRentalsPath, user?.id, true);
  const data = resource.data;
  const assignmentsDisabled = data && 'assignmentsEnabled' in data && data.assignmentsEnabled === false;
  const today = useStaffRentalToday();
  const keyword = normalizeSearch(search);
  const seen = new Set<string>();
  const filtered = (data?.items ?? []).flatMap(rental => rental.contracts.flatMap(contract => {
    if (contract.status !== 'ACTIVE' || seen.has(contract.id)) return [];
    seen.add(contract.id);
    const rentalPeriod = staffRentalPeriod(contract.endDate, today);
    // Retain the existing link for in-term rentals, including the upcoming expiry subset.
    if (period === 'ACTIVE' ? rentalPeriod === 'OVERDUE' : period && rentalPeriod !== period) return [];
    if (keyword && ![rental.customer.fullName, contract.unit.unitCode, contract.contractCode].some(value => normalizeSearch(value).includes(keyword))) return [];
    return [{ reservationId: rental.reservationId, customer: rental.customer.fullName, contract, period: rentalPeriod }];
  }));
  const { items, pagination } = useListPagination(filtered);

  function change(key: 'search' | 'status', value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      return next;
    }, { replace: true });
  }

  return <section className="staff-rental-list">
    <PageHeader title={title}>
      <button type="button" className="button-secondary" onClick={resource.refresh} disabled={resource.loading || resource.refreshing}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={resource.refreshing} />
    </PageHeader>
    {!assignmentsDisabled && <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm kho<input type="search" maxLength={120} placeholder="Tìm khách hàng hoặc mã kho..." value={search}
        onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Hạn thuê<select value={period} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>
        {period === 'ACTIVE' && <option value="ACTIVE">Trong hạn</option>}
        <option value="EXPIRING">Sắp hết hạn</option><option value="OVERDUE">Quá hạn</option>
      </select></label>
      {(search || period) && <button type="button" className="button-secondary" onClick={() =>
        setParams(params.has('limit') ? { limit: params.get('limit')! } : {}, { replace: true })}>Xóa bộ lọc</button>}
    </div>}
    <LoadState loading={resource.loading} error={resource.status === 403 ? 'Bạn không có quyền xem danh sách kho đang thuê.' : resource.error} retry={resource.refresh}
      placeholder={<StaffTaskTable title={title} columns={columns} items={[]} rowKey={row => row.contract.id} loadingRows={5} />} />
    {data && (items.length ? <>
      <StaffTaskTable title={title} columns={columns} items={items} rowKey={row => row.contract.id}
        rowDetail={row => ({ to: staffRentalTarget(row.reservationId, { contract: row.contract.id }), label: `Xem kho ${row.contract.unit.unitCode}` })} />
      {pagination}
    </> : assignmentsDisabled
      ? <Empty title="Phân công theo kho chưa được bật" description="Bạn vẫn có thể mở nhiệm vụ được giao trong Công việc của tôi." />
      : search || period
        ? <Empty title="Không tìm thấy kho phù hợp." />
        : <Empty title="Bạn chưa được phân công phụ trách kho đang thuê nào." description="Kho đang thuê sẽ xuất hiện khi được phân công cho bạn." />)}
  </section>;
}
