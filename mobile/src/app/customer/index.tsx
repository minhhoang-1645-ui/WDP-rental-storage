import { RefreshControl, ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { WorkHub } from '@/components/workspace-hub';
import { useResource } from '@/operations/use-resource';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { codeOf, label, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { ActivitySummary } from '@/activity/ActivityCenter';

export const groups = [
  { title: 'Tìm và đặt kho', items: [
    { title: 'Tìm kho', path: '/customer/discover', description: 'Xem loại kho và kiểm tra khả dụng theo ngày thuê.' },
    { title: 'Tìm kích thước kho', path: '/customer/size-finder', description: 'Ước tính nhóm kho theo đồ dùng của bạn.' },
  ] },
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
  const opening = sources.some(item => item.loading) && !rentals.data && !invoices.data && !reservations.data && !appointments.data;
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={!opening && sources.some(item => item.loading)} onRefresh={refresh} tintColor="#187D78" />} contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Trang chủ" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Theo dõi đơn đặt, thanh toán và kho bạn đang sử dụng tại NestBox." />
    <Button title={sources.some(item => item.loading) ? 'Đang cập nhật…' : 'Làm mới tổng quan'} onPress={refresh} disabled={sources.some(item => item.loading)} />
    <ActivitySummary />
    <WorkHub title="Bạn muốn làm gì hôm nay?" description="Yêu cầu, thanh toán và nhận kho được đặt ở đầu để dễ theo dõi." actions={[
      { title: 'Theo dõi yêu cầu', path: '/customer/reservations', description: 'Xem kết quả xác nhận và hạn giữ kho của bạn.', count: count(reservations, reservations.data?.filter(item => item.status === 'PENDING').length ?? 0) },
      { title: 'Hóa đơn & thanh toán', path: '/customer/invoices', description: invoices.loading || invoices.error ? 'Xem hóa đơn và kết quả đối chiếu.' : payable.length ? `Còn ${formatMoney(payable.reduce((sum, item) => sum + Number(item.balanceDue), 0))}. Mở để xem chi tiết.` : 'Xem hóa đơn, khoản đã trả và thông báo chuyển khoản.', count: count(invoices, payable.length) },
      { title: 'Lịch nhận kho', path: '/customer/appointments', description: 'Xem giờ hẹn đã xác nhận và hướng dẫn nhận kho của bạn.', count: count(appointments, appointments.data?.items.filter(item => ['REQUESTED','CONFIRMED'].includes(String(item.status))).length ?? 0) },
      { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Xem kho hoạt động, gia hạn và gửi hỗ trợ.', count: count(rentals, rentals.data?.total ?? 0) },
    ]} />
    {sources.filter(item => item.error).map((item, index) => <ErrorState key={index} message={item.error!} onRetry={item.refresh} />)}
    <Navigation title="Tìm kho và chọn vị trí 2D" description="Chọn loại kho, ngày thuê rồi chọn kho trống trên sơ đồ." path="/customer/discover" />
    <Panel title="Yêu cầu gần đây">{reservations.loading ? <LoadingState /> : !reservations.error && (reservations.data?.length ? [...reservations.data].sort((a,b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))).slice(0,3).map(item => <Navigation key={String(item.id)} title={codeOf(item)} description={`${label(item.status)} · ${String((item.product as Row)?.name ?? 'Yêu cầu đặt kho')}`} path={`/customer/reservations/${encodeURIComponent(String(item.id))}`} />) : <Text style={styles.copy}>Chưa có yêu cầu. Bạn có thể chọn loại kho và gửi yêu cầu trên website NestBox.</Text>)}</Panel>
    <Navigation title="Tất cả dịch vụ" description="Hợp đồng, nhập xuất hàng, gia hạn, trả kho và hỗ trợ." path="/customer/services" />
    <Navigation title="Tài khoản và đăng xuất" path="/customer/account" />
  </ScrollView>;
}
