import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date, label } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffRowActions, StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { activitySources, activityText, staffPriorityActivities, type ActivityRow } from '../../utils/activity';
import { staffTaskPageSize } from '../../utils/internal-pagination';
import { normalizeSearch } from '../../utils/notification-tools';

const sourceNames = new Map(activitySources('STAFF').map(source => [source.kind, source.title]));

export function StaffTasksPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const limit = staffTaskPageSize(params);
  function change(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      if (key === 'type') next.delete('status');
      return next;
    }, { replace: true });
  }
  const records = new Map<string, ActivityRow>(Object.entries(activity.data).flatMap(([kind, rows]) =>
    rows.map(row => [`${kind}:${activityText(row, 'id')}`, row] as const)));
  const tasks = staffPriorityActivities(activity.entries).map(entry => {
    const row = records.get(entry.id) ?? {};
    const get = (key: string) => activityText(row, key);
    const schedule = get('dueAt') || get('scheduledAt');
    const currentStatus = get('status');
    return {
      entry, title: sourceNames.get(entry.kind) ?? entry.title, status: currentStatus,
      customer: get('customer.fullName') || get('reservation.customer.fullName') || get('fullName'),
      unit: get('currentStorageUnit.unitNumber') || get('storageUnit.unitNumber') || get('storageUnit.unitCode') ||
        get('unit.unitCode') || get('allocatedUnits.0.unitCode') || get('unitCodeSnapshot'),
      priority: get('priority'), schedule, timestamp: schedule || entry.at,
      assigned: Boolean(user?.id && get('assignedStaff.id') === user.id),
      overdue: (entry.kind === 'appointments' && currentStatus === 'CONFIRMED' || Boolean(get('dueAt'))) &&
        Date.parse(schedule) < activity.checkedAt,
    };
  });
  const statuses = [...new Set(tasks.filter(task => !type || task.entry.kind === type).map(task => task.status).filter(Boolean))];
  const filtered = tasks.filter(task => (!type || task.entry.kind === type) && (!status || task.status === status) &&
    normalizeSearch([task.entry.code, task.title, task.customer, task.unit].join(' ')).includes(normalizeSearch(search)));
  filtered.sort((a, b) => {
    if (!sort) return Number(b.assigned) - Number(a.assigned) || Number(b.overdue) - Number(a.overdue);
    const aDate = Date.parse(a.timestamp), bDate = Date.parse(b.timestamp);
    if (!Number.isFinite(aDate)) return Number.isFinite(bDate) ? 1 : 0;
    if (!Number.isFinite(bDate)) return -1;
    return sort === 'asc' ? aDate - bDate : bDate - aDate;
  });
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(filtered.length / limit)));
  const columns: StaffColumn<(typeof tasks)[number]>[] = [
    { key: 'task', label: 'Công việc', cell: task => <><strong>{task.title}</strong><CopyRecordCode value={task.entry.code} /></> },
    { key: 'identity', label: 'Khách hàng / Kho', cell: task => <><strong>{task.customer || '—'}</strong>{task.unit && <small>Kho {task.unit}</small>}</> },
    { key: 'date', label: 'Lịch / cập nhật', sort: { direction: sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'asc' ? 'desc' : 'asc') },
      cell: task => <><span>{date(task.timestamp, true)}</span>{task.overdue && <small className="staff-table-overdue">Đã qua giờ</small>}{!task.schedule && task.timestamp && <small>Cập nhật</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: task => task.status ? <Status value={task.status} /> : '—' },
    { key: 'priority', label: 'Ưu tiên', optional: true, cell: task => task.priority ? <Status value={task.priority} /> : '—' },
    { key: 'assignee', label: 'Phân công', optional: true, cell: task => task.assigned ? 'Được giao cho tôi' : '—' },
    { key: 'actions', label: 'Thao tác', cell: task => <StaffRowActions to={task.entry.web} code={task.entry.code} onOpen={() => activity.markRead([task.entry.token])} /> },
  ];
  return <section>
    <PageHeader title="Công việc của tôi">
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={activity.refresh}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm công việc<input type="search" maxLength={100} placeholder="Mã hồ sơ, khách hàng, kho…" value={search} onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Loại công việc<select value={type} onChange={event => change('type', event.target.value)}>
        <option value="">Tất cả</option>{[...sourceNames].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label className="field-label">Trạng thái<select value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      {(type || status || search || sort) && <button type="button" className="button-secondary" onClick={() => setParams(limit === 20 ? {} : { limit: String(limit) }, { replace: true })}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={activity.loading} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
    {!activity.loading && (filtered.length ? <>
      <StaffTaskTable title="Danh sách công việc" columns={columns} items={filtered.slice((page - 1) * limit, page * limit)}
        rowKey={task => task.entry.id} emphasized={task => task.overdue || task.priority === 'HIGH'} />
      <StaffTaskPagination page={page} limit={limit} total={filtered.length} onChange={value => change('page', String(value))}
        onLimitChange={value => change('limit', String(value))} />
    </> : !activity.failed.length && <Empty title="Không có công việc phù hợp" />)}
  </section>;
}
