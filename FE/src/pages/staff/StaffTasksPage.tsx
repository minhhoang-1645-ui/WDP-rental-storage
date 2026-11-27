import { DatePicker, DateRangePicker } from '../../components/workspace/DateTimeFields';
import { WorkSummary } from '../../components/workspace/WorkSummary';
import { ApiError } from '../../services/api';
import { RefreshCw } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { date, label } from '../../components/manager/portal-data';
import { Empty, LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { StaffTaskPagination, StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { handoverStatusText } from './staff-appointment';
import { staffFacilityMessage, useStaffFacility } from './staff-facility';
import { missedScheduleHelp, staffActivityReady, staffActivitySources, staffInProgress, staffSourceNames, staffWorkItems, staffWorkPhase } from './staff-work';
import { staffDay } from './staff-resources';
import { DEFAULT_PAGE_SIZE, internalPageSize } from '../../utils/internal-pagination';
import { mutate } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { normalizeSearch } from '../../utils/notification-tools';

const queueNames = {
  appointments: 'Bàn giao kho', returns: 'Kiểm tra trả kho', transfers: 'Chuyển kho', 'support-requests': 'Hỗ trợ khách hàng',
};
type QueueItem = { kind: keyof typeof queueNames; id: string; code: string; reference: string; customerHint?: string; unit?: string; destinationUnit?: string; scheduledAt?: string; priority?: string };

const queueKey = (item: QueueItem) => item.kind + ':' + item.id;

function StaffQueue({ data, available, scheduled, busy, onClaim }: {
  data: ReturnType<typeof useApiResource<{ items: QueueItem[] }>>;
  available: QueueItem[]; scheduled: boolean; busy: string; onClaim: (item: QueueItem) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [appointmentDay, setAppointmentDay] = useState('');
  const [priority, setPriority] = useState('');
  const priorities = [...new Set(available.flatMap(item => item.priority ? [item.priority] : []))];
  const keyword = normalizeSearch(search);
  const items = available.filter(item => (!kind || item.kind === kind) &&
    (!appointmentDay || staffDay(item.scheduledAt) === appointmentDay) && (!priority || item.priority === priority) &&
    normalizeSearch([queueNames[item.kind], item.code, item.reference, item.unit, item.destinationUnit, item.customerHint].join(' ')).includes(keyword));
  const size = DEFAULT_PAGE_SIZE;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / size)));
  const columns: StaffColumn<QueueItem>[] = [
    { key: 'task', label: 'Công việc', cell: item => <><strong>{queueNames[item.kind]}</strong><CopyRecordCode value={item.code} showLabel={false} /></> },
    { key: 'record', label: 'Mã kho / Hồ sơ', cell: item => <>
      <strong>{[item.unit, item.destinationUnit].filter(Boolean).join(' → ') || '—'}</strong>
      <small>{[item.customerHint, item.reference].filter(Boolean).join(' · ')}</small>
    </> },
    { key: 'schedule', label: 'Lịch hẹn', cell: item => item.scheduledAt ? date(item.scheduledAt, true) : '—' },
    ...(priorities.length ? [{ key: 'priority', label: 'Ưu tiên', cell: (item: QueueItem) => item.priority ? label(item.priority) : '—' }] : []),
    { key: 'status', label: 'Trạng thái', cell: item => scheduled
      ? item.scheduledAt && Date.parse(item.scheduledAt) > Date.now() ? 'Sắp đến giờ hẹn' : 'Trong lịch hôm nay'
      : 'Chờ tiếp nhận' },
    ...(!scheduled ? [{ key: 'action', label: 'Thao tác', cell: (item: QueueItem) => <button type="button" className="button-secondary"
      disabled={Boolean(busy) || data.refreshing} onClick={() => onClaim(item)}>
      {busy === item.kind + ':' + item.id ? 'Đang nhận…' : 'Nhận việc'}
    </button> }] : []),
  ];
  const title = scheduled ? 'Lịch phục vụ của cơ sở hôm nay' : 'Chờ tiếp nhận';
  const filtered = Boolean(search || kind || appointmentDay || priority);
  return <section className="staff-queue">
    <LoadState loading={false} error={data.error} retry={data.refresh} />
    <StaffTaskTable title={title} columns={columns} items={items.slice((currentPage - 1) * size, currentPage * size)}
      toolbar={<div className="portal-toolbar staff-table-toolbar">
        <label className="field-label portal-search">Tìm trong {scheduled ? 'lịch phục vụ' : 'hàng chờ'}
          <input type="search" value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Mã hồ sơ hoặc kho…" />
        </label>
        {!scheduled && <>
          <label className="field-label">Loại công việc<select value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>
            <option value="">Tất cả</option>{Object.entries(queueNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select></label>
          <DatePicker label="Ngày hẹn" value={appointmentDay} onChange={value => { setAppointmentDay(value); setPage(1); }} />
          {(priorities.length > 0 || priority) && <label className="field-label">Ưu tiên<select value={priority}
            onChange={event => { setPriority(event.target.value); setPage(1); }}>
            <option value="">Tất cả</option>{(priorities.includes(priority) || !priority ? priorities : [...priorities, priority])
              .map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select></label>}
          {filtered && <button type="button" className="button-secondary" onClick={() => {
            setPage(1); setSearch(''); setKind(''); setAppointmentDay(''); setPriority('');
          }}>Xóa bộ lọc</button>}
        </>}
      </div>}
      rowKey={queueKey} loadingRows={data.loading ? 3 : undefined} hideTable={Boolean(data.error) || !items.length} />
    {!data.loading && !data.error && !items.length && <Empty title={filtered ? 'Không tìm thấy công việc phù hợp'
      : scheduled ? 'Chưa có lịch phục vụ hôm nay' : 'Chưa có việc chờ tiếp nhận'}
      description={filtered ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'
        : scheduled ? 'Các lịch phục vụ của cơ sở sẽ xuất hiện tại đây.' : 'Công việc đủ điều kiện tự nhận sẽ xuất hiện tại đây.'} />}
    {items.length > size && <StaffTaskPagination page={currentPage} limit={size} total={items.length} onChange={setPage} />}
  </section>;
}

export function StaffTasksPage({ view = 'tasks' }: { view?: 'tasks' | 'schedule' | 'history' }) {
  const {user}=useAuth();
  const activity = useActivity();
  const scope = useStaffFacility(user?.id);
  const facilityId = scope.facility?.id;
  const loading = activity.loading && activity.checking;
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  const scheduled = view === 'schedule';
  const completed = view === 'history' || (view === 'tasks' && params.get('view') === 'completed');
  const main = view === 'tasks' && !completed;
  const tab = params.get('tab') === 'queue' ? 'queue' : 'mine';
  const queue = useApiResource<{ items: QueueItem[] }>(
    !completed && facilityId && user ? `/staff/assignment-queue${scheduled ? '?view=schedule' : ''}` : null,
    [user?.id, facilityId].join(':'), true);
  const [claimed, setClaimed] = useState<{ item: QueueItem; facilityId: string; beforeClaim: typeof queue.data }>();
  const [claimError, setClaimError] = useState('');
  const [busy, setBusy] = useState('');
  const claimLock = useRef(false);
  const available = (queue.data?.items ?? []).filter(item => !claimed || claimed.facilityId !== facilityId
    || claimed.beforeClaim !== queue.data || queueKey(claimed.item) !== queueKey(item));

  async function claim(item: QueueItem) {
    if (claimLock.current || !facilityId) return;
    claimLock.current = true;
    setBusy(queueKey(item));
    setClaimError('');
    setClaimed(undefined);
    try {
      await mutate(`/staff/assignment-queue/${item.kind}/${encodeURIComponent(item.id)}/claim`, 'PATCH', {});
      setClaimed({ item, facilityId, beforeClaim: queue.data });
    } catch (caught) {
      setClaimError(caught instanceof ApiError && caught.status === 409
        ? 'Công việc vừa thay đổi hoặc đã có người nhận. Hàng chờ đang được cập nhật.'
        : caught instanceof Error ? caught.message : 'Không thể nhận việc.');
    } finally {
      queue.refresh();
      activity.refresh();
      setBusy('');
      claimLock.current = false;
    }
  }
  useLayoutEffect(() => { pendingParams.current = params; }, [params]);
  const search = params.get('search') ?? '';
  const requestedType = params.get('type') ?? '';
  const type = staffSourceNames.has(requestedType) ? requestedType : '';
  const title = scheduled ? 'Lịch phục vụ' : completed ? 'Lịch sử công việc' : 'Công việc';
  const status = requestedType === 'reservations' ? '' : params.get('status') ?? '';
  const sort = params.get('sort') ?? (scheduled ? 'asc' : completed ? 'desc' : '');
  const priority = params.get('priority') ?? '';
  const overdue = params.get('timing') === 'overdue';
  const phase = params.get('phase') ?? '';
  const scheduledDay = params.get('date') ?? '';
  const from = scheduled ? params.get('from') ?? '' : '';
  const through = scheduled ? params.get('through') ?? '' : '';
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
      if (key === 'view') next.delete('phase');
    }
    applyParams(next);
  }
  const tasks = (scheduled
    ? [...new Map([...staffWorkItems(activity, user?.id, true), ...staffWorkItems(activity, user?.id)]
      .map(task => [task.entry.id, task])).values()]
    : staffWorkItems(activity, user?.id, completed))
    .filter(task => facilityId && task.facilityId === facilityId && (!scheduled || staffDay(task.scheduledAt)));
  const staffDataReady = !loading && !staffActivitySources.some(source => !staffActivityReady(activity, source.kind));
  const history = main && staffDataReady ? staffWorkItems(activity, user?.id, true) : [];
  const today = staffDay(activity.checkedAt);
  const completedToday = history.filter(task => task.facilityId === facilityId && task.actualCompletionAt
    && staffDay(task.actualCompletionAt) === today).length;
  const byType = tasks.filter(task => !type || task.entry.kind === type);
  const statuses = [...new Set(byType.map(task => task.status).filter(Boolean))];
  const priorities = [...new Set(byType.map(task => task.priority).filter(Boolean))];
  const keyword = normalizeSearch(search);
  const displayedTime = (task: (typeof tasks)[number]) => completed ? task.finishedAt : scheduled ? task.scheduledAt : task.timestamp;
  const filtered = byType.filter(task => (!status || task.status === status) &&
    (!scheduledDay || staffDay(task.scheduledAt) === scheduledDay) &&
    (!from || staffDay(task.scheduledAt) >= from) && (!through || staffDay(task.scheduledAt) <= through) &&
    (completed || !phase || staffWorkPhase(task) === phase) &&
    (!priority || task.priority === priority) && (!overdue || task.overdue) &&
    normalizeSearch([task.entry.code, task.reference, task.contractCode, task.title, task.customer, task.unit, task.facilityName].join(' ')).includes(keyword));
  filtered.sort((a, b) => {
    if (!sort) return Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority;
    const aDate = Date.parse(displayedTime(a)), bDate = Date.parse(displayedTime(b));
    if (!Number.isFinite(aDate)) return Number.isFinite(bDate) ? 1 : 0;
    if (!Number.isFinite(bDate)) return -1;
    return sort === 'asc' ? aDate - bDate : bDate - aDate;
  });
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(filtered.length / limit)));
  const columns: StaffColumn<(typeof tasks)[number]>[] = [
    { key: 'task', label: 'Công việc', cell: task => <><strong>{task.title}</strong><CopyRecordCode value={task.entry.code} showLabel={!main} />
      {task.facilityName && <small>{task.facilityName}</small>}
      {task.blocked && task.blockingReason && <small>{task.blockingReason}</small>}</> },
    { key: 'identity', label: 'Mã kho / Khách hàng', cell: task => <><strong>{task.unit || task.customer || '—'}</strong>{task.customer && task.unit && <small>{task.customer}</small>}</> },
    { key: 'date', label: completed ? 'Thời điểm xử lý' : scheduled ? 'Lịch hẹn' : 'Lịch / cập nhật', sort: { direction: sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none', toggle: () => change('sort', sort === 'asc' ? 'desc' : 'asc') },
      cell: task => <><span>{date(displayedTime(task), true)}</span>{!completed && task.overdue && <small className="staff-table-overdue">Qua giờ hẹn</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: task => task.status ? <Status value={task.status} text={
      task.blocked ? 'Chưa đủ điều kiện bàn giao'
        : task.waiting && !completed ? task.waitReason === 'CUSTOMER' ? 'Chờ khách hàng' : task.waitReason === 'SCHEDULE' ? 'Chờ đến lịch hẹn' : 'Chờ quản lý xử lý'
        : task.entry.kind === 'appointments' ? handoverStatusText(task.status) : undefined
    } /> : '—' },
    { key: 'actions', label: 'Thao tác', cell: task => {
      if (completed || !task.actionable || task.entry.kind === 'damage-claims') {
        return <Link className="button-secondary" to={task.entry.web}>Xem hồ sơ</Link>;
      }
      const inProgress = staffInProgress(task.status);
      return <Link className="button-secondary" to={task.entry.web + '#staff-processing'} onClick={() => activity.markRead([task.entry.token])}>
        {inProgress ? 'Tiếp tục xử lý' : 'Bắt đầu xử lý'}
      </Link>;
    } },
  ];
  const hasFilters = Boolean(type || status || search || params.has('sort') || priority || overdue || scheduledDay || phase || from || through);
  return <section className={main ? 'staff-work-page' : undefined}>
    <PageHeader title={title}>
      {!main && <Link className="button-secondary" to="/staff/policies">Tra cứu chính sách</Link>}
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={() => { activity.refresh(); queue.refresh(); }}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={activity.checking && !loading} />
    </PageHeader>
    <LoadState loading={scope.loading} error={scope.error} retry={scope.refresh} />
    {staffFacilityMessage(scope) && <Empty title={staffFacilityMessage(scope)} description="Liên hệ quản trị viên để kiểm tra quyền cơ sở." />}
    {scope.facility && <>
    <p className="staff-facility-label">{scope.facility.name}</p>
    {main && <>
      <WorkSummary metrics={[
        { label: 'Chờ tiếp nhận', value: queue.data && !queue.error ? available.length : undefined },
        { label: 'Việc của tôi chưa hoàn tất', value: staffDataReady ? tasks.length : undefined },
        { label: 'Hoàn thành hôm nay', value: staffDataReady ? completedToday : undefined },
      ]} />
      {claimed && claimed.facilityId === facilityId && <p className="portal-success" role="status">
        Đã nhận việc {claimed.item.code}. <Link to={`/staff/${claimed.item.kind}/${encodeURIComponent(claimed.item.id)}`}>Mở hồ sơ</Link>
      </p>}
      {claimError && <p className="booking-alert is-error" role="alert">{claimError}</p>}
      <div className="work-view-switch" role="group" aria-label="Danh sách công việc">
        <button type="button" aria-pressed={tab === 'queue'} onClick={() => change('tab', 'queue')}>Chờ tiếp nhận</button>
        <button type="button" aria-pressed={tab === 'mine'} onClick={() => change('tab', '')}>Việc của tôi</button>
      </div>
    </>}
    {(!completed && scheduled || main && tab === 'queue') && <StaffQueue key={facilityId + ':' + scheduled}
      data={queue} available={available} scheduled={scheduled} busy={busy} onClaim={item => void claim(item)} />}
    {(!main || tab === 'mine') && <>
    <div className="portal-toolbar staff-table-toolbar">
      <label className="field-label portal-search">Tìm công việc<input type="search" maxLength={100} placeholder="Mã hồ sơ, khách hàng, kho…" value={search} onChange={event => change('search', event.target.value)} /></label>
      <label className="field-label">Loại công việc<select value={type} onChange={event => change('type', event.target.value)}>
        <option value="">Tất cả</option>{[...staffSourceNames].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
      {(!scheduled || scheduledDay) && <DatePicker label="Ngày hẹn" value={scheduledDay} onChange={value => change('date', value)} />}
      {scheduled && !scheduledDay && <>
        <DateRangePicker from={{ label: 'Từ ngày', value: from, onChange: value => change('from', value) }}
          to={{ label: 'Đến ngày', value: through, onChange: value => change('through', value) }} />
      </>}
      {!completed && <label className="field-label">Tiến độ<select value={phase} onChange={event => change('phase', event.target.value)}>
        <option value="">Tất cả</option><option value="pending">Chờ thực hiện</option><option value="progress">Đang thực hiện</option>
        <option value="blocked">Chưa đủ điều kiện</option><option value="waiting">Đang chờ</option>
        {scheduled && <option value="completed">Đã xử lý</option>}
      </select></label>}
      <label className="field-label">Trạng thái<select value={status} onChange={event => change('status', event.target.value)}>
        <option value="">Tất cả</option>{statuses.map(value => <option key={value} value={value}>{type === 'appointments' ? handoverStatusText(value) ?? label(value) : label(value)}</option>)}
      </select></label>
      <label className="field-label">Ưu tiên<select value={priority} onChange={event => change('priority', event.target.value)}>
        <option value="">Tất cả</option>{priorities.map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      {!completed && <label className="portal-checkbox"><input type="checkbox" checked={overdue} onChange={event => change('timing', event.target.checked ? 'overdue' : '')}  aria-describedby="staff-overdue-help" />Qua giờ hẹn</label>}
      {hasFilters && <button type="button" className="button-secondary" onClick={() => {
        const next = new URLSearchParams();
        if (completed && view === 'tasks') next.set('view', 'completed');
        if (limit !== DEFAULT_PAGE_SIZE) next.set('limit', String(limit));
        applyParams(next);
      }}>Xóa bộ lọc</button>}
    </div>
    {!completed && <p id="staff-overdue-help" className="staff-filter-help">{missedScheduleHelp}</p>}
    <LoadState loading={false} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
    {(loading || filtered.length > 0) && <StaffTaskTable title="Danh sách công việc" columns={columns} items={filtered.slice((page - 1) * limit, page * limit)} rowDetail={task => ({ to: task.entry.web, label: `Xem chi tiết ${task.title.toLocaleLowerCase('vi')} ${task.entry.code}` })}
      rowKey={task => task.entry.id} emphasized={task => task.overdue || task.priority === 'HIGH'} loadingRows={loading ? Math.min(limit, 6) : undefined} />}
    {!loading && (filtered.length ?
      <StaffTaskPagination page={page} limit={limit} total={filtered.length} onChange={value => change('page', String(value))}
        onLimitChange={value => change('limit', String(value))} /> : !activity.failed.length && <Empty title={hasFilters
          ? 'Không tìm thấy công việc phù hợp' : completed ? 'Chưa có công việc đã xử lý' : scheduled ? 'Chưa có công việc có lịch hẹn' : 'Không có công việc cần xử lý'}
        description={hasFilters ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.' : 'Công việc sẽ xuất hiện khi có hồ sơ phù hợp.'} />)}
    </>}
    </>}
  </section>;
}
