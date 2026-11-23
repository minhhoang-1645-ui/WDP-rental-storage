import { RefreshCw } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date, first, label, type Row } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { handoverStatusText } from './staff-appointment';
import { staffSourceNames, staffWorkItems } from './staff-work';
import { DEFAULT_PAGE_SIZE, internalPageSize } from '../../utils/internal-pagination';
import { normalizeSearch } from '../../utils/notification-tools';
import { useApiResource } from '../../services/useApiResource';

export function StaffTasksPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const responsibility = useApiResource<{ enabled: boolean; items: Row[] }>('/staff/assigned-units', user?.id, true);
  const units = responsibility.data?.items.map(row => ({ id: first(row, 'storageUnit.id'), number: first(row, 'storageUnit.unitNumber') })) ?? [];
  const loading = activity.loading && activity.checking;
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  useLayoutEffect(() => { pendingParams.current = params; }, [params]);
  const search = params.get('search') ?? '';
  const requestedType = params.get('type') ?? '';
  const type = staffSourceNames.has(requestedType) ? requestedType : '';
  const completed = params.get('view') === 'completed';
  const status = requestedType === 'reservations' ? '' : params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const priority = params.get('priority') ?? '';
  const overdue = params.get('timing') === 'overdue';
  const limit = internalPageSize(params);
  function applyParams(next: URLSearchParams) {
    pendingParams.current = next;
    setParams(next, { replace: true });
  }

  function change(key: string, value: string) {
    const next = new URLSearchParams(pendingParams.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'type' || key === 'view') {
      next.delete('status');
      next.delete('priority');
      next.delete('timing');
    }
    applyParams(next);
  }
  const tasks = staffWorkItems(activity, user?.id, completed)
    .filter(task => !completed || task.processed);
  const byType = tasks.filter(task => !type || task.entry.kind === type);
  const statuses = [...new Set(byType.map(task => task.status).filter(Boolean))];
  const priorities = [...new Set(byType.map(task => task.priority).filter(Boolean))];
  const keyword = normalizeSearch(search);
  const filtered = byType.filter(task => (!status || task.status === status) &&
    (!priority || task.priority === priority) && (!overdue || task.overdue) &&
    normalizeSearch([task.entry.code, task.title, task.customer, task.unit].join(' ')).includes(keyword));
  filtered.sort((a, b) => {
    if (!sort) return Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority;
    const aDate = Date.parse(a.timestamp), bDate = Date.parse(b.timestamp);
    if (!Number.isFinite(aDate)) return Number.isFinite(bDate) ? 1 : 0;
    if (!Number.isFinite(bDate)) return -1;
    return sort === 'asc' ? aDate - bDate : bDate - aDate;
  });
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(filtered.length / limit)));
  const columns: StaffColumn<(typeof tasks)[number]>[] = [
    { key: 'task', label: 'Công việc', cell: task => <><strong>{task.title}</strong><CopyRecordCode value={task.entry.code} />
      <small>{units.some(task.matchesUnit) ? 'Liên quan kho phụ trách' : 'Theo phân công nhiệm vụ'}</small></> },
    { key: 'identity', label: 'Khách hàng / Kho', cell: task => <><strong>{task.customer || task.unit || '—'}</strong>{task.customer && task.unit && <small>Kho {task.unit}</small>}</> },
    { key: 'date', label: 'Lịch / cập nhật', sort: { direction: sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'asc' ? 'desc' : 'asc') },
      cell: task => <><span>{date(task.timestamp, true)}</span>{task.overdue && <small className="staff-table-overdue">Đã qua giờ</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: task => task.status ? <Status value={task.status} text={task.entry.kind === 'appointments' ? handoverStatusText(task.status) : undefined} /> : '—' },
    { key: 'actions', label: 'Thao tác', cell: task => {
      if (!task.entry.action || task.entry.kind === 'damage-claims' || task.entry.kind === 'support-requests') return null;
      const inProgress = ['IN_PROGRESS', 'CONTACTED', 'IN_REVIEW', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(task.status);
      return <Link className="button-secondary" to={task.entry.web + '#staff-processing'} onClick={() => activity.markRead([task.entry.token])}>
        {inProgress ? 'Tiếp tục xử lý' : 'Bắt đầu xử lý'}
      </Link>;
    } },
  ];
  return <section>
    <PageHeader title="Công việc của tôi">
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={() => { activity.refresh(); responsibility.refresh(); }}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={activity.checking && !loading} />
    </PageHeader>
    <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label">Phạm vi<select aria-label="Phạm vi công việc" value={completed ? 'completed' : ''} onChange={event => change('view', event.target.value)}>
        <option value="">Cần xử lý</option><option value="completed">Đã xử lý</option>
      </select></label>
      <label className="field-label portal-search">Tìm công việc<input type="search" maxLength={100} placeholder="Mã hồ sơ, khách hàng, kho…" value={search} onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Loại công việc<select value={type} onChange={event => change('type', event.target.value)}>
        <option value="">Tất cả</option>{[...staffSourceNames].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      <label className="field-label">Trạng thái<select value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{statuses.map(value => <option key={value} value={value}>{type === 'appointments' ? handoverStatusText(value) ?? label(value) : label(value)}</option>)}
      </select></label>
      <label className="field-label">Ưu tiên<select value={priority} onChange={event => change('priority', event.target.value)}>
        <option value="">Tất cả</option>{priorities.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      {overdue && <label className="portal-checkbox"><input type="checkbox" checked onChange={() => change('timing', '')} />Đã quá giờ</label>}
      {(type || status || search || sort || priority || overdue) && <button type="button" className="button-secondary" onClick={() => {
        const next = new URLSearchParams();
        if (completed) next.set('view', 'completed');
        if (limit !== DEFAULT_PAGE_SIZE) next.set('limit', String(limit));
        applyParams(next);
      }}>Xóa bộ lọc</button>}
    </div>
    <LoadState loading={false} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
    {(loading || filtered.length > 0) && <StaffTaskTable title="Danh sách công việc" columns={columns} items={filtered.slice((page - 1) * limit, page * limit)} rowDetail={task => ({ to: task.entry.web, label: `Xem chi tiết ${task.title.toLocaleLowerCase('vi')} ${task.entry.code}` })}
      rowKey={task => task.entry.id} emphasized={task => task.overdue || task.priority === 'HIGH'} loadingRows={loading ? Math.min(limit, 6) : undefined} />}
    {!loading && (filtered.length ?
      <StaffTaskPagination page={page} limit={limit} total={filtered.length} onChange={value => change('page', String(value))}
        onLimitChange={value => change('limit', String(value))} /> : !activity.failed.length && <Empty title={type || status || search || priority || overdue
          ? 'Không tìm thấy công việc phù hợp' : completed ? 'Chưa có công việc đã xử lý' : 'Không có công việc cần xử lý'} />)}
  </section>;
}
