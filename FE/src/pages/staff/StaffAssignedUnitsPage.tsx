import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date, first, rows, type Page, type Row } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, Modal, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { staffTaskPageSize } from '../../utils/internal-pagination';
import { normalizeSearch } from '../../utils/notification-tools';
import { staffSourceNames, staffWorkItems } from './staff-work';

const unitNumber = (row: Row) => first(row, 'storageUnit.unitNumber');
const unitType = (row: Row) => first(row, 'storageUnit.storageType.name');
const location = (row: Row) => [first(row, 'storageUnit.floor'), first(row, 'storageUnit.zone')].filter(Boolean).join(' · ');

function AssignedUnitDetail({ item, onClose }: { item: Row; onClose: () => void }) {
  const { user } = useAuth();
  const activity = useActivity();
  const number = unitNumber(item);
  const id = first(item, 'storageUnit.id');
  const isOccupied = first(item, 'storageUnit.status') === 'OCCUPIED';
  const rental = useApiResource<Page<Row>>(isOccupied && number ? `/staff/rentals?unitCode=${encodeURIComponent(number)}&limit=100` : null, user?.id);
  const currentRental = rental.data?.items.find(row => rows(row.contracts).some(contract => first(contract, 'unit.id') === id));
  const contract = currentRental && rows(currentRental.contracts).find(row => first(row, 'unit.id') === id);
  const records = staffWorkItems(activity, user?.id, activity.entries).filter(task => number && task.unit.split(', ').includes(number));
  const related = [...new Map(records.filter(task => task.entry.action).map(task => [task.entry.web, task])).values()];
  const history = records.filter(task => ['COMPLETED', 'RESOLVED'].includes(task.status) && !task.entry.action)
    .sort((left, right) => (Date.parse(right.entry.at) || 0) - (Date.parse(left.entry.at) || 0)).slice(0, 5);

  return <Modal title={number || 'Chi tiết kho'} onClose={onClose} className="staff-unit-dialog" footer={<button type="button" className="button-secondary" onClick={onClose}>Đóng</button>}>
    <div className="staff-unit-detail">
      <Facts items={[
        ['Trạng thái', <Status key="status" value={first(item, 'storageUnit.status')} />],
        ['Loại kho', unitType(item) || '—'],
        ['Vị trí', location(item) || '—'],
        ['Người phân công', first(item, 'assignedBy.fullName') || '—'],
        ['Ngày phân công', date(first(item, 'assignedAt'), true)],
      ]} />
      {(isOccupied || currentRental) && <section>
        <h3>Kỳ thuê hiện tại</h3>
        <LoadState loading={rental.loading} error={rental.error} retry={rental.refresh} />
        {currentRental && contract ? <><Facts items={[
          ['Khách thuê', first(currentRental, 'customer.fullName')],
          ['Thời hạn', `${date(first(contract, 'startDate'))} – ${date(first(contract, 'endDate'))}`],
        ]} /><Link className="button-secondary" to={`/staff/rentals/${encodeURIComponent(first(currentRental, 'reservationId'))}`}>Xem hồ sơ thuê</Link></> :
          !rental.loading && !rental.error && <p>Chưa có hồ sơ thuê hiện tại trong danh sách tra cứu.</p>}
      </section>}
      <section>
        <h3>Công việc đang chờ</h3>
        {related.length ? <ul className="staff-unit-work">
          {related.map(task => <li key={task.entry.id}><Link to={task.entry.web}>{task.title}</Link><Status value={task.status} /></li>)}
        </ul> : <p>{activity.checking ? 'Đang tải công việc…' : activity.failed.length ? 'Chưa tải đủ công việc.' : 'Không có công việc đang chờ cho kho này.'}</p>}
      </section>
      {history.length > 0 && <DetailDisclosure title="Xử lý gần đây">
        <ul className="staff-unit-work">
          {history.map(task => <li key={task.entry.id}>
            <Link to={task.entry.web}>{staffSourceNames.get(task.entry.kind) ?? task.title}</Link>
            <small>{date(task.entry.at, true)}</small>
            <Status value={task.status} />
          </li>)}
        </ul>
      </DetailDisclosure>}
    </div>
  </Modal>;
}

export function StaffAssignedUnitsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const source = useApiResource<{ enabled: boolean; items: Row[] }>('/staff/assigned-units', user?.id ?? '', true);
  const selected = source.data?.items.find(item => first(item, 'storageUnit.id') === params.get('unit'));
  const search = params.get('search') ?? '';
  const limit = staffTaskPageSize(params);
  const items = (source.data?.items ?? []).filter(item =>
    normalizeSearch([unitNumber(item), unitType(item), location(item)].join(' ')).includes(normalizeSearch(search)));
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(items.length / limit)));
  function change(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key === 'search' || key === 'limit') next.delete('page');
      return next;
    }, { replace: true });
  }
  const columns: StaffColumn<Row>[] = [
    { key: 'unit', label: 'Mã kho', cell: row => <strong>{unitNumber(row)}</strong> },
    { key: 'type', label: 'Loại kho', cell: row => unitType(row) || '—' },
    { key: 'location', label: 'Vị trí', cell: row => location(row) || '—' },
    { key: 'status', label: 'Trạng thái', cell: row => <Status value={first(row, 'storageUnit.status')} /> },
    { key: 'assigner', label: 'Người phân công', cell: row => first(row, 'assignedBy.fullName') || '—' },
    { key: 'action', label: 'Thao tác', cell: row => <button type="button" className="button-secondary" aria-label={`Xem chi tiết kho ${unitNumber(row)}`}
      onClick={() => change('unit', first(row, 'storageUnit.id'))}>Xem chi tiết</button> },
  ];
  return <section className="staff-assigned-units">
    <PageHeader title="Kho tôi phụ trách">
      <button type="button" className="button-secondary" onClick={source.refresh} disabled={source.loading || source.refreshing}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={source.refreshing} />
    </PageHeader>
    {source.data?.enabled && <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm kho<input type="search" placeholder="Mã kho, loại kho, vị trí…" value={search} onChange={event => change('search', event.target.value)} /></label>
    </div>}
    <LoadState loading={source.loading} error={source.error} retry={source.refresh}
      placeholder={<StaffTaskTable title="Kho tôi phụ trách" columns={columns} items={[]} rowKey={row => first(row, 'id')} loadingRows={5} />} />
    {source.data?.enabled === false && <Empty title="Phân công theo kho chưa được bật" description="Xem các hồ sơ được giao tại Công việc của tôi." />}
    {source.data?.enabled && (items.length ? <>
      <StaffTaskTable title="Kho tôi phụ trách" columns={columns} items={items.slice((page - 1) * limit, page * limit)} rowKey={row => first(row, 'id')} />
      <StaffTaskPagination page={page} limit={limit} total={items.length}
        onChange={value => change('page', String(value))} onLimitChange={value => change('limit', String(value))} />
    </> : <Empty title={search ? 'Không tìm thấy kho phù hợp' : 'Chưa có kho được phân công'}
      description={search ? 'Thử mã kho, loại kho hoặc vị trí khác.' : 'Các kho quản lý phân công sẽ hiển thị tại đây.'} />)}
    {selected && <AssignedUnitDetail key={first(selected, 'id')} item={selected} onClose={() => change('unit', '')} />}
  </section>;
}
