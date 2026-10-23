import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/screen-state';
import { FunctionMenu, WorkHub } from '@/components/workspace-hub';
import { useResource } from '@/operations/use-resource';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { codeOf, text, label, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { ActivitySummary } from '@/activity/ActivityCenter';

export default function StaffHomeScreen() {
  const { user } = useAuth();
  const appointments = useResource<{items:Row[]}>('/staff/appointments', true);
  const stock = useResource<{items:Row[]}>('/staff/stock-movements', true);
  const maintenance = useResource<{items:Row[]}>('/staff/maintenance', true);
  const support = useResource<{items:Row[]}>('/staff/support-requests', true);
  const returns = useResource<{items:Row[]}>('/staff/returns', true);
  const transfers = useResource<{items:Row[]}>('/staff/transfers', true);
  const groups = [
    { title: 'Bàn giao kho', path: '/staff/appointments', source: appointments, statuses: ['CONFIRMED'], assigned: false, description: 'Bàn giao theo lịch quản lý đã xác nhận.' },
    { title: 'Nhập – xuất hàng', path: '/staff/stock-movements', source: stock, statuses: ['ASSIGNED'], assigned: true, description: 'Kiểm đếm phiếu hàng được giao cho bạn.' },
    { title: 'Kiểm tra trả kho', path: '/staff/returns', source: returns, statuses: ['REQUESTED','INSPECTION_IN_PROGRESS','ISSUE_FOUND'], assigned: false, description: 'Kiểm tra từng kho và ghi nhận hiện trạng.' },
    { title: 'Hỗ trợ khách hàng', path: '/staff/support-requests', source: support, statuses: ['ASSIGNED','IN_PROGRESS'], assigned: true, description: 'Xử lý yêu cầu hoặc chuyển quản lý.' },
    { title: 'Bảo trì được giao', path: '/staff/maintenance', source: maintenance, statuses: ['OPEN','IN_PROGRESS'], assigned: true, description: 'Xử lý và gửi kết quả để nghiệm thu.' },
    { title: 'Chuyển kho đã duyệt', path: '/staff/transfers', source: transfers, statuses: ['APPROVED'], assigned: false, description: 'Hoàn tất sau khi đã chuyển thực tế.' },
  ];
  const pending = groups.map(group => ({...group,items:(group.source.data?.items ?? []).filter(item => group.statuses.includes(String(item.status)) && (!group.assigned || text(item,'assignedStaff.id') === user?.id))}));
  const sources = groups.map(group => group.source), refresh = () => sources.forEach(item => item.refresh());
  const queue = pending.flatMap(group => group.items.map(item => ({item,path:`${group.path}/${encodeURIComponent(String(item.id))}`,title:group.title}))).sort((a,b) => (a.item.priority === 'HIGH' ? 0 : 1) - (b.item.priority === 'HIGH' ? 0 : 1) || Date.parse(text(a.item,'scheduledAt','createdAt')) - Date.parse(text(b.item,'scheduledAt','createdAt')));
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Nhân viên kho" title="Công việc của tôi" description={`Chào ${user?.fullName ?? 'bạn'}. Mở việc được giao và cập nhật kết quả sau khi thực hiện.`} />
    <Button title="Làm mới công việc" onPress={refresh} disabled={sources.some(item => item.loading)} />
    <ActivitySummary />
    <Panel title="Ưu tiên xử lý">{queue.slice(0,6).map(({item,path,title}) => <Navigation key={path} title={codeOf(item)} description={`${title} · ${label(item.status)}${item.scheduledAt ? ` · ${formatDate(String(item.scheduledAt),true)}` : ''}`} path={path} />)}{!queue.length && <Text style={styles.copy}>{sources.some(item => item.loading) ? 'Đang cập nhật công việc…' : sources.some(item => item.error) ? 'Chưa tải đủ dữ liệu. Bạn vẫn có thể mở từng nhóm bên dưới.' : 'Chưa có việc cần xử lý. Công việc mới sẽ xuất hiện khi được xác nhận hoặc phân công.'}</Text>}</Panel>
    {sources.filter(item => item.error).map((item,index) => <ErrorState key={index} message={item.error!} onRetry={item.refresh} />)}
    <WorkHub title="Nhóm công việc" description="Số hồ sơ chưa hoàn tất trong phạm vi công việc của bạn." actions={pending.map(group => ({title:group.title,path:group.path,description:group.description,count:group.source.loading || group.source.error ? '—' : group.items.length}))} />
    <FunctionMenu groups={[{title:'Tra cứu & lịch sử',items:[{title:'Công việc vận hành',path:'/staff/tasks',description:'Xem lịch sử bảo trì, hỗ trợ, trả kho và chuyển kho.'},{title:'Kho đang sử dụng',path:'/staff/rentals',description:'Tra cứu khách, hợp đồng và vị trí kho.'}]}]} />
    <Navigation title="Tài khoản và đăng xuất" path="/staff/account" />
  </ScrollView>;
}
