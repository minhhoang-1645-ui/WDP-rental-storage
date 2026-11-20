import { ArrowRight, CalendarClock, ClipboardList, ClockAlert, Package, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date } from '../../components/manager/portal-data';
import { LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DashboardSkeleton } from '../../components/LoadingSkeleton';
import { staffDay, staffDayAfter } from './staff-resources';
import { staffActivityReady, staffActivitySources, staffWorkItems } from './staff-work';

const taskPath = '/staff/tasks';
const overdueHandoverPath = taskPath + '?type=appointments&status=CONFIRMED&timing=overdue';
const previewSize = 5;

function WorkPanel({ title, to, empty, loading, count, children }: {
  title: string; to: string; empty: string; loading: boolean; count: number; children: ReactNode;
}) {
  return <section className="staff-work-panel" aria-label={title} aria-busy={loading}>
    <header>
      <h2>{title}</h2>
      <Link to={to} aria-label={`Xem tất cả · ${title}`}>Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    {loading ? <DashboardSkeleton variant="activity" /> : count ? <ul className="staff-task-list">{children}</ul> : <p className="staff-panel-empty">{empty}</p>}
  </section>;
}

function WorkRow({ to, title, details, time, status, action, onOpen }: {
  to: string; title: string; details: string; time?: string; status: ReactNode; action: string; onOpen?: () => void;
}) {
  return <li>
    <Link to={to} onClick={onOpen}>
      <span className="staff-task-copy"><strong>{title}</strong>{details && <span>{details}</span>}{time && <small>{time}</small>}</span>
      {status}
      <span className="staff-task-action">{action}<ArrowRight size={15} aria-hidden="true" /></span>
    </Link>
  </li>;
}

export function StaffOperationsPage() {
  const activity = useActivity();
  const { user } = useAuth();
  const loading = activity.loading && activity.checking;
  const complete = staffActivitySources.every(source => staffActivityReady(activity, source.kind));
  const failedSources = activity.failed;
  const handoversReady = staffActivityReady(activity, 'appointments');
  const stockReady = staffActivityReady(activity, 'stock-movements');
  const tasks = staffWorkItems(activity, user?.id);
  const [openedAt] = useState(Date.now);
  const today = staffDay(activity.checkedAt || openedAt);
  const through = staffDayAfter(today, 7);
  const appointments = tasks.filter(task => task.entry.kind === 'appointments' && task.status === 'CONFIRMED' && Number.isFinite(Date.parse(task.scheduledAt)));
  const upcomingAppointments = appointments.filter(task => {
    const day = staffDay(task.scheduledAt);
    return day >= today && day <= through;
  })
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const todayAppointments = upcomingAppointments.filter(task => staffDay(task.scheduledAt) === today);
  const lateAppointments = appointments.filter(task => task.overdue);
  const todayPath = `/staff/appointments?status=CONFIRMED&date=${today}`;
  const upcomingPath = '/staff/appointments?' + new URLSearchParams({ status: 'CONFIRMED', from: today, through });
  const shownElsewhere = new Set(upcomingAppointments.slice(0, previewSize).map(task => task.entry.web));
  const priority = tasks.filter(task => !shownElsewhere.has(task.entry.web))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority);
  const metrics = [
    { title: 'Việc cần làm', value: complete ? tasks.length : '—', icon: ClipboardList, to: taskPath },
    { title: 'Bàn giao hôm nay', value: handoversReady ? todayAppointments.length : '—', icon: CalendarClock, to: todayPath },
    { title: 'Phiếu nhập – xuất đang chờ', value: stockReady ? tasks.filter(task => task.entry.kind === 'stock-movements').length : '—', icon: Package, to: '/staff/stock-movements?status=ASSIGNED' },
    { title: 'Bàn giao quá giờ', value: handoversReady ? lateAppointments.length : '—', icon: ClockAlert, to: overdueHandoverPath },
  ];

  return <section className="staff-dashboard">
    <PageHeader title="Bàn làm việc">
      <button type="button" className="button-secondary" disabled={activity.checking} onClick={activity.refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={activity.checking && !loading} />
    </PageHeader>
    <LoadState loading={false} error={failedSources.length ? `Chưa tải được ${failedSources.join(', ')}.` : ''} retry={activity.refresh} />
    <div className="staff-metrics" aria-label="Chỉ số công việc" aria-busy={loading}>
      {metrics.map(({ title, value, icon: Icon, to }) => loading ?
        <DashboardSkeleton key={title} variant="metric" cardClass="staff-metric" /> :
        <Link className="staff-metric" to={to} key={title}>
          <span className="staff-metric-heading"><span>{title}</span><Icon size={19} aria-hidden="true" /></span>
          <strong>{value}</strong>
        </Link>)}
    </div>
    <div className="staff-dashboard-panels">
      <WorkPanel title="Công việc ưu tiên" to={taskPath} empty={!complete ? 'Chưa tải đủ công việc.' : tasks.length ? 'Các việc cần xử lý nằm trong lịch sắp tới.' : 'Không có việc cần xử lý.'} loading={loading} count={priority.length}>
        {priority.slice(0, previewSize).map(task => <WorkRow key={task.entry.id} to={task.entry.web}
          title={[task.customer, task.unit].filter(Boolean).join(' · ') || task.title}
          details={task.customer || task.unit ? task.title : ''} time={task.timestamp ? date(task.timestamp, true) : undefined}
          status={task.overdue ? <Status value="OVERDUE" text="Đã quá giờ" /> : <Status value={task.status} />} action="Xem chi tiết" onOpen={() => activity.markRead([task.entry.token])} />)}
      </WorkPanel>
      <WorkPanel title="Lịch sắp tới" to={upcomingPath} empty={handoversReady ? 'Không có lịch bàn giao trong khoảng này.' : 'Chưa tải được lịch bàn giao.'} loading={loading} count={upcomingAppointments.length}>
        {upcomingAppointments.slice(0, previewSize).map(task => <WorkRow key={task.entry.id} to={task.entry.web}
          title={task.customer || task.unit || 'Lịch bàn giao'}
          details={task.customer ? task.unit : ''} time={date(task.scheduledAt, true)}
          status={task.overdue ? <Status value="OVERDUE" text="Đã quá giờ" /> : <Status value={task.status} />} action="Xem lịch" onOpen={() => activity.markRead([task.entry.token])} />)}
      </WorkPanel>
    </div>
  </section>;
}
