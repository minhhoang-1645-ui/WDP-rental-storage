import { ArrowRight, ClipboardCheck, ClipboardList, RefreshCw, Users, WalletCards, Warehouse, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { useApiResource } from '../../services/useApiResource';
import { useLiveRefresh } from '../../services/live-events';
import type { ManagerReport } from '../../types/manager-report';
import { PageHeader, LoadState, RefreshStatus, Status } from '../../components/manager/PortalUi';
import { DashboardSkeleton } from '../../components/LoadingSkeleton';
import { date, first, money, rows, type Row } from '../../components/manager/portal-data';
import { activitySources, type ActivityEntry } from '../../utils/activity';
import { assignmentNeedsAttention, hasLinkedTransfer } from '../../utils/work-queue';
import { managerSections } from '../../utils/manager-sections';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { isCustomerTransferSubject } from '../../utils/transfer-request';

const number = new Intl.NumberFormat('vi-VN');
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const count = (value?: number) => isCount(value) ? number.format(value) : '—';
const workTitles = new Map(activitySources('MANAGER').map(source => [source.kind, source.title]));
const storageStatuses = [
  { key: 'occupied', label: 'Đang sử dụng', color: 'occupied' },
  { key: 'available', label: 'Sẵn sàng', color: 'available' },
  { key: 'reserved', label: 'Đang giữ', color: 'reserved' },
  { key: 'maintenance', label: 'Bảo trì', color: 'maintenance' },
] as const;

function storageBreakdown(units: ManagerReport['units']) {
  if (!isCount(units.total)) return null;
  const statuses: { key: string; label: string; color: string; value: number }[] = storageStatuses.map(
    ({ key, label, color }) => ({ key, label, color, value: units[key] }),
  );
  if (!statuses.every(({ value }) => isCount(value))) return null;
  const subtotal = statuses.reduce((sum, { value }) => sum + value, 0);
  if (subtotal > units.total) return null;
  const extra = Object.entries(units).flatMap(([key, value]) =>
    key !== 'total' && key !== 'utilizationPercent' && !statuses.some(status => status.key === key) && isCount(value)
      ? [{ key, label: `Trạng thái khác (${key})`, color: 'other', value }] : []);
  const extraTotal = extra.reduce((sum, { value }) => sum + value, 0);
  const remaining = units.total - subtotal;
  // Analytics exposes four named status counts today. A residual is meaningful,
  // but its status cannot be identified until the API returns the breakdown.
  if (extraTotal > remaining) return null;
  const unclassified = remaining - extraTotal;
  return [...statuses, ...extra, ...(unclassified > 0
    ? [{ key: 'unclassified', label: 'Chưa có chi tiết trạng thái', color: 'unclassified', value: unclassified }] : [])];
}

function ManagerMetric({ title, value, hint, to, icon: Icon }: {
  title: string; value: string; hint: string; to: string; icon: LucideIcon;
}) {
  return <Link className="internal-kpi manager-dashboard-kpi" to={to}>
    <span className="manager-kpi-heading">{title}<Icon size={19} aria-hidden="true" /></span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </Link>;
}

function StoragePanel({ report, loading, error }: { report?: ManagerReport | null; loading: boolean; error: string }) {
  const units = report?.units;
  const statuses = units ? storageBreakdown(units) : null;
  return <section className="manager-overview-panel" aria-labelledby="manager-storage-title">
    <header>
      <h2 id="manager-storage-title">Tình trạng kho</h2>
      <Link className="manager-panel-link" to="/manager/units">Xem kho vật lý <ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    {!report ? loading ? <DashboardSkeleton variant="distribution" /> : <p className="manager-panel-caption" role="status">{error ? 'Chưa tải được số liệu kho.' : 'Chưa có số liệu kho.'}</p>
      : !units || !statuses ? <p className="manager-panel-caption" role="status">Số liệu trạng thái kho chưa khớp với tổng kho.</p>
      : units.total === 0 ? <p className="manager-panel-caption">Chưa có kho vật lý trong hệ thống.</p>
      : <>
        <p className="manager-storage-total">Trạng thái hiện tại · <strong>{count(units.total)} kho</strong></p>
        <div className="manager-storage-bar" aria-hidden="true">
          {statuses.filter(status => status.value > 0).map(({ key, color, value }) =>
            <span key={key} className={`manager-storage-segment is-${color}`} style={{ flex: `${value} 0 0%` }} />)}
        </div>
        <ul className="manager-storage-legend" aria-label="Số lượng và tỷ lệ kho theo trạng thái">
          {statuses.map(({ key, label, color, value }) => <li key={key} className={`is-${color}`}>
            <span className="manager-storage-swatch" aria-hidden="true" />
            <span>{label}</span><strong>{count(value)} kho</strong><span>{percent.format(value / units.total)}</span>
          </li>)}
        </ul>
      </>}
  </section>;
}

function workDetails(entry: ActivityEntry, row: Row) {
  const status = first(row, 'status');
  const id = encodeURIComponent(first(row, 'id'));
  if (assignmentNeedsAttention(entry.kind, row)) {
    const reassignment = Boolean(first(row, 'assignedStaff.id'));
    const title = reassignment ? 'Đổi người phụ trách' : 'Phân công nhân viên';
    const work = workTitles.get(entry.kind);
    return { title: work ? `${title} · ${work}` : title, to: `/manager/assignments?kind=${entry.kind}&record=${id}`, status, statusText: reassignment ? 'Cần phân công lại' : 'Chờ phân công' };
  }
  if (entry.kind === 'deposit-settlements') return status === 'APPROVED'
    ? { title: 'Ghi nhận hoàn cọc', to: entry.web, status, statusText: 'Chờ hoàn cọc' }
    : { title: 'Duyệt quyết toán cọc', to: entry.web, status };
  if (entry.kind === 'support-requests' && isEarlyReturnRequest(row)) return { title: 'Duyệt trả trước hạn', to: `/manager/early-returns?record=${id}`, status, statusText: 'Chờ quyết định' };
  if (entry.kind === 'support-requests' && isCustomerTransferSubject(row.subject)) return { title: 'Xem xét yêu cầu chuyển kho', to: entry.web, status, statusText: 'Chờ duyệt' };
  if (entry.kind === 'support-requests') return { title: 'Xử lý hỗ trợ chuyển cấp', to: entry.web, status, statusText: 'Chờ xử lý' };
  if (entry.kind === 'transfers') return { title: 'Duyệt chuyển kho', to: entry.web, status, statusText: 'Chờ duyệt' };
  if (entry.kind === 'maintenance') return { title: 'Nghiệm thu bảo trì', to: entry.web, status };
  if (entry.kind === 'damage-claims' && first(row, 'compensation.status') === 'AWAITING_HANDOVER') return { title: 'Ghi nhận giao tiền bồi thường', to: entry.web, status: 'PENDING', statusText: 'Chờ giao tiền' };
  if (entry.kind === 'damage-claims') return status === 'INVESTIGATING'
    ? { title: 'Quyết định xử lý sự cố hàng hóa', to: entry.web, status, statusText: 'Chờ quyết định' }
    : { title: 'Ghi kết quả xử lý sự cố', to: entry.web, status, statusText: 'Chờ ghi kết quả' };
  if (entry.kind === 'invoices') return { title: 'Kiểm tra hóa đơn quá hạn', to: entry.web, status, statusText: 'Quá hạn' };
  return { title: entry.title, to: entry.web, status };
}

export function ManagerOverviewPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const report = useApiResource<ManagerReport>('/manager/dashboard/analytics', user?.id, true);
  useLiveRefresh('/manager/*', report.refresh);
  const data = report.error ? null : report.data;
  const queueTotal = (keys: string[]) => {
    const values = keys.map(key => data?.queue?.[key]);
    return values.every(isCount) ? count(values.reduce((sum, value) => sum + value, 0)) : '—';
  };
  const records = new Map<string, Row>(Object.entries(activity.data).flatMap(([kind, rows]) =>
    rows.map(row => [`${kind}:${first(row, 'id')}`, row])));
  const priority = activity.entries.flatMap(entry => {
    const row = records.get(entry.id);
    return entry.action && row && first(row, 'id') &&
      !(entry.kind === 'support-requests' && hasLinkedTransfer(row)) ? [{ entry, row }] : [];
  }).slice(0, 5);
  const metrics = [
    { title: managerSections.reviews.title, value: queueTotal(['escalatedSupport', 'maintenanceReview', 'depositReview', 'earlyReturnReview', 'transferReview', 'renewalReview', 'damageReview']), hint: 'Hồ sơ đang chờ quyết định', to: '/manager/reviews?view=decision', icon: ClipboardCheck },
    { title: 'Chờ phân công', value: queueTotal(['unassignedStock', 'unassignedSupport', 'unassignedMaintenance', 'unassignedAppointments', 'unassignedReturns', 'unassignedTransfers', 'unassignedClaims']), hint: 'Hồ sơ cần giao hoặc đổi người', to: '/manager/assignments?assignment=attention', icon: Users },
    { title: 'Kho đang sử dụng', value: isCount(data?.units?.occupied) && isCount(data?.units?.total) && data.units.occupied <= data.units.total ? `${count(data.units.occupied)} / ${count(data.units.total)}` : '—', hint: 'Kho đang sử dụng / Tổng kho', to: '/manager/units?status=OCCUPIED', icon: Warehouse },
    { title: 'Công nợ hiện tại', value: isCount(data?.finance?.outstandingAmount) ? money(data.finance.outstandingAmount) : '—', hint: isCount(data?.finance?.unpaidInvoices) ? `${count(data.finance.unpaidInvoices)} hóa đơn còn dư nợ` : 'Số dư hóa đơn còn hiệu lực', to: '/manager/operations/invoices', icon: WalletCards },
  ];

  return <section className="manager-overview">
    <PageHeader title="Tổng quan">
      <Link className="button-secondary" to="/manager/reports">Báo cáo</Link>
      <button type="button" className="button-secondary" disabled={report.loading || report.refreshing || activity.checking} onClick={() => { report.refresh(); activity.refresh(); }}><RefreshCw size={16} />Làm mới</button>
      <RefreshStatus active={report.refreshing || activity.checking && !activity.loading} />
    </PageHeader>
    {report.error && <LoadState loading={false} error={report.error} retry={report.refresh} />}
    <div className="internal-kpis manager-dashboard-kpis" aria-label="Chỉ số quản lý" aria-busy={report.loading}>
      {metrics.map(metric => report.loading ? <DashboardSkeleton key={metric.title} variant="metric" cardClass="manager-dashboard-kpi" /> : <ManagerMetric key={metric.title} {...metric} />)}
    </div>
    <div className="manager-overview-panels">
      <StoragePanel report={data} loading={report.loading} error={report.error} />
      <section className="manager-overview-panel" aria-labelledby="manager-priority-title">
        <header>
          <h2 id="manager-priority-title">Việc cần xử lý</h2>
          <Link className="manager-panel-link" to="/manager/notifications?view=action">Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>
        {activity.loading && activity.checking && <DashboardSkeleton variant="activity" />}
        <LoadState loading={false} error={activity.failed.length ? `Chưa tải được ${activity.failed.join(', ')}.` : ''} retry={activity.refresh} />
        {!activity.loading && !activity.failed.length && !priority.length && <p className="manager-panel-caption">Hiện chưa có việc cần xử lý.</p>}
        <ul className="internal-task-list manager-work-list">
          {priority.map(({ entry, row }) => {
            const { title, to, status, statusText } = workDetails(entry, row);
            const person = first(row, 'customer.fullName', 'reservation.customer.fullName');
            const inspectedUnits = rows(row.physicalInspections).map(inspection => first(inspection, 'unit.unitCode')).filter(Boolean);
            const unit = first(row, 'currentStorageUnit.unitNumber', 'storageUnit.unitNumber', 'storageUnit.unitCode', 'unit.unitCode', 'fromUnit.unitCode', 'unitCodeSnapshot') || [...new Set(inspectedUnits)].join(', ');
            return <li key={entry.id}><Link to={to} onClick={() => activity.markRead([entry.token])}>
              <span className="manager-work-icon"><ClipboardList size={17} aria-hidden="true" /></span>
              <span className="manager-work-copy">
                <strong>{title}</strong>
                <small>{[entry.code, person, unit].filter(Boolean).join(' · ')}</small>
                {entry.at && <small>{date(entry.at, true)}</small>}
              </span>
              {status && <Status value={status} text={statusText} />}
              <ArrowRight className="manager-work-arrow" size={16} aria-hidden="true" />
            </Link></li>;
          })}
        </ul>
      </section>
    </div>
  </section>;
}
