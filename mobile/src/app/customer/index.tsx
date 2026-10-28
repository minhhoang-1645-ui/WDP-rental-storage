import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { FunctionMenu, WorkHub } from '@/components/workspace-hub';
import { useResource } from '@/operations/use-resource';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { codeOf, label, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { ActivitySummary } from '@/activity/ActivityCenter';

const groups = [
  { title: 'Đặt kho & nhận kho', items: [
    { title: 'Yêu cầu đặt kho', path: '/customer/reservations', description: 'Xem trạng thái và kết quả duyệt yêu cầu.' },
    { title: 'Hóa đơn & thanh toán', path: '/customer/invoices', description: 'QR, VNPay và số tiền còn phải trả.' },
    { title: 'Lịch nhận kho', path: '/customer/appointments', description: 'Đặt lịch, xem xác nhận và kết quả bàn giao.' },
    { title: 'Hợp đồng', path: '/customer/contracts', description: 'Thông tin kỳ thuê và kho được cấp.' },
    { title: 'Lịch sử thanh toán', path: '/customer/payment-history', description: 'Các khoản tiền đã được ghi nhận.' },
    { title: 'Thông báo chuyển khoản', path: '/customer/payment-submissions', description: 'Xem kết quả NestBox đối chiếu tiền đã chuyển.' },
  ] },
  { title: 'Kho & hàng của tôi', items: [
    { title: 'Lịch sử đặt kho', path: '/customer/booking-history', description: 'Xem toàn bộ đơn, kho đã trả và đơn đã hủy hoặc hết hạn.' },
    { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Hợp đồng hoạt động và các yêu cầu tiếp theo.' },
    { title: 'Nhập – xuất hàng', path: '/customer/stock-movements', description: 'Gửi/lấy hàng và theo dõi nhân viên kiểm đếm.' },
    { title: 'Hàng đang lưu', path: '/customer/stored-items', description: 'Số lượng thực tế theo hợp đồng.' },
  ] },
  { title: 'Thay đổi & hỗ trợ', items: [
    { title: 'Gia hạn', path: '/customer/renewals', description: 'Theo dõi duyệt, báo giá và thanh toán gia hạn.' },
    { title: 'Trả kho', path: '/customer/returns', description: 'Theo dõi kiểm tra sau khi trả kho.' },
    { title: 'Quyết toán tiền cọc', path: '/customer/deposit-settlements', description: 'Đối chiếu hoàn cọc và các khoản cần xử lý.' },
    { title: 'Yêu cầu chuyển kho', path: '/customer/transfers', description: 'Đề nghị NestBox xem xét chuyển kho qua hỗ trợ.' },
    { title: 'Hỗ trợ', path: '/customer/support-requests', description: 'Gửi câu hỏi, xem phản hồi và tiến độ xử lý.' },
  ] },
];
export default function CustomerHomeScreen() {
  const { user } = useAuth();
  const rentals = useResource<{items: Row[]; total: number}>('/customer/rentals', true);
  const invoices = useResource<{items: Row[]}>('/customer/invoices', true);
  const reservations = useResource<Row[]>('/reservations');
  const appointments = useResource<{items: Row[]}>('/customer/appointments', true);
  const sources = [rentals, invoices, reservations, appointments], refresh = () => sources.forEach(item => item.refresh());
  const payable = invoices.data?.items.filter(item => ['OPEN', 'PARTIALLY_PAID'].includes(String(item.status)) && Number(item.balanceDue) > 0) ?? [];
  const count = (source: {loading: boolean; error?: string}, value: number) => source.loading || source.error ? '—' : value;
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Tài khoản của tôi" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Theo dõi kho thuê và mở ngay việc bạn cần làm." />
    <Button title="Làm mới tổng quan" onPress={refresh} disabled={sources.some(item => item.loading)} />
    <ActivitySummary />
    <WorkHub title="Bạn muốn làm gì hôm nay?" description="Yêu cầu, thanh toán và nhận kho được đặt ở đầu để dễ theo dõi." actions={[
      { title: 'Theo dõi yêu cầu', path: '/customer/reservations', description: 'Xem kết quả xác nhận và hạn giữ kho của bạn.', count: count(reservations, reservations.data?.filter(item => item.status === 'PENDING').length ?? 0) },
      { title: 'Hóa đơn & thanh toán', path: '/customer/invoices', description: invoices.loading || invoices.error ? 'Xem hóa đơn và kết quả đối chiếu.' : payable.length ? `Còn ${formatMoney(payable.reduce((sum, item) => sum + Number(item.balanceDue), 0))}. Mở để xem chi tiết.` : 'Xem hóa đơn, khoản đã trả và thông báo chuyển khoản.', count: count(invoices, payable.length) },
      { title: 'Lịch nhận kho', path: '/customer/appointments', description: 'Xem giờ hẹn đã xác nhận và hướng dẫn nhận kho của bạn.', count: count(appointments, appointments.data?.items.filter(item => ['REQUESTED','CONFIRMED'].includes(String(item.status))).length ?? 0) },
      { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Xem kho hoạt động, gia hạn và gửi hỗ trợ.', count: count(rentals, rentals.data?.total ?? 0) },
    ]} />
    {sources.filter(item => item.error).map((item, index) => <ErrorState key={index} message={item.error!} onRetry={item.refresh} />)}
    <Panel title="Quy trình thuê kho"><Text style={styles.copy}>Chọn kho trên website → xác nhận tự động khi đủ điều kiện → thanh toán trong hạn giữ kho → đặt lịch nhận kho → nhận kho và gửi hàng.</Text><Text style={styles.copy}>Mỗi hồ sơ có tiến độ riêng. Gia hạn, trả kho và hỗ trợ nằm trong các nhóm chức năng bên dưới.</Text></Panel>
    <Panel title="Yêu cầu gần đây">{reservations.loading ? <LoadingState /> : !reservations.error && (reservations.data?.length ? [...reservations.data].sort((a,b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))).slice(0,3).map(item => <Navigation key={String(item.id)} title={codeOf(item)} description={`${label(item.status)} · ${String((item.product as Row)?.name ?? 'Yêu cầu đặt kho')}`} path={`/customer/reservations/${encodeURIComponent(String(item.id))}`} />) : <Text style={styles.copy}>Chưa có yêu cầu. Bạn có thể chọn loại kho và gửi yêu cầu trên website NestBox.</Text>)}</Panel>
    <FunctionMenu groups={groups} />
    <Navigation title="Tài khoản và đăng xuất" path="/customer/account" />
  </ScrollView>;
}
