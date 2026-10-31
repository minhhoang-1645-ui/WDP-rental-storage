import { managerPrimaryMenu } from '@/utils/manager-sections';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { CapacityBar } from '@/components/capacity-bar';
import { adminSections, operationRoot, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Disclosure, Navigation, Panel, styles } from './ui';
import { FunctionMenu, WorkHub } from '@/components/workspace-hub';
import { RecordView } from './record-view';
import { MetricCard } from '@/components/metric-card';
import { ActivitySummary } from '@/activity/ActivityCenter';
import { useActivity } from '@/activity/context';
import { assignmentNeedsAttention, isOverdueInvoice, managerNeedsAction } from '@/utils/work-queue';
import { formatMoney } from '@/utils/format';
import { activitySources } from '@/utils/activity';
import { WdpColors } from '@/constants/wdp-theme';

const summaryMetrics = [
  ['activeRentals', 'Kỳ thuê đang hoạt động'], ['overdueRentals', 'Kỳ thuê quá hạn'], ['maintenanceUnits', 'Kho đang bảo trì'], ['availableUnits', 'Kho sẵn sàng'], ['occupiedUnits', 'Kho đang sử dụng'],
] as const;

export function ManagerHome() {
  const { user } = useAuth();
  const activity = useActivity();
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/dashboard/summary' : null);
  const units = useResource<Row>(user?.role === 'MANAGER' ? '/manager/units' : null, true);
  const count = (key: string) => typeof data.data?.[key] === 'number' ? data.data[key] as number : '—';
  const invoices = activity.data.invoices ?? [];
  const overdue = invoices.filter(row => isOverdueInvoice(row));
  const outstanding = invoices.filter(row => ['OPEN', 'PARTIALLY_PAID'].includes(String(row.status)) && Number(row.balanceDue) > 0);
  const unassigned = ['support-requests', 'maintenance', 'stock-movements'].flatMap(kind => (activity.data[kind] ?? []).filter(row => assignmentNeedsAttention(kind, row)));
  const pendingPayments = (activity.data['payment-submissions'] ?? []).filter(row => row.status === 'PENDING_VERIFICATION');
  const pendingDeposits = (activity.data['deposit-settlements'] ?? []).filter(row => managerNeedsAction('deposit-settlements', row));
  const sourceCount = (kinds: string[], value: number) => activity.loading || kinds.some(kind => !activity.data[kind] || activity.failed.includes(activitySources('MANAGER').find(source => source.kind === kind)!.title)) ? '—' : value;
  const financeReady = Boolean(activity.data.invoices) && !activity.failed.includes('Hóa đơn');
  const unitItems = (units.data as { items?: Row[]; total?: number })?.items ?? [];
  const unitTotal = (units.data as { total?: number })?.total ?? 0;
  const unitCount = (status: string) => unitItems.filter((row: Row) => row.status === status).length;
  const refresh = () => { data.refresh(); units.refresh(); activity.refresh(); };
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý cơ sở" title="Bàn làm việc" description={`Chào ${user?.fullName ?? ''}. Theo dõi cơ sở, hợp đồng và xử lý các khoản thanh toán.`} />
    <Button title="Làm mới tổng quan" onPress={refresh} disabled={data.loading || activity.checking} />
    <ActivitySummary />
    {unitTotal > 0 && <Panel title="Tình trạng kho"><CapacityBar total={unitTotal} segments={[
      { value: unitCount('OCCUPIED'), color: WdpColors.navy, label: 'Đang dùng' },
      { value: unitCount('AVAILABLE'), color: WdpColors.teal, label: 'Sẵn sàng' },
      { value: unitCount('RESERVED'), color: WdpColors.amber, label: 'Đã giữ' },
      { value: unitCount('MAINTENANCE'), color: WdpColors.muted, label: 'Bảo trì' },
    ]} /><Text style={styles.copy}>{unitTotal} kho vật lý tại cơ sở</Text></Panel>}
    <WorkHub title="Việc cần xử lý" description="Đi thẳng đến nhóm hồ sơ, xem chi tiết trước khi xác nhận." actions={[
      { title: 'Hộp thư quyết định', path: '/manager/approvals', description: 'Đối chiếu chuyển khoản, quyết toán cọc, đối soát VNPay và các hồ sơ cần Manager quyết định.', count: sourceCount(['payment-submissions', 'deposit-settlements'], pendingPayments.length + pendingDeposits.length) },
      { title: 'Phân công nhân viên', path: '/manager/assignments?assignment=attention', description: 'Giao người còn thiếu hoặc thay nhân viên đã vô hiệu hóa.', count: sourceCount(['support-requests', 'maintenance', 'stock-movements'], unassigned.length) },
      { title: 'Chờ xác nhận thanh toán', path: '/manager/payment-submissions', description: 'Kiểm tra thông báo chuyển khoản và khoản tiền thực nhận.', count: sourceCount(['payment-submissions'], pendingPayments.length) },
      { title: 'Hóa đơn & công nợ', path: '/manager/invoices', description: activity.data.invoices && !activity.failed.includes('Hóa đơn') ? `${overdue.length} hóa đơn quá hạn. Kiểm tra hạn trả và lịch sử thu tiền.` : 'Kiểm tra số tiền còn phải thu, hạn trả và lịch sử thu tiền.', count: sourceCount(['invoices'], overdue.length) },
      ...[['support-requests', 'Hỗ trợ cần quyết định', '/manager/support-requests?status=ESCALATED'], ['maintenance', 'Chờ nghiệm thu bảo trì', '/manager/maintenance?status=AWAITING_VERIFICATION'], ['deposit-settlements', 'Quyết toán tiền cọc', '/manager/deposit-settlements'], ['online-payment-reconciliations', 'Đối soát VNPay', '/manager/online-payment-reconciliations']].map(([kind, title, path]) => ({ title, path, description: 'Mở hồ sơ cần quản lý kiểm tra và xác nhận.', count: sourceCount([kind], (activity.data[kind] ?? []).filter(row => managerNeedsAction(kind, row) && !assignmentNeedsAttention(kind, row)).length) })),
    ]} />
    {data.error && <ErrorState message={data.error} onRetry={data.refresh} />}
    <Panel title="Theo dõi công nợ"><View style={{ gap: 6 }}><View style={styles.row}><MetricCard label="Tổng dư nợ" value={financeReady ? formatMoney(outstanding.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)) : '—'} tone="navy" /><MetricCard label="Quá hạn" value={financeReady ? formatMoney(overdue.reduce((sum, row) => sum + Number(row.balanceDue), 0)) : '—'} tone="danger" /></View><Text style={styles.copy}>{financeReady ? `${outstanding.length} hóa đơn còn số dư, ${overdue.length} quá hạn.` : 'Chưa tải đủ hóa đơn để tổng hợp.'}</Text></View><Navigation title="Xem hóa đơn" path="/manager/invoices" /></Panel>
    <FunctionMenu groups={[{ title:'Chức năng của quản lý', items:managerPrimaryMenu.filter(item=>item.key).map(item=>({ title:item.title, path:'/manager/'+item.key,description:'Mở đúng nhóm công việc quản lý.' })) }]} />
    <Disclosure title="Thống kê cơ sở">{data.loading ? <LoadingState /> : data.data && <View style={styles.row}>{summaryMetrics.map(([key, title]) => <MetricCard key={key} label={title} value={count(key)} tone={key === 'overdueRentals' ? 'danger' : 'navy'} />)}</View>}</Disclosure>
    <Navigation title="Báo cáo vận hành" path="/manager/reports" />
    <Navigation title="Đề nghị trả trước hạn" path="/manager/early-returns" />
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
