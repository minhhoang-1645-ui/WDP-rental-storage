import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { first, type Row } from '../../components/manager/portal-data';
import { PageHeader, Status } from '../../components/manager/PortalUi';
import { ManagerTaskTable, ManagerTableSearch } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { useInternalListScroll } from '../../components/workspace/internal-list-memory';
import { normalizeSearch } from '../../utils/notification-tools';
import { activitySources } from '../../utils/activity';

const openStatuses: Record<string, string[]> = {
  appointments: ['REQUESTED', 'CONFIRMED'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
  transfers: ['APPROVED'],
  maintenance: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'],
  'support-requests': ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
  'damage-claims': ['REPORTED', 'INVESTIGATING'],
};
const workSources = activitySources('FACILITY_MANAGER').filter(source => Object.hasOwn(openStatuses, source.kind));
const workPath = (row: Row) => '/manager/assignments?assignee=' + encodeURIComponent(first(row, 'id'));

export function ManagerStaffPage() {
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const result = usePaginatedResource<Row>('/manager/staff', user?.id, true);
  const activity = useActivity();
  useInternalListScroll(true, Boolean(result.data));
  const complete = !activity.loading && workSources.every(source => activity.data[source.kind] && !activity.failed.includes(source.title))
    && !activity.failed.includes('Kết nối mạng');
  const workloads = new Map<string, Set<string>>();
  if (complete) for (const { kind } of workSources) {
    for (const task of activity.data[kind]) {
      const progress = first(task, 'coordination.phase');
      if (progress === 'STAFF_DONE' || !progress && !openStatuses[kind].includes(first(task, 'status'))) continue;
      const assignees = new Set([first(task, 'assignedStaff.id', 'assignedStaffId', 'assignedStaffUserId'),
        ...(kind === 'transfers' ? [first(task, 'receivingStaff.id', 'receivingStaffId')] : [])].filter(Boolean));
      for (const id of assignees) {
        const open = workloads.get(id) ?? new Set<string>();
        open.add(kind + ':' + first(task, 'id'));
        workloads.set(id, open);
      }
    }
  }
  const search = params.get('search') ?? '';
  const items = (result.data?.items ?? []).filter(row => normalizeSearch(first(row, 'fullName') + ' ' + first(row, 'email')).includes(normalizeSearch(search)));
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(items.length / limit)));
  function refresh() {
    result.refresh();
    activity.refresh();
  }
  return <section className="manager-record-list manager-record-list-staff">
    <PageHeader title="Nhân viên tại cơ sở" description="Danh sách tài khoản nhân viên đang hoạt động và được cấp quyền tại cơ sở.">
      <button type="button" className="button-secondary" disabled={result.loading || result.refreshing} onClick={refresh}><RefreshCw size={16} />Làm mới</button>
    </PageHeader>
    {!activity.loading && !complete && <p className="manager-record-note" role="status">Chưa đủ dữ liệu để xác định số công việc.</p>}
    <ManagerTaskTable title="Nhân viên" items={items.slice((visiblePage - 1) * limit, visiblePage * limit)}
      total={items.length} page={visiblePage} limit={limit} update={update} rowKey={row => first(row, 'id')}
      loading={result.loading} refreshing={result.refreshing} error={result.error} retry={refresh}
      emptyTitle={search.trim() ? 'Không tìm thấy nhân viên phù hợp' : 'Chưa có nhân viên tại cơ sở'}
      rowAction={row => ({ to: workPath(row), label: 'Xem công việc' })}
      columns={[
        { key: 'name', label: 'Họ tên', cell: row => <strong>{first(row, 'fullName')}</strong> },
        { key: 'email', label: 'Email', cell: row => first(row, 'email') || '—' },
        { key: 'status', label: 'Trạng thái tài khoản', cell: row => <Status value={row.accountStatus ?? 'ACTIVE'} /> },
        { key: 'tasks', label: 'Công việc chưa hoàn tất', numeric: true, cell: row => complete ? workloads.get(first(row, 'id'))?.size ?? 0 : '—' },
      ]}
      toolbar={<ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Tên hoặc email…" />}
    />
  </section>;
}
