import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useActivity } from '../../activity/context';
import { activitySources, staffPriorityActivities } from '../../utils/activity';
import { PageHeader } from '../../components/manager/PortalUi';
import { InternalKpis, InternalPriority } from '../../components/workspace/InternalDashboard';
import { OverstayNotice } from '../../components/workspace/OverstayNotice';

export function StaffOperationsPage() {
  const activity = useActivity();
  const sources = activitySources('STAFF');
  const ready = (kind: string) => !activity.loading && Boolean(activity.data[kind]) && !activity.failed.includes(sources.find(source => source.kind === kind)?.title ?? '');
  const queue = staffPriorityActivities(activity.entries);
  const count = (kind: string) => ready(kind) ? queue.filter(entry => entry.kind === kind).length : '—';
  return <section className="workspace-home">
    <PageHeader title="Bàn làm việc"><button className="button-secondary" disabled={activity.checking} onClick={activity.refresh}><RefreshCw size={16} />Làm mới</button></PageHeader>
    <InternalKpis items={[
      { title: 'Việc cần làm', value: activity.loading || activity.failed.length ? '—' : queue.length, to: '/staff/notifications?view=action', hint: 'Hồ sơ bạn có thể xử lý' },
      { title: 'Lịch bàn giao', value: count('appointments'), to: '/staff/appointments', hint: 'Lịch cần xử lý' },
      { title: 'Phiếu nhập – xuất', value: count('stock-movements'), to: '/staff/stock-movements', hint: 'Phiếu đã giao cho bạn' },
      { title: 'Hỗ trợ & bảo trì', value: ready('support-requests') && ready('maintenance') ? Number(count('support-requests')) + Number(count('maintenance')) : '—', to: '/staff/support-requests?mine=true', hint: 'Việc cần xử lý trong hai nhóm' },
    ]} />
    <InternalPriority entries={queue} to="/staff/notifications?view=action" loading={activity.loading} failed={activity.failed} onRead={activity.markRead} />
    <OverstayNotice />
    <div className="internal-shortcuts"><Link className="button-secondary" to="/staff/assigned-units">Kho tôi phụ trách</Link><Link className="button-secondary" to="/staff/stored-items">Hàng đang lưu</Link><Link className="button-secondary" to="/staff/rentals">Tra cứu kho thuê</Link></div>
  </section>;
}
