import { ArrowRight, CalendarClock, ClipboardList, ClockAlert, Package, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { activitySources, activityText, staffPriorityActivities, type ActivityEntry, type ActivityRow } from '../../utils/activity';
import { date } from '../../components/manager/portal-data';
import { PageHeader, Status } from '../../components/manager/PortalUi';
import { OverstayNotice } from '../../components/workspace/OverstayNotice';
import { staffDay } from './staff-resources';

const sources = activitySources('STAFF');
const sourceNames = new Map(sources.map(source => [source.kind, source.title]));
const actionPath = '/staff/tasks';

type Task = {
  entry: ActivityEntry;
  customer: string;
  unit: string;
  status: string;
  scheduledAt: string;
  pastSchedule: boolean;
  assigned: boolean;
};

function WorkPanel({ title, entries, to, empty, loading, incomplete, onRead }: {
  title: string;
  entries: Task[];
  to: string;
  empty: string;
  loading: boolean;
  incomplete: boolean;
  onRead: (tokens: string[]) => void;
}) {
  return <section className="staff-work-panel" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <Link to={to}>Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    {loading && <p className="staff-panel-empty" role="status">Đang tải công việc…</p>}
    {!loading && entries.length === 0 && <p className="staff-panel-empty">{incomplete ? 'Chưa tải đủ dữ liệu.' : empty}</p>}
    <ul className="staff-task-list">
      {entries.slice(0, 5).map(({ entry, customer, unit, status, scheduledAt, pastSchedule }) => {
        const Icon = entry.kind === 'appointments' ? CalendarClock : entry.kind === 'stock-movements' ? Package : ClipboardList;
        return <li key={entry.id}>
          <Link to={entry.web} onClick={() => onRead([entry.token])}>
            <span className="staff-task-icon"><Icon size={18} aria-hidden="true" /></span>
            <span className="staff-task-copy">
              <strong>{sourceNames.get(entry.kind) ?? entry.title}</strong>
              <span>{[customer, unit].filter(Boolean).join(' · ') || entry.code}</span>
              {scheduledAt ? <small className={pastSchedule ? 'staff-late-time' : undefined}>{pastSchedule ? 'Đã qua giờ · ' : ''}{date(scheduledAt, true)}</small> : (customer || unit) && <small>{entry.code}</small>}
            </span>
            {status && <Status value={status} />}
            <ArrowRight className="staff-task-arrow" size={16} aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}

export function StaffOperationsPage() {
  const activity = useActivity();
  const { user } = useAuth();
  const ready = (kind: string) => !activity.loading && Boolean(activity.data[kind]) &&
    !activity.failed.includes(sourceNames.get(kind) ?? '') && !activity.failed.includes('Kết nối mạng');
  const complete = sources.every(source => ready(source.kind));
  const now = activity.checkedAt;
  const records = new Map<string, ActivityRow>(Object.entries(activity.data).flatMap(([kind, rows]) =>
    rows.map(row => [`${kind}:${activityText(row, 'id')}`, row] as const)));
  const queue = staffPriorityActivities(activity.entries).map(entry => {
    const row = records.get(entry.id) ?? {};
    const get = (key: string) => activityText(row, key);
    return {
      entry,
      customer: get('customer.fullName') || get('reservation.customer.fullName') || get('fullName'),
      unit: get('storageUnit.unitCode') || get('storageUnit.unitNumber') || get('unit.unitCode') ||
        get('allocatedUnits.0.unitCode') || get('unitCodeSnapshot'),
      status: get('status'),
      scheduledAt: get('scheduledAt'),
      pastSchedule: entry.kind === 'appointments' && get('status') === 'CONFIRMED' && Date.parse(get('scheduledAt')) < now,
      assigned: Boolean(user?.id) && get('assignedStaff.id') === user?.id,
    };
  });
  const today = staffDay(now);
  const handovers = queue.filter(task => task.entry.kind === 'appointments' && task.status === 'CONFIRMED' && Number.isFinite(Date.parse(task.scheduledAt)));
  const overdue = handovers.filter(task => Date.parse(task.scheduledAt) < now);
  const upcoming = handovers.filter(task => Date.parse(task.scheduledAt) >= now)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const priority = [...new Map([
    ...overdue,
    ...queue.filter(task => task.entry.priority === 0),
    ...upcoming,
    ...queue.filter(task => task.assigned && ['support-requests', 'maintenance'].includes(task.entry.kind)),
  ].map(task => [task.entry.id, task])).values()];
  const priorityPreview = priority.slice(0, 5);
  const priorityIds = new Set(priorityPreview.map(task => task.entry.id));
  const myWork = queue.filter(task => !priorityIds.has(task.entry.id)).sort((a, b) => Number(b.assigned) - Number(a.assigned));
  const appointmentsPath = '/staff/appointments?status=CONFIRMED';
  const metrics = [
    { title: 'Việc cần làm', value: complete ? queue.length : '—', icon: ClipboardList, to: actionPath, hint: 'Hồ sơ bạn có thể xử lý' },
    { title: 'Bàn giao hôm nay', value: ready('appointments') ? handovers.filter(task => staffDay(task.scheduledAt) === today).length : '—', icon: CalendarClock, to: `${appointmentsPath}&date=${today}`, hint: 'Lịch đã xác nhận' },
    { title: 'Phiếu nhập – xuất', value: ready('stock-movements') ? queue.filter(task => task.entry.kind === 'stock-movements').length : '—', icon: Package, to: '/staff/stock-movements?status=ASSIGNED', hint: 'Phiếu được giao đang chờ xử lý' },
    { title: 'Bàn giao đã qua giờ', value: ready('appointments') ? overdue.length : '—', icon: ClockAlert, to: appointmentsPath, hint: 'Lịch xác nhận chưa hoàn tất' },
  ];

  return <section className="staff-dashboard">
    <PageHeader title="Bàn làm việc">
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={activity.refresh}>
        <RefreshCw size={16} />{activity.checking ? 'Đang tải…' : 'Làm mới'}
      </button>
    </PageHeader>
    {activity.failed.length > 0 && <p className="booking-alert is-error" role="alert">Chưa tải được {activity.failed.join(', ')}. Hãy làm mới để cập nhật số liệu.</p>}
    <div className="staff-metrics" aria-label="Chỉ số công việc" aria-busy={activity.loading}>
      {metrics.map(({ title, value, icon: Icon, to, hint }) => <Link className="staff-metric" to={to} key={title}>
        <span className="staff-metric-heading"><span>{title}</span><Icon size={19} aria-hidden="true" /></span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </Link>)}
    </div>
    <div className="staff-dashboard-panels">
      <WorkPanel title="Công việc của tôi" entries={myWork} to={actionPath} empty={queue.length ? 'Các việc hiện có nằm trong danh sách ưu tiên.' : 'Bạn đã xử lý hết công việc hiện có.'} loading={activity.loading} incomplete={!complete} onRead={activity.markRead} />
      <WorkPanel title="Lịch & việc ưu tiên" entries={priorityPreview} to={actionPath} empty="Chưa có lịch bàn giao hoặc công việc ưu tiên." loading={activity.loading} incomplete={!complete} onRead={activity.markRead} />
    </div>
    <OverstayNotice />
  </section>;
}
