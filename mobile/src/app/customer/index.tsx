import { RefreshControl, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { ReservationTimeline, SectionHeader, StorageUnitCard } from '@/components/customer-ui';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { FunctionMenu, WorkHub } from '@/components/workspace-hub';
import { useResource } from '@/operations/use-resource';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { codeOf, idOf, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { ActivitySummary } from '@/activity/ActivityCenter';

const groups = [
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
    { title: 'Thông báo chuyển khoản', path: '/customer/payment-submissions', description: 'Xem kết quả WDP đối chiếu tiền đã chuyển.' },
  ] },
  { title: 'Kho & hàng của tôi', items: [
    { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Hợp đồng hoạt động và các yêu cầu tiếp theo.' },
    { title: 'Nhập – xuất hàng', path: '/customer/stock-movements', description: 'Gửi/lấy hàng và theo dõi nhân viên kiểm đếm.' },
    { title: 'Hàng đang lưu', path: '/customer/stored-items', description: 'Số lượng thực tế theo hợp đồng.' },
  ] },
  { title: 'Thay đổi & hỗ trợ', items: [
    { title: 'Gia hạn', path: '/customer/renewals', description: 'Theo dõi duyệt, báo giá và thanh toán gia hạn.' },
    { title: 'Trả kho', path: '/customer/returns', description: 'Theo dõi kiểm tra sau khi trả kho.' },
    { title: 'Quyết toán tiền cọc', path: '/customer/deposit-settlements', description: 'Đối chiếu hoàn cọc và các khoản cần xử lý.' },
    { title: 'Yêu cầu chuyển kho', path: '/customer/transfers', description: 'Đề nghị WDP xem xét chuyển kho qua hỗ trợ.' },
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
  const activeRental = rentals.data?.items[0];
  const latestReservation = reservations.data?.slice().sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)))[0];
  const upcomingAppointment = appointments.data?.items.find(item => ['REQUESTED', 'CONFIRMED'].includes(String(item.status)));
  const count = (source: {loading: boolean; error?: string}, value: number) => source.loading || source.error ? '—' : value;
  const opening = sources.some(item => item.loading) && !rentals.data && !invoices.data && !reservations.data && !appointments.data;
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={!opening && sources.some(item => item.loading)} onRefresh={refresh} tintColor="#187D78" />} contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Trang chủ" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Thông tin quan trọng cho kho thuê của bạn, được cập nhật từ hệ thống WDP." />
    <Button title={sources.some(item => item.loading) ? 'Đang cập nhật…' : 'Làm mới tổng quan'} onPress={refresh} disabled={sources.some(item => item.loading)} />
    <ActivitySummary />
    {opening ? <LoadingState label="Đang tải tổng quan của bạn…" /> : <>
      {activeRental ? <><SectionHeader title="Kho của bạn" action={{ label: 'Xem tất cả', path: '/customer/rentals' }} /><StorageUnitCard rental={activeRental} onPress={() => router.push(`/customer/rentals/${encodeURIComponent(idOf(activeRental))}`)} /></> : <Panel title="Bắt đầu thuê kho"><Text style={styles.copy}>Bạn chưa có kỳ thuê đang hoạt động. Sau khi WDP xác nhận yêu cầu, tiến trình thanh toán và bàn giao sẽ hiển thị tại đây.</Text><Navigation title="Theo dõi yêu cầu đặt kho" description="Xem yêu cầu gần nhất và việc cần làm tiếp theo." path="/customer/reservations" /></Panel>}
      {payable.length > 0 && <Panel title="Cần thanh toán"><Text style={styles.copy}>Bạn còn {formatMoney(payable.reduce((sum, item) => sum + Number(item.balanceDue), 0))} cần được xử lý. Trạng thái chỉ cập nhật sau khi WDP xác nhận giao dịch.</Text><Navigation title="Mở hóa đơn và thanh toán" description={`${payable.length} hóa đơn đang chờ thanh toán.`} path="/customer/invoices" /></Panel>}
      {upcomingAppointment && <Panel title="Lịch bàn giao"><Text style={styles.copy}>Bạn có một lịch bàn giao đang chờ xử lý hoặc đã xác nhận.</Text><Navigation title="Xem lịch bàn giao" description={codeOf(upcomingAppointment)} path="/customer/appointments" /></Panel>}
      {latestReservation && <><SectionHeader title="Tiến trình yêu cầu gần nhất" action={{ label: 'Xem tất cả', path: '/customer/reservations' }} /><ReservationTimeline reservation={latestReservation} /></>}
    </>}
    {sources.filter(item => item.error).map((item, index) => <ErrorState key={index} message={item.error!} onRetry={item.refresh} />)}
    {!opening && <WorkHub title="Việc bạn cần làm" description="Mở đúng hồ sơ để xem hướng dẫn và thao tác được hệ thống cho phép." actions={[
      { title: 'Hóa đơn & thanh toán', path: '/customer/invoices', description: payable.length ? `Còn ${formatMoney(payable.reduce((sum, item) => sum + Number(item.balanceDue), 0))}.` : 'Xem hóa đơn, giao dịch và thông báo chuyển khoản.', count: count(invoices, payable.length) },
      { title: 'Lịch nhận kho', path: '/customer/appointments', description: 'Xem giờ hẹn đã xác nhận và hướng dẫn nhận kho.', count: count(appointments, appointments.data?.items.filter(item => ['REQUESTED', 'CONFIRMED'].includes(String(item.status))).length ?? 0) },
      { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Xem kỳ thuê, gia hạn, trả kho và gửi hỗ trợ.', count: count(rentals, rentals.data?.total ?? 0) },
    ]} />}
    <SectionHeader title="Dịch vụ khác" />
    <FunctionMenu groups={groups} />
    <Navigation title="Tài khoản và đăng xuất" path="/customer/account" />
  </ScrollView>;
}
