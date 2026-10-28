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
import { ActivitySummary } from '@/activity/ActivityCenter';
import { useActivity } from '@/activity/context';
import { awaitingAssignment, isOverdueInvoice } from '@/utils/work-queue';
import { formatMoney } from '@/utils/format';
import { activitySources } from '@/utils/activity';

const operationGroups = [
  { title: 'Thanh toán & hợp đồng', keys: ['payment-submissions', 'invoices', 'contracts', 'payments'] },
  { title: 'Kho & khách hàng', keys: ['rentals', 'units', 'customers', 'catalog', 'additional-services'] },
];
const summaryMetrics = [
  ['activeRentals', 'Kỳ thuê đang hoạt động'], ['overdueRentals', 'Kỳ thuê quá hạn'], ['maintenanceUnits', 'Kho đang bảo trì'], ['availableUnits', 'Kho sẵn sàng'], ['occupiedUnits', 'Kho đang sử dụng'],
] as const;

export function ManagerHome() {
  const { user } = useAuth();
  const activity = useActivity();
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/dashboard/summary' : null);
  const count = (key: string) => typeof data.data?.[key] === 'number' ? data.data[key] as number : '—';
  const invoices = activity.data.invoices ?? [];
  const overdue = invoices.filter(row => isOverdueInvoice(row));
  const unassigned = ['support-requests', 'maintenance', 'stock-movements'].flatMap(kind => (activity.data[kind] ?? []).filter(row => awaitingAssignment(kind, row)));
  const pendingPayments = (activity.data['payment-submissions'] ?? []).filter(row => row.status === 'PENDING_VERIFICATION');
  const sourceCount = (kinds: string[], value: number) => activity.loading || kinds.some(kind => !activity.data[kind] || activity.failed.includes(activitySources('MANAGER').find(source => source.kind === kind)!.title)) ? '—' : value;
  const refresh = () => { data.refresh(); activity.refresh(); };
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý cơ sở" title="Bàn làm việc" description={`Chào ${user?.fullName ?? ''}. Theo dõi cơ sở, hợp đồng và xử lý các khoản thanh toán.`} />
    <Button title="Làm mới tổng quan" onPress={refresh} disabled={data.loading || activity.checking} />
    <ActivitySummary />
    <WorkHub title="Việc cần xử lý" description="Đi thẳng đến nhóm hồ sơ, xem chi tiết trước khi xác nhận." actions={[
      { title: 'Phân công nhân viên', path: '/manager/assignments?assignment=unassigned', description: 'Giao hỗ trợ, bảo trì và nhập – xuất hàng cho nhân viên.', count: sourceCount(['support-requests', 'maintenance', 'stock-movements'], unassigned.length) },
      { title: 'Chờ xác nhận thanh toán', path: '/manager/payment-submissions', description: 'Kiểm tra thông báo chuyển khoản và khoản tiền thực nhận.', count: sourceCount(['payment-submissions'], pendingPayments.length) },
      { title: 'Hóa đơn & công nợ', path: '/manager/invoices', description: activity.data.invoices && !activity.failed.includes('Hóa đơn') ? `${overdue.length} hóa đơn quá hạn. Kiểm tra hạn trả và lịch sử thu tiền.` : 'Kiểm tra số tiền còn phải thu, hạn trả và lịch sử thu tiền.', count: sourceCount(['invoices'], overdue.length) },
    ]} />
    {data.error && <ErrorState message={data.error} onRetry={data.refresh} />}
    <Panel title="Theo dõi công nợ"><Text style={styles.copy}>{activity.data.invoices && !activity.failed.includes('Hóa đơn') ? `Tổng dư nợ: ${formatMoney(invoices.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0))}. Quá hạn: ${formatMoney(overdue.reduce((sum, row) => sum + Number(row.balanceDue), 0))}.` : 'Chưa tải đủ hóa đơn để tổng hợp.'}</Text><Navigation title="Xem hóa đơn" path="/manager/invoices" /></Panel>
    <FunctionMenu groups={[{ title: 'Giám sát & nhân sự', items: [{ title: 'Phân công nhân viên', path: '/manager/assignments', description: 'Theo dõi người phụ trách và tiến độ công việc.' }, { title: 'Đề nghị trả trước hạn', path: '/manager/early-returns', description: 'Đối chiếu công nợ và phản hồi đề nghị của khách.' }, { title: 'Báo cáo vận hành', path: '/manager/reports', description: 'Hóa đơn, khoản thu và tình hình sử dụng kho.' }] }, ...operationGroups.map(group => ({ title: group.title, items: group.keys.map(key => ({ title: resources[key].title, path: `/manager/${key}`, description: group.title })) }))]} />
    <Disclosure title="Thống kê cơ sở">{data.loading ? <LoadingState /> : data.data && <View style={styles.row}>{summaryMetrics.map(([key, title]) => <MetricCard key={key} label={title} value={count(key)} tone={key === 'overdueRentals' ? 'danger' : 'navy'} />)}</View>}</Disclosure>
    <Navigation title="Báo cáo vận hành" path="/manager/reports" />
    <Navigation title="Tài khoản và đăng xuất" path="/manager/account" />
  </ScrollView>;
}

export function AdminHome() {
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản trị viên" title="Quản lý truy cập" description="Cấp tài khoản cho nhân viên, quản lý và kiểm tra ai đang được truy cập hệ thống." />
    <ActivitySummary />
    <WorkHub title="Khu vực quản trị" description="Quản trị viên quản lý tài khoản và quyền truy cập. Nhân viên xử lý yêu cầu khách hàng; quản lý phân công và đối chiếu tài chính." actions={adminSections.map(([key, title]) => ({ title, path: `/admin/${key}`, description: key === 'users' ? 'Tìm người dùng, tạo nhân viên/quản lý và bật/tắt truy cập.' : 'Xem số lượng tài khoản và trạng thái hoạt động.' }))} />
    <Navigation title="Tài khoản và đăng xuất" path="/admin/account" />
  </ScrollView>;
}

export function OperationAccount() {
  const { user, logout } = useAuth();
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? ''} description="Thông tin phiên đăng nhập hiện tại." /><Panel><RecordView row={user ? { ...user } : {}} root={operationRoot(user?.role ?? '')} /></Panel><Button title="Đăng xuất" onPress={() => void logout()} /><Text style={styles.copy}>Sau khi đăng xuất, ứng dụng trở về màn hình đăng nhập.</Text></ScrollView>;
}
