import { ArrowRight, RefreshCw } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { date, first, type Row } from '../../components/manager/portal-data';
import { Empty, Facts, LoadState, Modal, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { internalPageSize } from '../../utils/internal-pagination';
import { normalizeSearch } from '../../utils/notification-tools';
import { staffWorkItems } from './staff-work';

const unitNumber = (row: Row) => first(row, 'storageUnit.unitNumber');
const unitType = (row: Row) => first(row, 'storageUnit.storageType.name');
const location = (row: Row) => [first(row, 'storageUnit.floor'), first(row, 'storageUnit.zone')].filter(Boolean).join(' · ');

function AssignedUnitDetail({ item, onClose }: { item: Row; onClose: () => void }) {
  const { user } = useAuth();
  const activity = useActivity();
  const { pathname, search, hash } = useLocation();
  const number = unitNumber(item);
  const id = first(item, 'storageUnit.id');
  const unitStatus = first(item, 'storageUnit.status');
  const finished = (status: string) => Number(['COMPLETED', 'RESOLVED'].includes(status));
  const tasks = staffWorkItems(activity, user?.id, true, { id, number });
  const related = [...new Map(tasks.map(task => [task.entry.web, task])).values()].sort((left, right) =>
    Number(right.entry.action) - Number(left.entry.action) || finished(left.status) - finished(right.status)
    || (Date.parse(right.entry.at) || 0) - (Date.parse(left.entry.at) || 0)
    || left.entry.id.localeCompare(right.entry.id));
  const loadingWork = activity.loading && activity.checking;
  const workError = activity.failed.length ? 'Chưa tải đủ công việc tại kho.' : '';
  const facts: Array<[string, string]> = [
    ['Loại kho', unitType(item) || '—'],
    ['Vị trí', location(item) || '—'],
    ['Người phân công', first(item, 'assignedBy.fullName') || '—'],
    ['Ngày phân công', date(first(item, 'assignedAt'))],
  ];

  return <Modal title={number || 'Chi tiết kho'} titleBadge={unitStatus && <Status value={unitStatus} />}
    onClose={onClose} className="staff-unit-dialog" footer={<button type="button" className="button-secondary" onClick={onClose}>Đóng</button>}>
    <div className="staff-unit-detail">
      <Facts items={facts} />
      <section>
        <h3>Công việc tại kho</h3>
        <LoadState loading={loadingWork} error={workError} retry={activity.refresh}
          placeholder={<p role="status">Đang tải công việc…</p>} />
        {related.length > 0 && <ul className="staff-unit-work">
          {related.map(task => <li key={task.entry.id}>
            <div>
              <strong>{task.title}</strong><Status value={task.status} />
              {task.scheduledAt ? <small>{date(task.scheduledAt, true)}</small>
                : task.entry.id !== `${task.entry.kind}:${task.entry.code}` && <small>{task.entry.code}</small>}
            </div>
            <Link to={task.entry.web} state={{ returnTo: pathname + search + hash }}
              aria-label={`Xem công việc ${task.title.toLocaleLowerCase('vi')} · ${task.entry.code}`}>
              Xem công việc <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>)}
        </ul>}
        {!loadingWork && !workError && related.length === 0 && <p>Chưa có công việc cần xử lý.</p>}
      </section>
    </div>
  </Modal>;
}

export function StaffAssignedUnitsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const source = useApiResource<{ enabled: boolean; items: Row[] }>('/staff/assigned-units', user?.id ?? '', true);
  const selectedId = params.get('unit');
  const selected = source.data?.items.find(item => first(item, 'storageUnit.id') === selectedId);
  const search = params.get('search') ?? '';
  const limit = internalPageSize(params);
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
  ];
  return <section className="staff-assigned-units">
    <PageHeader title="Kho tôi phụ trách">
      <button type="button" className="button-secondary" onClick={source.refresh} disabled={source.loading || source.refreshing}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={source.refreshing} />
    </PageHeader>
    {source.data?.enabled && <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm kho<input type="search" placeholder="Tìm mã kho, loại kho hoặc vị trí..." value={search} onChange={event => change('search', event.target.value)} /></label>
    </div>}
    <LoadState loading={source.loading} error={source.error} retry={source.refresh}
      placeholder={<StaffTaskTable title="Kho tôi phụ trách" columns={columns} items={[]} rowKey={row => first(row, 'id')} loadingRows={5} />} />
    {source.data?.enabled && selectedId && !selected && <div className="booking-alert" role="status">
      Kho không thuộc danh sách bạn phụ trách.
      <button type="button" className="button-secondary" onClick={() => change('unit', '')}>Đóng</button>
    </div>}
    {source.data?.enabled === false && <Empty title="Phân công theo kho chưa được bật" description="Xem các hồ sơ được giao tại Công việc của tôi." />}
    {source.data?.enabled && (items.length ? <>
      <StaffTaskTable title="Kho tôi phụ trách" columns={columns} items={items.slice((page - 1) * limit, page * limit)} rowKey={row => first(row, 'id')} rowDetail={row => ({ open: () => change('unit', first(row, 'storageUnit.id')), label: `Mở hồ sơ kho ${unitNumber(row)}` })} />
      <StaffTaskPagination page={page} limit={limit} total={items.length}
        onChange={value => change('page', String(value))} onLimitChange={value => change('limit', String(value))} />
    </> : <Empty title={search ? 'Không tìm thấy kho phù hợp' : 'Chưa có kho được phân công'}
      description={search ? 'Thử mã kho, loại kho hoặc vị trí khác.' : 'Các kho quản lý phân công sẽ hiển thị tại đây.'} />)}
    {selected && <AssignedUnitDetail key={first(selected, 'id')} item={selected} onClose={() => change('unit', '')} />}
  </section>;
}
