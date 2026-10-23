import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { adminSections, operationRoot, resources, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Disclosure, Navigation, Panel, styles } from './ui';
import { FunctionMenu, WorkHub } from '@/components/workspace-hub';
import { RecordView } from './record-view';
import { MetricCard } from '@/components/metric-card';

const operationGroups = [
  { title: 'Tiếp nhận & phân công', keys: ['reservations', 'inquiries', 'support-requests'] },
  { title: 'Giao nhận & thay đổi', keys: ['appointments', 'stock-movements', 'renewals', 'transfers', 'returns'] },
  { title: 'Thanh toán & hợp đồng', keys: ['payment-submissions', 'invoices', 'contracts', 'payments', 'deposit-settlements'] },
  { title: 'Kho & khách hàng', keys: ['rentals', 'units', 'customers', 'maintenance', 'catalog', 'additional-services'] },
];
const summaryMetrics = [
  ['pendingReservations', 'Đặt kho chờ duyệt'], ['activeRentals', 'Kho đang thuê'], ['overdueRentals', 'Kho quá hạn'], ['upcomingAppointments', 'Lịch bàn giao sắp tới'], ['pendingRenewals', 'Gia hạn chờ duyệt'], ['openSupportRequests', 'Hỗ trợ đang mở'], ['maintenanceUnits', 'Kho bảo trì'], ['pendingDepositSettlements', 'Cọc chờ quyết toán'], ['availableUnits', 'Kho sẵn sàng'], ['occupiedUnits', 'Kho đang sử dụng'],
] as const;

export function ManagerHome() {
  const { user } = useAuth();
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/dashboard/summary' : null);
  const count = (key: string) => typeof data.data?.[key] === 'number' ? data.data[key] as number : '—';
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý cơ sở" title="Bàn làm việc" description={`Chào ${user?.fullName ?? ''}. Tiếp nhận, phân công và duyệt kết quả theo từng yêu cầu.`} />
    <Button title="Làm mới tổng quan" onPress={data.refresh} disabled={data.loading} />
    <WorkHub title="Việc cần xử lý" description="Đi thẳng đến nhóm hồ sơ, xem chi tiết trước khi xác nhận." actions={[
      { title: 'Duyệt yêu cầu đặt kho', path: '/manager/reservations', description: 'Đối chiếu khách hàng, kỳ thuê và báo giá.', count: count('pendingReservations') },
      { title: 'Phân công nhân viên', path: '/manager/assignments', description: 'Giao hỗ trợ, bảo trì và nhập – xuất hàng cho nhân viên.' },
      { title: 'Lịch bàn giao', path: '/manager/appointments', description: 'Xác nhận lịch để nhân viên chuẩn bị bàn giao.' },
      { title: 'Đối chiếu thanh toán', path: '/manager/payment-submissions', description: 'Kiểm tra thông báo chuyển khoản và khoản tiền thực nhận.' },
      { title: 'Duyệt gia hạn', path: '/manager/renewals', description: 'Đối chiếu hạn cũ – mới và báo giá.', count: count('pendingRenewals') },
      { title: 'Nghiệm thu bảo trì', path: '/manager/maintenance', description: 'Xem kết quả nhân viên gửi và quyết định nghiệm thu.' },
    ]} />
    {data.error && <ErrorState message={data.error} onRetry={data.refresh} />}
    <FunctionMenu groups={operationGroups.map(group => ({ title: group.title, items: group.keys.map(key => ({ title: resources[key].title, path: `/manager/${key}`, description: group.title })) }))} />
    <Disclosure title="Thống kê cơ sở">{data.loading ? <LoadingState /> : data.data && <View style={styles.row}>{summaryMetrics.map(([key, title]) => <MetricCard key={key} label={title} value={count(key)} tone={key === 'overdueRentals' ? 'danger' : 'navy'} />)}</View>}</Disclosure>
    <Navigation title="Báo cáo vận hành" path="/manager/reports" />
    <Navigation title="Tài khoản và đăng xuất" path="/manager/account" />
  </ScrollView>;
}

export function AdminHome() {
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản trị viên" title="Quản lý truy cập" description="Cấp tài khoản cho nhân viên, quản lý và kiểm tra ai đang được truy cập hệ thống." />
    <WorkHub title="Khu vực quản trị" description="Quản trị viên tập trung vào tổng quan và tài khoản. Quản lý phụ trách yêu cầu của khách hàng và phân công công việc." actions={adminSections.map(([key, title]) => ({ title, path: `/admin/${key}`, description: key === 'users' ? 'Tìm người dùng, tạo nhân viên/Quản lý, xem mã tài khoản và bật/tắt truy cập.' : 'Xem số lượng tài khoản và trạng thái hoạt động.' }))} />
    <Navigation title="Tài khoản và đăng xuất" path="/admin/account" />
  </ScrollView>;
}

export function OperationAccount() {
  const { user, logout } = useAuth();
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? ''} description="Thông tin phiên đăng nhập hiện tại." /><Panel><RecordView row={user ? { ...user } : {}} root={operationRoot(user?.role ?? '')} /></Panel><Button title="Đăng xuất" onPress={() => void logout()} /><Text style={styles.copy}>Sau khi đăng xuất, ứng dụng trở về màn hình đăng nhập.</Text></ScrollView>;
}
