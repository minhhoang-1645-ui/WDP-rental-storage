import { RefreshCw } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date, label } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffRowActions, StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { staffSourceNames, staffWorkItems } from './staff-work';
import { staffTaskPageSize } from '../../utils/internal-pagination';
import { normalizeSearch } from '../../utils/notification-tools';

export function StaffTasksPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const loading = activity.loading && activity.checking;
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  useLayoutEffect(() => { pendingParams.current = params; }, [params]);
  const search = params.get('search') ?? '';
  const requestedType = params.get('type') ?? '';
  const type = staffSourceNames.has(requestedType) ? requestedType : '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const priority = params.get('priority') ?? '';
  const overdue = params.get('timing') === 'overdue';
  const limit = staffTaskPageSize(params);
  function applyParams(next: URLSearchParams) {
    pendingParams.current = next;
    setParams(next, { replace: true });
  }

  function change(key: string, value: string) {
    const next = new URLSearchParams(pendingParams.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'type') {
      next.delete('status');
      next.delete('priority');
      next.delete('timing');
    }
    applyParams(next);
  }
  const tasks = staffWorkItems(activity, user?.id);
  const byType = tasks.filter(task => !type || task.entry.kind === type);
  const statuses = [...new Set(byType.map(task => task.status).filter(Boolean))];
  const priorities = [...new Set(byType.map(task => task.priority).filter(Boolean))];
  const keyword = normalizeSearch(search);
  const filtered = byType.filter(task => (!status || task.status === status) &&
    (!priority || task.priority === priority) && (!overdue || task.overdue) &&
    normalizeSearch([task.entry.code, task.title, task.customer, task.unit].join(' ')).includes(keyword));
  filtered.sort((a, b) => {
    if (!sort) return Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority || Number(b.assigned) - Number(a.assigned);
    const aDate = Date.parse(a.timestamp), bDate = Date.parse(b.timestamp);
    if (!Number.isFinite(aDate)) return Number.isFinite(bDate) ? 1 : 0;
    if (!Number.isFinite(bDate)) return -1;
    return sort === 'asc' ? aDate - bDate : bDate - aDate;
  });
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(filtered.length / limit)));
  const columns: StaffColumn<(typeof tasks)[number]>[] = [
    { key: 'task', label: 'Công việc', cell: task => <><strong>{task.title}</strong><CopyRecordCode value={task.entry.code} /></> },
    { key: 'identity', label: 'Khách hàng / Kho', cell: task => <><strong>{task.customer || task.unit || '—'}</strong>{task.customer && task.unit && <small>Kho {task.unit}</small>}</> },
    { key: 'date', label: 'Lịch / cập nhật', sort: { direction: sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'asc' ? 'desc' : 'asc') },
      cell: task => <><span>{date(task.timestamp, true)}</span>{task.overdue && <small className="staff-table-overdue">Đã qua giờ</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: task => task.status ? <Status value={task.status} /> : '—' },
    { key: 'priority', label: 'Ưu tiên', optional: true, cell: task => task.priority ? <Status value={task.priority} /> : '—' },
    { key: 'actions', label: 'Thao tác', cell: task => <StaffRowActions to={task.entry.web} code={task.entry.code} startLabel={task.entry.kind === 'damage-claims' || task.entry.kind === 'support-requests' ? undefined :
        ['IN_PROGRESS', 'CONTACTED', 'IN_REVIEW', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(task.status) ? 'Tiếp tục xử lý' : 'Bắt đầu xử lý'} onOpen={() => activity.markRead([task.entry.token])} /> },
  ];
  return <section>
    <PageHeader title="Công việc của tôi">
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={activity.refresh}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={activity.checking && !loading} />
    </PageHeader>
    <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm công việc<input type="search" maxLength={100} placeholder="Mã hồ sơ, khách hàng, kho…" value={search} onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Loại công việc<select value={type} onChange={event => change('type', event.target.value)}>
        <option value="">Tất cả</option>{[...staffSourceNames].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label className="field-label">Trạng thái<select value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      <label className="field-label">Ưu tiên<select value={priority} onChange={event => change('priority', event.target.value)}>
        <option value="">Tất cả</option>{priorities.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      {overdue && <label className="portal-checkbox"><input type="checkbox" checked onChange={() => change('timing', '')} />Đã quá giờ</label>}
      {(type || status || search || sort || priority || overdue) && <button type="button" className="button-secondary" onClick={() => applyParams(new URLSearchParams(limit === 20 ? {} : { limit: String(limit) }))}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={false} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
    {(loading || filtered.length > 0) && <StaffTaskTable title="Danh sách công việc" columns={columns} items={filtered.slice((page - 1) * limit, page * limit)}
      rowKey={task => task.entry.id} emphasized={task => task.overdue || task.priority === 'HIGH'} loadingRows={loading ? Math.min(limit, 6) : undefined} />}
    {!loading && (filtered.length ?
      <StaffTaskPagination page={page} limit={limit} total={filtered.length} onChange={value => change('page', String(value))}
        onLimitChange={value => change('limit', String(value))} /> : !activity.failed.length && <Empty title="Không có công việc phù hợp" />)}
  </section>;
}
