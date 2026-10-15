import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { adminSections, operationRoot, resources, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Navigation, Panel, styles } from './ui';
import { RecordView } from './record-view';

export function ManagerHome() {
  const { user } = useAuth();
  const root = operationRoot(user?.role ?? '');
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/dashboard/summary' : null);
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý" title={`Xin chào, ${user?.fullName ?? ''}`} description="Theo dõi và xử lý nghiệp vụ từ hệ thống WDP." />
    <Button title="Làm mới tổng quan" onPress={data.refresh} disabled={data.loading} />
    <Navigation title="Phân công nhân viên" path="/manager/assignments" />
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : data.data && <Panel title="Tổng quan vận hành"><RecordView row={data.data} root={root} /></Panel>}
    {Object.entries(resources).map(([key, config]) => <Navigation key={key} title={config.title} path={`${root}/${key}`} />)}
    <Navigation title="Báo cáo vận hành" path={`${root}/reports`} />
    <Navigation title="Tài khoản và đăng xuất" path="/manager/account" />
  </ScrollView>;
}

export function AdminHome() {
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản trị viên" title="Quản trị hệ thống WDP" description="Tổng quan hệ thống và quản lý tài khoản người dùng." />
    {adminSections.map(([key, title]) => <Navigation key={key} title={title} path={`/admin/${key}`} />)}
    <Navigation title="Tài khoản và đăng xuất" path="/admin/account" />
  </ScrollView>;
}

export function OperationAccount() {
  const { user, logout } = useAuth();
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? ''} description="Thông tin phiên đăng nhập hiện tại." /><Panel><RecordView row={user ? { ...user } : {}} root={operationRoot(user?.role ?? '')} /></Panel><Button title="Đăng xuất" onPress={() => void logout()} /><Text style={styles.copy}>Sau khi đăng xuất, ứng dụng trở về màn hình đăng nhập.</Text></ScrollView>;
}
