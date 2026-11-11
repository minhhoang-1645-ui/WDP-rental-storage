import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { useApiResource } from '../../services/useApiResource';
import { useLiveRefresh } from '../../services/live-events';
import type { ManagerReport } from '../../types/manager-report';
import { PageHeader, LoadState } from '../../components/manager/PortalUi';
import { money } from '../../components/manager/portal-data';
import { InternalKpis, InternalPriority } from '../../components/workspace/InternalDashboard';

export function ManagerOverviewPage() {
  const { user } = useAuth(), activity = useActivity();
  const report = useApiResource<ManagerReport>('/manager/dashboard/analytics', user?.id, true);
  useLiveRefresh('/manager/*', report.refresh);
  const data = report.data;
  const total = (keys: string[]) => data ? keys.reduce((sum, key) => sum + data.queue[key], 0) : '—';
  const priority = activity.entries.filter(entry => entry.action);
  return <section className="workspace-home">
    <PageHeader title="Tổng quan"><button className="button-secondary" disabled={report.loading || report.refreshing || activity.checking} onClick={() => { report.refresh(); activity.refresh(); }}><RefreshCw size={16} />Làm mới</button></PageHeader>
    <LoadState loading={report.loading} error={report.error} retry={report.refresh} />
    <InternalKpis items={[
      { title: 'Việc cần duyệt', value: total(['escalatedSupport', 'maintenanceReview', 'depositReview']), to: '/manager/reviews', hint: 'Hỗ trợ, bảo trì và tiền cọc' },
      { title: 'Chờ phân công', value: total(['unassignedStock', 'unassignedSupport', 'unassignedMaintenance']), to: '/manager/assignments?assignment=unassigned', hint: 'Nhập–xuất, hỗ trợ và bảo trì' },
      { title: 'Kho đang sử dụng', value: data ? `${data.units.occupied} / ${data.units.total}` : '—', to: '/manager/units', hint: 'Đang dùng / tổng kho vật lý' },
      { title: 'Công nợ hiện tại', value: data ? money(data.finance.outstandingAmount) : '—', to: '/manager/operations/invoices', hint: data ? `${data.finance.unpaidInvoices} hóa đơn chưa trả đủ` : undefined },
      { title: 'Chờ xác minh tiền', value: data?.queue.paymentVerification ?? '—', to: '/manager/payment-submissions', hint: 'Thông báo chuyển khoản chưa xác minh' },
    ]} />
    <InternalPriority entries={priority} to="/manager/notifications?view=action" loading={activity.loading} failed={activity.failed} onRead={activity.markRead} />
    <div className="internal-shortcuts"><Link className="button-secondary" to="/manager/reports">Báo cáo chi tiết</Link><Link className="button-secondary" to="/manager/online-payment-reconciliations">Đối soát VNPay</Link><Link className="button-secondary" to="/manager/stored-items">Hàng đang lưu</Link></div>
  </section>;
}
