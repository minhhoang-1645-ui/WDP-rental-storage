import { ArrowRight, CalendarClock, ClipboardList, ClockAlert, Package, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useActivity } from '../../activity/context';
import { useAuth } from '../../auth/auth-context';
import { date } from '../../components/manager/portal-data';
import { LoadState, PageHeader, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DashboardSkeleton } from '../../components/LoadingSkeleton';
import { staffDay } from './staff-resources';
import { staffActivityReady, staffActivitySources, staffWorkItems } from './staff-work';
import { staffOverstayPath, staffOverstayTarget, useStaffOverstays } from './staff-overstays';
import { StaffOverstayStatus } from './StaffOverstayPage';

const taskPath = '/staff/tasks';
const overdueHandoverPath = taskPath + '?type=appointments&status=CONFIRMED&timing=overdue';
const timeOfDay = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

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

function WorkRow({ to, title, details, time, status, onOpen }: {
  to: string; title: string; details: string; time?: string; status: ReactNode; onOpen?: () => void;
}) {
  return <li>
    <Link to={to} onClick={onOpen}>
      <span className="staff-task-copy"><strong>{title}</strong>{details && <span>{details}</span>}{time && <small>{time}</small>}</span>
      {status}
      <ArrowRight className="staff-task-arrow" size={16} aria-hidden="true" />
    </Link>
  </li>;
}

export function StaffOperationsPage() {
  const activity = useActivity();
  const { user } = useAuth();
  const overstays = useStaffOverstays();
  const loading = activity.loading && activity.checking;
  const complete = staffActivitySources.every(source => staffActivityReady(activity, source.kind));
  const handoversReady = staffActivityReady(activity, 'appointments');
  const stockReady = staffActivityReady(activity, 'stock-movements');
  const tasks = staffWorkItems(activity, user?.id);
  const [openedAt] = useState(Date.now);
  const today = staffDay(activity.checkedAt || openedAt);
  const appointments = tasks.filter(task => task.entry.kind === 'appointments' && task.status === 'CONFIRMED' && Number.isFinite(Date.parse(task.scheduledAt)));
  const todayAppointments = appointments.filter(task => staffDay(task.scheduledAt) === today)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const lateAppointments = appointments.filter(task => task.overdue);
  const todayPath = `/staff/appointments?status=CONFIRMED&date=${today}`;
  const shownToday = new Set(todayAppointments.slice(0, 5).map(task => task.entry.id));
  const priority = tasks.filter(task => task.overdue || !shownToday.has(task.entry.id)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.entry.priority - b.entry.priority || Number(b.assigned) - Number(a.assigned));
  const overdueUnits = overstays.data?.items ?? [];
  const metrics = [
    { title: 'Việc cần làm', value: complete ? tasks.length : '—', icon: ClipboardList, to: taskPath },
    { title: 'Bàn giao hôm nay', value: handoversReady ? todayAppointments.length : '—', icon: CalendarClock, to: todayPath },
    { title: 'Phiếu nhập – xuất đang chờ', value: stockReady ? tasks.filter(task => task.entry.kind === 'stock-movements').length : '—', icon: Package, to: '/staff/stock-movements?status=ASSIGNED' },
    { title: 'Bàn giao quá giờ', value: handoversReady ? lateAppointments.length : '—', icon: ClockAlert, to: overdueHandoverPath },
  ];

  function refresh() {
    activity.refresh();
    overstays.refresh();
  }

  return <section className="staff-dashboard">
    <PageHeader title="Bàn làm việc">
      <button type="button" className="button-secondary" disabled={activity.checking || overstays.refreshing} onClick={refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <RefreshStatus active={(activity.checking && !loading) || overstays.refreshing} />
    </PageHeader>
    <LoadState loading={false} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
    <div className="staff-metrics" aria-label="Chỉ số công việc" aria-busy={loading}>
      {metrics.map(({ title, value, icon: Icon, to }) => loading ?
        <DashboardSkeleton key={title} variant="metric" cardClass="staff-metric" /> :
        <Link className="staff-metric" to={to} key={title}>
          <span className="staff-metric-heading"><span>{title}</span><Icon size={19} aria-hidden="true" /></span>
          <strong>{value}</strong>
        </Link>)}
    </div>
    <div className="staff-dashboard-panels">
      <WorkPanel title="Công việc ưu tiên" to={taskPath} empty={complete ? 'Bạn đã xử lý hết công việc hiện có.' : 'Chưa tải đủ công việc.'} loading={loading} count={priority.length}>
        {priority.slice(0, 5).map(task => <WorkRow key={task.entry.id} to={task.entry.web} title={task.title}
          details={[task.customer, task.unit].filter(Boolean).join(' · ')} time={task.timestamp ? date(task.timestamp, true) : undefined}
          status={task.overdue ? <Status value="OVERDUE" text="Đã quá giờ" /> : <Status value={task.status} />} onOpen={() => activity.markRead([task.entry.token])} />)}
      </WorkPanel>
      <div className="staff-dashboard-column">
        <WorkPanel title="Lịch hôm nay" to={todayPath} empty={handoversReady ? 'Không có lịch bàn giao hôm nay.' : 'Chưa tải được lịch bàn giao.'} loading={loading} count={todayAppointments.length}>
          {todayAppointments.slice(0, 5).map(task => <WorkRow key={task.entry.id} to={task.entry.web}
            title={[timeOfDay.format(new Date(task.scheduledAt)), task.customer].filter(Boolean).join(' · ')}
            details={[task.title, task.unit].filter(Boolean).join(' · ')}
            status={<Status value={task.status} />} onOpen={() => activity.markRead([task.entry.token])} />)}
        </WorkPanel>
        <WorkPanel title="Kho quá hạn chưa trả" to={staffOverstayPath}
          empty={overstays.error ? 'Chưa tải được danh sách kho quá hạn.' : 'Không có kho quá hạn trong phạm vi phụ trách.'}
          loading={overstays.loading} count={overdueUnits.length}>
          {overdueUnits.slice(0, 5).map(row => <WorkRow key={row.id} to={staffOverstayTarget(row)}
            title={row.storageUnit.unitNumber} details={row.customer.fullName}
            time={`Hết hạn ${date(row.endDate)} · Quá hạn ${row.overdueDays} ngày`}
            status={<StaffOverstayStatus row={row} />} />)}
        </WorkPanel>
      </div>
    </div>
  </section>;
}
