import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { userCreation } from './actions';
import { OperationForm, type FormAction } from './form';
import { idOf, label, rows, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Field, Facts, Navigation, Panel, styles } from './ui';

export function AdminUsers({ statusOnly = false }: { statusOnly?: boolean }) {
  const data = useResource<Row>('/admin/users', true);
  const [search, setSearch] = useState(''), [role, setRole] = useState(''), [status, setStatus] = useState('');
  const items = rows(data.data?.items).filter(row => (!role || row.role === role) && (!status || row.accountStatus === status) && (!search || [row.fullName, row.email, row.phone].join(' ').toLowerCase().includes(search.toLowerCase())));
  const header = <View style={{ gap: 12 }}><PageHeader eyebrow="Quản trị viên" title={statusOnly ? 'Trạng thái tài khoản' : 'Quản lý tài khoản người dùng'} description="Tài khoản và trạng thái được đọc từ hệ thống." /><Navigation title="Về tổng quan quản trị" path="/admin" /><Button title="Làm mới tài khoản" onPress={data.refresh} disabled={data.loading} />{!statusOnly && <Button title="Tạo tài khoản nội bộ" onPress={() => router.push('/admin/users/new')} />}<Field title="Tìm tên, email hoặc số điện thoại" value={search} onChange={setSearch} maxLength={120} />
    <View style={styles.row}>{['', 'CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(value => <Button key={value} variant={role === value ? 'primary' : 'secondary'} title={`${role === value ? '✓ ' : ''}${value ? label(value) : 'Tất cả vai trò'}`} onPress={() => setRole(value)} />)}</View>
    <View style={styles.row}>{['', 'ACTIVE', 'DISABLED'].map(value => <Button key={value} variant={status === value ? 'primary' : 'secondary'} title={`${status === value ? '✓ ' : ''}${value ? label(value) : 'Tất cả trạng thái'}`} onPress={() => setStatus(value)} />)}</View>
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{items.length} tài khoản phù hợp</Text>}
  </View>;
  return <FlatList keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={data.loading || data.error ? [] : items} ListHeaderComponent={header} keyExtractor={idOf} renderItem={({ item }) => <Navigation title={String(item.fullName || item.email)} description={`${item.email} · ${label(item.role)} · ${label(item.accountStatus)}`} path={`/admin/users/${encodeURIComponent(idOf(item))}`} />} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có tài khoản phù hợp" message="Thử đổi bộ lọc." /> : null} />;
}

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
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản trị viên" title="Chi tiết tài khoản" description="Không hiển thị mật khẩu hoặc hash. Giữ nguyên lịch sử khi vô hiệu hóa." /><Navigation title="Về danh sách tài khoản" path="/admin/users" /><Button title="Làm mới" onPress={data.refresh} disabled={data.loading || Boolean(action)} />{Boolean(notice) && <Text style={styles.success}>{notice}</Text>}{data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : row && <>
    <Panel><RecordView row={row} root="/admin" /></Panel>
    {action ? <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã cập nhật trạng thái tài khoản.'); data.refresh(); }} /> : row.id !== user?.id ? <Button title={row.accountStatus === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'} onPress={() => setAction({ title: row.accountStatus === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản', path: `/admin/users/${encodeURIComponent(id)}/status`, method: 'PATCH', fields: [{ name: 'accountStatus', title: 'Trạng thái mới', required: true, fixed: true, initial: row.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', choices: [{ value: row.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', label: row.accountStatus === 'ACTIVE' ? 'Đã vô hiệu hóa' : 'Đang hoạt động' }] }, { name: '_confirm', title: 'Tôi xác nhận thay đổi trạng thái tài khoản này', required: true, checkbox: true, clientOnly: true }] })} /> : <Text style={styles.copy}>Không vô hiệu hóa tài khoản của phiên đang dùng.</Text>}
  </>}</ScrollView>;
}

export function AdminDashboard() {
  const users = useResource<Row>('/admin/users', true);
  const items = rows(users.data?.items);
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản trị viên" title="Tổng quan hệ thống" description="Thống kê tài khoản và trạng thái truy cập trong hệ thống." />
    <Navigation title="Về tổng quan quản trị" path="/admin" />
    <Button title="Làm mới tổng quan" onPress={users.refresh} disabled={users.loading} />
    {users.loading ? <LoadingState /> : users.error ? <ErrorState message={users.error} onRetry={users.refresh} /> : <Panel title="Tài khoản"><Facts values={['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(role => [label(role), items.filter(row => row.role === role).length])} /><Facts values={['ACTIVE', 'DISABLED'].map(status => [label(status), items.filter(row => row.accountStatus === status).length])} /></Panel>}
    <Navigation title="Quản lý tài khoản người dùng" path="/admin/users" />
  </ScrollView>;
}

export function AdminCreateUser() {
  const action = userCreation();
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản trị viên" title="Tạo tài khoản nội bộ" description="Cấp tài khoản nhân viên hoặc quản lý theo quyền hiện có." />
    <OperationForm action={action} onClose={() => router.replace('/admin/users')} onSaved={created => { const id = idOf(created); router.replace(id ? { pathname: '/admin/users/[id]', params: { id } } : '/admin/users'); }} />
  </ScrollView>;
}
