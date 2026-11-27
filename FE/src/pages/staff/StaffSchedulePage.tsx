import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { Empty, LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { DatePicker } from '../../components/workspace/DateTimeFields';
import { StaffTaskTable, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { ApiError } from '../../services/api';
import { mutate } from '../../services/portal';
import { useApiResource } from '../../services/useApiResource';
import { normalizeSearch } from '../../utils/notification-tools';
import { staffFacilityMessage, useStaffFacility } from './staff-facility';
import { staffDay, staffDayAfter } from './staff-resources';
import './staff-schedule.css';

const kinds = { appointments: 'Bàn giao kho', returns: 'Kiểm tra trả kho', transfers: 'Chuyển kho' };
const ownership = { unassigned: 'Chưa có người phụ trách', mine: 'Tôi phụ trách', other: 'Nhân viên khác phụ trách' };
const weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateLabel = (day: string) => day.split('-').reverse().join('/');
const validDay = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : '';
};

type AgendaItem = {
  id: string; kind: keyof typeof kinds; code: string; reference: string; scheduledAt: string;
  status: string; inProgress: boolean; customer: string; assignee: string | null; ownership: keyof typeof ownership;
  units: { unitNumber: string; storageType: { name: string } }[];
};
const keyOf = (item: { kind: string; id: string }) => item.kind + ':' + item.id;

function scheduleStatus(item: AgendaItem) {
  if (item.status === 'COMPLETED') return 'Hoàn tất';
  if (item.status === 'CANCELLED') return 'Đã hủy';
  if (item.status === 'REJECTED') return 'Đã từ chối';
  if (item.kind === 'transfers') return item.status === 'APPROVED' ? 'Đã duyệt chuyển kho · Giờ đề xuất' : 'Giờ đề xuất · Chờ duyệt';
  if (item.kind === 'appointments') return item.status === 'REQUESTED' ? 'Chờ xác nhận lịch' : 'Đã xác nhận lịch';
  return 'Đã lên lịch kiểm tra';
}

export function StaffSchedulePage() {
  const { user } = useAuth();
  const activity = useActivity();
  const scope = useStaffFacility(user?.id);
  const facility = scope.facility;
  const [now, setNow] = useState(Date.now);
  const today = staffDay(now);
  const [params, setParams] = useSearchParams();
  const day = validDay(params.get('date')) || validDay(params.get('from')) || today;
  function setSelected(value: string) {
    const next = new URLSearchParams(params);
    next.delete('from');
    next.delete('through');
    if (validDay(value)) next.set('date', value);
    else next.delete('date');
    setParams(next, { replace: true });
  }
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  const monday = staffDayAfter(day, -((weekday + 6) % 7));
  const week = weekdays.map((_, offset) => staffDayAfter(monday, offset));
  const query = new URLSearchParams({ from: monday + 'T00:00:00+07:00', to: staffDayAfter(monday, 7) + 'T00:00:00+07:00' });
  const identity = [user?.id, facility?.id].join(':');
  const agenda = useApiResource<{ facilityId: string; items: AgendaItem[] }>(facility ? '/staff/service-calendar?' + query : null, identity, true);
  const items = agenda.data && agenda.data.facilityId === facility?.id ? agenda.data.items : [];
  const daily = items.filter(item => staffDay(item.scheduledAt) === day);
  const queue = useApiResource<{ items: { kind: string; id: string }[] }>(
    facility && daily.some(item => item.ownership === 'unassigned' && Date.parse(item.scheduledAt) <= now
      && (item.status === 'CONFIRMED' || item.status === 'APPROVED' || item.kind === 'returns' && item.status === 'REQUESTED'))
      ? '/staff/assignment-queue' : null, identity, true);
  const refreshAgenda = agenda.refresh;
  const refreshQueue = queue.refresh;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      refreshAgenda();
      refreshQueue();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshAgenda, refreshQueue]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  const claimLock = useRef(false);
  const ready = new Set((queue.error ? [] : queue.data?.items ?? []).map(keyOf));
  const claimable = new Set(daily.filter(item => item.ownership === 'unassigned' && Date.parse(item.scheduledAt) <= now
    && ready.has(keyOf(item))).map(keyOf));
  async function claim(item: AgendaItem) {
    if (claimLock.current || !claimable.has(keyOf(item))) return;
    claimLock.current = true;
    setBusy(keyOf(item));
    setFeedback(undefined);
    try {
      await mutate(`/staff/assignment-queue/${item.kind}/${encodeURIComponent(item.id)}/claim`, 'PATCH', {});
      setFeedback({ message: 'Đã nhận việc ' + item.code + '.', error: false });
    } catch (error) {
      setFeedback({ message: error instanceof ApiError && error.status === 409
        ? 'Công việc vừa thay đổi hoặc đã có người nhận. Lịch đang được cập nhật.'
        : error instanceof Error ? error.message : 'Không thể nhận việc.', error: true });
    } finally {
      refreshAgenda();
      refreshQueue();
      activity.refresh();
      setBusy('');
      claimLock.current = false;
    }
  }
  const keyword = normalizeSearch(search);
  const filtered = daily.filter(item => (!kind || item.kind === kind) && (!owner || item.ownership === owner)
    && normalizeSearch([item.customer, item.code, item.reference, ...item.units.map(unit => unit.unitNumber)].join(' ')).includes(keyword));
  const columns: StaffColumn<AgendaItem>[] = [
    { key: 'time', label: 'Giờ hẹn', cell: item => <strong>{time.format(new Date(item.scheduledAt))}</strong> },
    { key: 'record', label: 'Lịch hẹn / Hồ sơ', cell: item => <><strong>{kinds[item.kind]}</strong>
      <small>{item.code} · {item.reference}</small></> },
    { key: 'customer', label: 'Khách hàng / Kho', cell: item => <>
      <strong>{item.units.map(unit => unit.unitNumber).join(item.kind === 'transfers' ? ' → ' : ', ') || 'Chưa xác định kho'}</strong>
      <small>{[item.customer, ...new Set(item.units.map(unit => unit.storageType.name))].filter(Boolean).join(' · ')}</small>
    </> },
    { key: 'assignee', label: 'Người phụ trách', cell: item => <>{item.assignee || ownership.unassigned}
      {item.assignee && <small>{ownership[item.ownership]}</small>}</> },
    { key: 'status', label: 'Trạng thái', cell: item => {
      const awaiting = claimable.has(keyOf(item)) && item.ownership === 'unassigned';
      const missed = Date.parse(item.scheduledAt) < now && !item.inProgress
        && (item.kind === 'appointments' && item.status === 'CONFIRMED' || item.kind === 'returns' && item.status === 'REQUESTED');
      return <><Status value={item.status} text={scheduleStatus(item)} />
        {item.inProgress && <small>Đang thực hiện</small>}
        {awaiting && <small>Chờ Staff tiếp nhận</small>}
        {missed && <small className="staff-table-overdue">Qua giờ hẹn, chưa xử lý</small>}</>;
    } },
    { key: 'action', label: 'Thao tác', cell: item => {
      if (item.ownership === 'mine') return <Link className="button-secondary" to={`/staff/${item.kind}/${encodeURIComponent(item.id)}`}>Xem hồ sơ</Link>;
      if (item.ownership === 'unassigned' && claimable.has(keyOf(item))) return <button type="button" className="button-secondary"
        disabled={Boolean(busy) || agenda.refreshing || queue.refreshing} onClick={() => void claim(item)}>
        {busy === keyOf(item) ? 'Đang nhận…' : 'Nhận việc'}</button>;
      return '—';
    } },
  ];
  const counts = new Map<string, number>();
  for (const item of items) {
    const itemDay = staffDay(item.scheduledAt);
    counts.set(itemDay, (counts.get(itemDay) ?? 0) + 1);
  }
  return <section className="staff-schedule-page">
    <PageHeader title="Lịch phục vụ" description="Theo dõi lịch hẹn và phục vụ khách hàng tại cơ sở." meta={facility?.name}>
      <button type="button" className="button-secondary" disabled={scope.loading || agenda.loading || agenda.refreshing}
        onClick={() => { scope.refresh(); refreshAgenda(); refreshQueue(); setNow(Date.now()); }}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    <LoadState loading={scope.loading} error={scope.error} retry={scope.refresh} />
    {staffFacilityMessage(scope) && <Empty title={staffFacilityMessage(scope)} description="Liên hệ quản trị viên để kiểm tra quyền cơ sở." />}
    {facility && <>
      <div className="staff-schedule-week">
        <div className="staff-schedule-navigation">
          <button type="button" className="button-secondary" onClick={() => { setNow(Date.now()); setSelected(''); }}>Hôm nay</button>
          <div role="group" aria-label="Chuyển tuần">
            <button type="button" className="button-secondary" aria-label="Tuần trước" onClick={() => setSelected(staffDayAfter(day, -7))}><ChevronLeft size={18} /></button>
            <strong>{dateLabel(monday)} – {dateLabel(week[6])}</strong>
            <button type="button" className="button-secondary" aria-label="Tuần sau" onClick={() => setSelected(staffDayAfter(day, 7))}><ChevronRight size={18} /></button>
          </div>
          <DatePicker label="Chọn ngày" value={day} onChange={setSelected} />
        </div>
        <div className="staff-schedule-days" role="group" aria-label="Các ngày trong tuần">
          {week.map((date, index) => <button key={date} type="button" aria-pressed={date === day}
            aria-current={date === today ? 'date' : undefined} onClick={() => setSelected(date)}>
            <span>{weekdays[index]}</span><strong>{dateLabel(date).slice(0, 5)}</strong>
            {date === today && <small>Hôm nay</small>}
            {agenda.data && <small>{counts.get(date) ?? 0} lịch</small>}
          </button>)}
        </div>
      </div>
      <div className="staff-schedule-filters">
        <label className="field-label">Tìm lịch hẹn<input type="search" maxLength={100} value={search}
          onChange={event => setSearch(event.target.value)} placeholder="Khách hàng, mã kho hoặc mã hồ sơ" /></label>
        <label className="field-label">Loại lịch hẹn<select value={kind} onChange={event => setKind(event.target.value)}>
          <option value="">Tất cả</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field-label">Người phụ trách<select value={owner} onChange={event => setOwner(event.target.value)}>
          <option value="">Tất cả</option><option value="unassigned">Chưa tiếp nhận</option>
          <option value="mine">Việc của tôi</option><option value="other">Nhân viên khác</option>
        </select></label>
      </div>
      {feedback && <p className={feedback.error ? 'booking-alert is-error' : 'portal-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      <LoadState loading={agenda.loading} error={agenda.error} retry={refreshAgenda} />
      {queue.error && <LoadState loading={false} error={queue.error} retry={refreshQueue} />}
      {agenda.data?.facilityId === facility.id && (filtered.length
        ? <StaffTaskTable title={`Lịch ngày ${dateLabel(day)}`} columns={columns} items={filtered} rowKey={keyOf} />
        : <div className="staff-schedule-empty" role="status"><CalendarDays size={25} aria-hidden="true" />
          <h2>{daily.length ? 'Không tìm thấy lịch phù hợp' : 'Không có lịch phục vụ'}</h2>
          <p>{daily.length ? 'Thử thay đổi bộ lọc hoặc từ khóa.' : 'Không có lịch hẹn trong ngày đã chọn.'}</p>
        </div>)}
    </>}
  </section>;
}
