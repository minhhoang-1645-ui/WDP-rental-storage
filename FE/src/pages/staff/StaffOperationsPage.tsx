import { ArrowRight, CalendarClock, ClipboardList, ClockAlert, Play, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date } from '../../components/manager/portal-data';
import { LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DashboardSkeleton } from '../../components/LoadingSkeleton';
import { staffDay, staffDayAfter } from './staff-resources';
import { staffActivityReady, staffActivitySources, staffWorkItems, staffWorkPhase } from './staff-work';
import { handoverStatusText } from './staff-appointment';

const taskPath = '/staff/tasks';
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
  const tasks = staffWorkItems(activity, user?.id);
  const recent = staffWorkItems(activity, user?.id, true).filter(task => task.processed)
    .sort((a, b) => (Date.parse(b.finishedAt) || 0) - (Date.parse(a.finishedAt) || 0)).slice(0, previewSize);
  const [openedAt] = useState(Date.now);
  const today = staffDay(activity.checkedAt || openedAt);
  const through = staffDayAfter(today, 7);
  const appointments = tasks.filter(task => Number.isFinite(Date.parse(task.scheduledAt)));
  const upcomingAppointments = appointments.filter(task => {
    const day = staffDay(task.scheduledAt);
    return day >= today && day <= through;
  })
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const todayTasks = tasks.filter(task => staffDay(task.scheduledAt) === today);
  const upcomingPreview = upcomingAppointments.filter(task => !task.overdue).slice(0, previewSize);
  const todayPath = `/staff/schedule?date=${today}`;
  const upcomingPath = '/staff/schedule?' + new URLSearchParams({ from: today, through });
  const shownElsewhere = new Set(upcomingPreview.map(task => task.entry.web));
  const priority = tasks.filter(task => !shownElsewhere.has(task.entry.web))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority);
  const metrics = [
    { title: 'Chờ thực hiện', value: complete ? tasks.filter(task => staffWorkPhase(task) === 'pending').length : '—', icon: ClipboardList, to: taskPath + '?phase=pending' },
    { title: 'Có lịch hôm nay', value: complete ? todayTasks.length : '—', icon: CalendarClock, to: todayPath },
    { title: 'Đang thực hiện', value: complete ? tasks.filter(task => staffWorkPhase(task) === 'progress').length : '—', icon: Play, to: taskPath + '?phase=progress' },
    { title: 'Quá giờ', value: complete ? tasks.filter(task => task.overdue).length : '—', icon: ClockAlert, to: taskPath + '?timing=overdue' },
  ];

  return <section className="staff-dashboard">
    <PageHeader title="Tổng quan">
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
          status={task.blocked ? <Status value={task.status} text="Chưa đủ điều kiện bàn giao" /> : task.waiting ? <Status value={task.status} text="Chờ quản lý xử lý" /> : task.overdue ? <Status value="OVERDUE" text="Đã quá giờ" /> :
            <Status value={task.status} text={task.entry.kind === 'appointments' ? handoverStatusText(task.status) : undefined} />}
          action="Xem công việc" onOpen={() => activity.markRead([task.entry.token])} />)}
      </WorkPanel>
      <WorkPanel title="Lịch sắp tới" to={upcomingPath} empty={complete ? 'Không có lịch sắp tới.' : 'Chưa tải đủ dữ liệu lịch.'} loading={loading} count={upcomingPreview.length}>
        {upcomingPreview.map(task => <WorkRow key={task.entry.id} to={task.entry.web}
          title={task.customer || task.unit || task.title}
          details={task.customer ? task.unit : ''} time={date(task.scheduledAt, true)}
          status={<Status value={task.status} text={task.blocked ? 'Chưa đủ điều kiện bàn giao' : task.waiting ? 'Chờ quản lý xử lý' : task.entry.kind === 'appointments' ? handoverStatusText(task.status) : undefined} />} action="Xem lịch" onOpen={() => activity.markRead([task.entry.token])} />)}
      </WorkPanel>
    </div>
    <WorkPanel title="Vừa xử lý" to="/staff/history" empty={complete ? 'Chưa có công việc đã xử lý.' : 'Chưa tải đủ lịch sử.'} loading={loading} count={recent.length}>
      {recent.map(task => <WorkRow key={task.entry.id} to={task.entry.web} title={task.title}
        details={[task.entry.code, task.unit, task.facilityName].filter(Boolean).join(' · ')}
        time={task.finishedAt ? date(task.finishedAt, true) : undefined}
        status={<Status value={task.status} text={task.entry.kind === 'appointments' ? handoverStatusText(task.status) : undefined} />}
        action="Xem kết quả" />)}
    </WorkPanel>
  </section>;
}
