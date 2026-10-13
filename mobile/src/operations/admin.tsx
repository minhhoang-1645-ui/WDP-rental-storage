import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { userCreation } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, idOf, label, rows, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Field, Facts, Navigation, Panel, styles } from './ui';

export function AdminUsers({ statusOnly = false }: { statusOnly?: boolean }) {
  const data = useResource<Row>('/admin/users', true);
  const [search, setSearch] = useState(''), [role, setRole] = useState(''), [status, setStatus] = useState('');
  const [action, setAction] = useState<FormAction>();
  const items = rows(data.data?.items).filter(row => (!role || row.role === role) && (!status || row.accountStatus === status) && (!search || [row.fullName, row.email, row.phone].join(' ').toLowerCase().includes(search.toLowerCase())));
  const header = <View style={{ gap: 12 }}><PageHeader eyebrow="Quản trị viên" title={statusOnly ? 'Trạng thái tài khoản' : 'Quản lý tài khoản người dùng'} description="Tài khoản và trạng thái được đọc từ hệ thống." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Button title="Làm mới tài khoản" onPress={data.refresh} disabled={data.loading} />{!statusOnly && !action && <Button title="Tạo tài khoản nội bộ" onPress={() => setAction(userCreation())} />}{action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); data.refresh(); }} />}<Field title="Tìm tên, email hoặc số điện thoại" value={search} onChange={setSearch} maxLength={120} />
    <View style={styles.row}>{['', 'CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(value => <Button key={value} title={`${role === value ? '✓ ' : ''}${value ? label(value) : 'Tất cả vai trò'}`} onPress={() => setRole(value)} />)}</View>
    <View style={styles.row}>{['', 'ACTIVE', 'DISABLED'].map(value => <Button key={value} title={`${status === value ? '✓ ' : ''}${value ? label(value) : 'Tất cả trạng thái'}`} onPress={() => setStatus(value)} />)}</View>
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{items.length} tài khoản phù hợp</Text>}
  </View>;
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={data.loading || data.error ? [] : items} ListHeaderComponent={header} keyExtractor={idOf} renderItem={({ item }) => <Navigation title={String(item.fullName || item.email)} description={`${item.email} · ${label(item.role)} · ${label(item.accountStatus)}`} path={`/admin/users/${encodeURIComponent(idOf(item))}`} />} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có tài khoản phù hợp" message="Thử đổi bộ lọc." /> : null} />;
}
export function AccountStatus() { return <AdminUsers statusOnly />; }
export function AdminUserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  return <UserDetail key={`${user?.id}:${id}`} id={String(id)} />;
}
function UserDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const data = useResource<Row>(`/admin/users/${encodeURIComponent(id)}`);
  const [action, setAction] = useState<FormAction>();
  const [notice, setNotice] = useState('');
  const row = data.data;
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Chi tiết tài khoản" description="Không hiển thị mật khẩu hoặc hash. Giữ nguyên lịch sử khi vô hiệu hóa." /><Navigation title="Về danh sách tài khoản" path="/admin/users" /><Button title="Làm mới" onPress={data.refresh} disabled={data.loading || Boolean(action)} />{Boolean(notice) && <Text style={styles.success}>{notice}</Text>}{data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : row && <>
    <Panel><RecordView row={row} root="/admin/facility" /></Panel>
    {action ? <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã cập nhật trạng thái tài khoản.'); data.refresh(); }} /> : row.id !== user?.id ? <Button title={row.accountStatus === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'} onPress={() => setAction({ title: row.accountStatus === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản', path: `/admin/users/${encodeURIComponent(id)}/status`, method: 'PATCH', fields: [{ name: 'accountStatus', title: 'Trạng thái mới', required: true, fixed: true, initial: row.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', choices: [{ value: row.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', label: row.accountStatus === 'ACTIVE' ? 'Đã vô hiệu hóa' : 'Đang hoạt động' }] }, { name: '_confirm', title: 'Tôi xác nhận thay đổi trạng thái tài khoản này', required: true, checkbox: true, clientOnly: true }] })} /> : <Text style={styles.copy}>Không vô hiệu hóa tài khoản của phiên đang dùng.</Text>}
  </>}</ScrollView>;
}

export function AdminDashboard() {
  const users = useResource<Row>('/admin/users', true), summary = useResource<Row>('/manager/dashboard/summary');
  const refresh = () => { users.refresh(); summary.refresh(); };
  const loading = users.loading || summary.loading, error = users.error || summary.error;
  const items = rows(users.data?.items);
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Tổng quan hệ thống" description="Tài khoản và số liệu vận hành được lấy từ BE." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Button title="Làm mới tổng quan" onPress={refresh} disabled={loading} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <><Panel title="Tài khoản"><Facts values={['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(role => [label(role), items.filter(row => row.role === role).length])} /><Facts values={['ACTIVE', 'DISABLED'].map(status => [label(status), items.filter(row => row.accountStatus === status).length])} /></Panel>{summary.data && <Panel title="Vận hành"><RecordView row={summary.data} root="/admin/facility" /></Panel>}</>}<Navigation title="Mở chức năng vận hành cơ sở" path="/admin/facility" /></ScrollView>;
}
export function AdminAssignments() {
  const support = useResource<Row>('/manager/support-requests', true), maintenance = useResource<Row>('/manager/maintenance', true);
  const refresh = () => { support.refresh(); maintenance.refresh(); };
  const loading = support.loading || maintenance.loading, error = support.error || maintenance.error;
  const items: Row[] = [...rows(support.data?.items).filter(row => row.status !== 'RESOLVED').map(row => ({ ...row, resource: 'support-requests' })), ...rows(maintenance.data?.items).filter(row => row.status !== 'COMPLETED').map(row => ({ ...row, resource: 'maintenance' }))];
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={loading || error ? [] : items} keyExtractor={row => `${row.resource}:${idOf(row)}`} ListHeaderComponent={<View style={{ gap: 12 }}><PageHeader eyebrow="Quản trị viên" title="Phân công nhân viên" description="Phân công và giao lại hỗ trợ/bảo trì theo API hiện có. BE chưa có phân công ca/khu vực tổng quát." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Button title="Làm mới phân công" onPress={refresh} disabled={loading} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : null}</View>} renderItem={({ item }) => <Navigation title={codeOf(item)} path={`/admin/facility/${item.resource}/${encodeURIComponent(idOf(item))}`} description={`Nhân viên: ${String((item.assignedStaff as Row | undefined)?.fullName || 'Chưa phân công')}`} />} ListEmptyComponent={!loading && !error ? <EmptyState title="Không có công việc đang mở" message="Mở danh sách hỗ trợ hoặc bảo trì để xem lịch sử." /> : null} />;
}
export function AdminSettings() {
  const data = useResource<Row>('/health');
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Cấu hình cơ sở" description="Thông tin kết nối và danh mục vận hành hiện có." /><Navigation title="Về tổng quan quản trị" path="/admin" />{data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : data.data && <Panel title="Kết nối hệ thống"><RecordView row={data.data} root="/admin/facility" /></Panel>}<Text style={styles.copy}>BE chưa có API đọc/lưu cấu hình cơ sở. Không lưu giả trên thiết bị.</Text><Navigation title="Loại kho và bảng giá" path="/admin/facility/catalog" /><Navigation title="Dịch vụ bổ sung và tồn kho" path="/admin/facility/additional-services" /><Navigation title="Vận hành cơ sở" path="/admin/facility" /></ScrollView>;
}
const permissions = [
  ['Quản lý tài khoản và trạng thái', 'Có', 'Không', 'Không', 'Tài khoản của mình'],
  ['Review đặt kho, tư vấn và gia hạn', 'Có', 'Có', 'Không', 'Yêu cầu của mình'],
  ['Đối chiếu thanh toán, hoàn cọc', 'Có', 'Có', 'Không', 'Hóa đơn của mình'],
  ['Phân công và nghiệm thu bảo trì', 'Có', 'Có', 'Không', 'Không'],
  ['Bàn giao, nhận kho trả, kiểm tra', 'Có', 'Có', 'Có', 'Theo dõi của mình'],
  ['Xử lý hỗ trợ thông thường / sửa chữa', 'Không', 'Không', 'Nhân viên được phân công', 'Gửi yêu cầu của mình'],
  ['Giải quyết hỗ trợ được chuyển quản lý', 'Có', 'Có', 'Không', 'Không'],
  ['Tạo/duyệt chuyển kho', 'Có', 'Có', 'Không', 'Gửi hỗ trợ'],
  ['Hoàn tất chuyển kho thực tế', 'Không', 'Không', 'Có', 'Không'],
];
export function AdminRoles() {
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Vai trò và quyền" description="Quyền cố định theo guards của BE, còn phụ thuộc trạng thái và phân công." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Text style={styles.copy}>BE chưa có API đổi vai trò hoặc tạo/sửa nhóm quyền.</Text>{permissions.map(([title, admin, manager, staff, customer]) => <Panel key={title} title={title}><Facts values={[["Quản trị viên", admin], ["Quản lý", manager], ["Nhân viên", staff], ["Khách hàng", customer]]} /></Panel>)}</ScrollView>;
}
export function AdminActivity() {
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Nhật ký hoạt động" description="Nhật ký kiểm toán toàn hệ thống." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Panel><Text style={styles.copy}>BE và schema hiện chưa cung cấp audit log. Chưa thể hiển thị nhật ký toàn hệ thống. Thời điểm và người xử lý trong từng hồ sơ có thể xem tại khu vực vận hành.</Text></Panel><Navigation title="Xem hồ sơ vận hành" path="/admin/facility" /></ScrollView>;
}
