import { CalendarClock, ClipboardCheck, HardHat, Headphones, RefreshCw, Repeat2, RotateCcw, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { code, first, date, type Row } from '../../components/manager/portal-data';
import { LoadState, PageHeader, Status } from '../../components/manager/PortalUi';
import { WorkHub, WorkflowHint } from '../../components/workspace/WorkHub';
import { ActivitySummary } from '../../activity/ActivityCenter';

export function StaffOperationsPage() {
  const { user } = useAuth();
  const appointments = usePaginatedResource<Row>('/staff/appointments', user?.id, true);
  const stock = usePaginatedResource<Row>('/staff/stock-movements', user?.id, true);
  const returns = usePaginatedResource<Row>('/staff/returns', user?.id, true);
  const maintenance = usePaginatedResource<Row>('/staff/maintenance', user?.id, true);
  const support = usePaginatedResource<Row>('/staff/support-requests', user?.id, true);
  const transfers = usePaginatedResource<Row>('/staff/transfers', user?.id, true);
  const groups = [
    { title: 'Bàn giao kho', path: '/staff/appointments', description: 'Lịch đã được quản lý xác nhận; bàn giao khi đến giờ hẹn.', icon: CalendarClock, source: appointments, statuses: ['CONFIRMED'], assigned: false },
    { title: 'Nhập – xuất hàng', path: '/staff/stock-movements', description: 'Kiểm đếm các phiếu đã được giao cho bạn.', icon: ClipboardCheck, source: stock, statuses: ['ASSIGNED'], assigned: true },
    { title: 'Kiểm tra trả kho', path: '/staff/returns', description: 'Kiểm tra từng kho và ghi nhận hiện trạng thực tế.', icon: RotateCcw, source: returns, statuses: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'], assigned: false },
    { title: 'Hỗ trợ khách hàng', path: '/staff/support-requests', description: 'Tiếp nhận, xử lý hoặc chuyển quản lý khi cần.', icon: Headphones, source: support, statuses: ['ASSIGNED', 'IN_PROGRESS'], assigned: true },
    { title: 'Bảo trì được giao', path: '/staff/maintenance', description: 'Bắt đầu sửa chữa và gửi kết quả nghiệm thu.', icon: HardHat, source: maintenance, statuses: ['OPEN', 'IN_PROGRESS'], assigned: true },
    { title: 'Chuyển kho đã duyệt', path: '/staff/transfers', description: 'Chỉ hoàn tất sau khi chuyển kho thực tế.', icon: Repeat2, source: transfers, statuses: ['APPROVED'], assigned: false },
  ];
  const sources = groups.map(group => group.source), refresh = () => sources.forEach(source => source.refresh());
  const pendingGroups = groups.map(group => ({ ...group, items: (group.source.data?.items ?? []).filter(row => group.statuses.includes(String(row.status)) && (!group.assigned || first(row, 'assignedStaff.id') === user?.id)) }));
  const queue = pendingGroups.flatMap(group => group.items.map(row => ({ row, title: group.title, path: `${group.path}/${encodeURIComponent(first(row, 'id'))}` }))).sort((a, b) => {
    const rank = (row: Row) => row.priority === 'HIGH' ? 0 : row.status === 'CONFIRMED' ? 1 : 2;
    return rank(a.row) - rank(b.row) || Date.parse(first(a.row, 'scheduledAt', 'createdAt')) - Date.parse(first(b.row, 'scheduledAt', 'createdAt'));
  });
  return <section className="workspace-home"><PageHeader title="Công việc của tôi" description={`Chào ${user?.fullName ?? 'bạn'}. Mở công việc được giao, đối chiếu hồ sơ rồi thực hiện tại kho.`}><button className="button-secondary" disabled={sources.some(source => source.loading)} onClick={refresh}><RefreshCw size={16} />Làm mới</button></PageHeader>
    <ActivitySummary />
    <section className="work-queue"><div className="work-hub-heading"><div><h2>Ưu tiên xử lý</h2><p>Công việc chưa hoàn tất; việc ưu tiên cao được đưa lên trước.</p></div></div>
      {sources.some(source => source.loading) && <p role="status" className="workspace-muted">Đang cập nhật công việc…</p>}
      {queue.length ? <div className="workspace-shortcuts">{queue.slice(0, 6).map(({ row, title, path }) => <Link key={path} to={path}><span className="work-queue-marker" /><div><strong>{code(row)}</strong><span>{title} · {first(row, 'customer.fullName', 'reservation.customer.fullName', 'subject', 'storageUnit.unitNumber') || 'Mở hồ sơ để đối chiếu'}{row.scheduledAt ? ` · ${date(row.scheduledAt, true)}` : ''}</span></div><Status value={row.status} /><ArrowRight size={16} /></Link>)}</div> : !sources.some(source => source.loading) && <p className="workspace-empty">{sources.some(source => source.error) ? 'Chưa tải đủ danh sách. Bạn vẫn có thể mở từng nhóm công việc bên dưới.' : 'Chưa có việc cần xử lý trong các nhóm đã tải. Lịch và công việc mới sẽ xuất hiện sau khi được xác nhận hoặc phân công.'}</p>}
    </section>
    {sources.filter(source => source.error).map((source, index) => <LoadState key={index} loading={false} error={source.error} retry={source.refresh} />)}
    <WorkHub title="Tất cả nhóm công việc" description="Số hồ sơ đang chờ bạn xử lý; mở danh sách để xem cả lịch sử." actions={pendingGroups.map(group => ({ title: group.title, description: group.description, to: group.path, icon: group.icon, count: group.source.loading || group.source.error ? '—' : group.items.length, tone: group.items.length ? 'attention' : 'normal' }))} />
    <WorkflowHint title="Cách phối hợp">Khách hàng gửi yêu cầu → Quản lý xác nhận hoặc phân công → Nhân viên thực hiện và cập nhật kết quả. Với bảo trì và các quyết định tài chính, quản lý tiếp tục nghiệm thu hoặc duyệt sau phần việc của nhân viên.</WorkflowHint>
    <Link className="button-secondary" to="/staff/rentals">Tra cứu kho đang thuê</Link>
  </section>;
}
