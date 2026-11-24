import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { first, type Row } from '../../components/manager/portal-data';
import { PageHeader } from '../../components/manager/PortalUi';
import { ManagerTaskTable, ManagerTableSearch } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { normalizeSearch } from '../../utils/notification-tools';
import { useActivity } from '../../activity/context';

export function ManagerStaffPage() {
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const result = usePaginatedResource<Row>('/manager/staff', user?.id, true);
  const activity = useActivity();
  const workload = new Map<string, number>();
  const active: Record<string,string[]> = { appointments:['REQUESTED','CONFIRMED'], returns:['REQUESTED','INSPECTION_IN_PROGRESS','ISSUE_FOUND'], transfers:['APPROVED'], maintenance:['OPEN','IN_PROGRESS'], 'support-requests':['ASSIGNED','IN_PROGRESS'], 'damage-claims':['REPORTED','INVESTIGATING'] };
  for (const kind of ['appointments','returns','transfers','maintenance','support-requests','damage-claims']) for (const task of activity.data[kind] ?? []) {
    const staffId = first(task,'assignedStaff.id');
    if (staffId && active[kind].includes(first(task,'status'))) workload.set(staffId,(workload.get(staffId) ?? 0)+1);
  }
  const search = params.get('search') ?? '';
  const items = (result.data?.items ?? []).filter(row => normalizeSearch(`${first(row,'fullName')} ${first(row,'email')}`).includes(normalizeSearch(search)));
  return <section><PageHeader title="Nhân viên tại cơ sở" description="Nhân viên đang hoạt động và được cấp quyền tại cơ sở đã chọn."><button className="button-secondary" onClick={result.refresh}>Làm mới</button></PageHeader>
    <ManagerTaskTable title="Nhân viên" items={items.slice((page-1)*limit,page*limit)} total={items.length} page={page} limit={limit} update={update} rowKey={row=>first(row,'id')} loading={result.loading} refreshing={result.refreshing} error={result.error} retry={result.refresh}
      columns={[{key:'name',label:'Nhân viên',cell:row=><strong>{first(row,'fullName')}</strong>},{key:'email',label:'Email',cell:row=>first(row,'email')},{key:'status',label:'Tài khoản',cell:()=> 'Đang hoạt động'},{key:'tasks',label:'Công việc chưa kết thúc',cell:row=><Link to={`/manager/assignments?assignee=${encodeURIComponent(first(row,'id'))}`}>{activity.loading || activity.failed.length ? 'Xem công việc' : `${workload.get(first(row,'id')) ?? 0} việc`}</Link>}]}
      toolbar={<ManagerTableSearch value={search} onChange={value=>update('search',value)} placeholder="Tên hoặc email"/>}/>
  </section>;
}
