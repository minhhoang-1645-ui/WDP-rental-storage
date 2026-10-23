import { CalendarDays, CircleHelp, ClipboardList, CreditCard, PackageOpen, Plus, RefreshCw, ArrowRight, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { useApiResource } from '../../services/useApiResource';
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader, ReservationStatus } from '../../components/customer/CustomerPortalUi';
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired';
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers';
import { CustomerJourney, WorkHub } from '../../components/workspace/WorkHub';
import type { PendingReservation } from '../../types/booking';
import type { CustomerAppointment, CustomerInvoice, CustomerRental } from '../../types/customer';

export function CustomerDashboardPage() {
  const { user } = useAuth();
  const reservations = useApiResource<PendingReservation[]>('/reservations', user?.id, true);
  const rentals = usePaginatedResource<CustomerRental>('/customer/rentals', user?.id, true);
  const appointments = usePaginatedResource<CustomerAppointment>('/customer/appointments', user?.id, true);
  const invoices = usePaginatedResource<CustomerInvoice>('/customer/invoices', user?.id, true);
  const sources = [reservations, rentals, appointments, invoices];
  const refresh = () => sources.forEach(source => source.refresh());
  const pending = (reservations.data ?? []).filter(item => item.status === 'PENDING');
  const payable = (invoices.data?.items ?? []).filter(item => ['OPEN', 'PARTIALLY_PAID'].includes(item.status) && item.balanceDue > 0);
  const openAppointments = (appointments.data?.items ?? []).filter(item => ['REQUESTED', 'CONFIRMED'].includes(item.status));
  const count = (source: { loading: boolean; error: string }, value: number) => source.loading || source.error ? '—' : value;
  return <section className="customer-page workspace-home">
    <PortalPageHeader eyebrow="Khu vực khách hàng" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Kho thuê, yêu cầu và việc cần làm của bạn — theo dõi ngay tại đây." action={<div className="customer-header-actions"><button className="button-secondary" onClick={refresh} disabled={sources.some(source => source.loading)}><RefreshCw size={17} />Làm mới</button><Link className="button-primary" to="/booking"><Plus size={17} />Chọn kho & đặt thuê</Link></div>} />
    <WorkHub title="Bạn muốn làm gì hôm nay?" description="Mở đúng việc cần làm, không cần tìm qua nhiều màn hình." actions={[
      { title: 'Theo dõi yêu cầu', description: 'Xem WDP đã tiếp nhận, duyệt hay cần bạn bổ sung bước nào.', to: '/customer/reservations', icon: ClipboardList, count: count(reservations, pending.length), tone: pending.length ? 'attention' : 'normal' },
      { title: 'Hóa đơn & thanh toán', description: invoices.loading || invoices.error ? 'Xem số tiền cần trả và kết quả đối chiếu.' : payable.length ? `Còn ${moneyLabel(payable.reduce((sum, item) => sum + item.balanceDue, 0))}. Mở để xem từng hóa đơn.` : 'Xem hóa đơn, khoản đã trả và thông báo chuyển khoản.', to: '/customer/payments', icon: CreditCard, count: count(invoices, payable.length), tone: payable.length ? 'attention' : 'normal' },
      { title: 'Lịch nhận kho', description: 'Chọn lịch phù hợp, xem xác nhận và đến nhận kho đúng hẹn.', to: '/customer/appointments', icon: CalendarDays, count: count(appointments, openAppointments.length) },
      { title: 'Kho đang thuê', description: 'Xem hợp đồng đang hoạt động, gia hạn hoặc gửi hỗ trợ.', to: '/customer/rentals', icon: PackageOpen, count: count(rentals, rentals.data?.total ?? 0) },
    ]} />
    {sources.filter(source => source.error).map((source, index) => <PortalError key={index} message={source.error} onRetry={source.refresh} />)}
    <CustomerJourney />
    <div className="customer-dashboard-grid">
      <section className="customer-panel"><div className="customer-panel-heading"><div><h2>Yêu cầu gần đây</h2><p>Theo dõi tiến độ từng yêu cầu đặt kho của bạn.</p></div><Link to="/customer/reservations">Xem tất cả <ArrowRight size={15} /></Link></div>
        {reservations.status === 401 ? <CustomerSessionExpired /> : reservations.loading ? <PortalLoading label="Đang tải yêu cầu…" /> : reservations.error ? null : !reservations.data?.length ? <PortalEmpty title="Bắt đầu với kho phù hợp"><span>Chọn kích thước, thời gian và dịch vụ để gửi yêu cầu thuê kho.</span><Link className="button-primary" to="/booking">Chọn kho ngay</Link></PortalEmpty> : <div className="customer-recent-list">{[...reservations.data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4).map(item => <Link key={item.id} to={`/customer/reservations/${encodeURIComponent(item.id)}`} className="customer-recent-item"><div><strong>{item.product.name} · {item.quantity} kho</strong><span>{item.id} · {formatPortalDate(item.createdAt)}</span><small>{item.status === 'PENDING' ? 'WDP đang xem xét yêu cầu của bạn.' : item.status === 'CONFIRMED' ? 'Mở hồ sơ để theo dõi hợp đồng, thanh toán và nhận kho.' : 'Mở hồ sơ để xem kết quả xử lý.'}</small></div><div><ReservationStatus status={item.status} /><ArrowRight size={17} /></div></Link>)}</div>}
      </section>
      <section className="customer-panel"><div className="customer-panel-heading"><div><h2>Hàng hóa & hỗ trợ</h2><p>Những việc thường dùng sau khi nhận kho.</p></div></div><div className="workspace-shortcuts"><Link to="/customer/stock-movements"><Boxes size={20} /><div><strong>Gửi hàng / lấy hàng</strong><span>Gửi yêu cầu giao nhận và theo dõi tiến độ.</span></div><ArrowRight size={16} /></Link><Link to="/customer/stored-items"><PackageOpen size={20} /><div><strong>Hàng đang lưu</strong><span>Xem số lượng tồn đã được kiểm đếm.</span></div><ArrowRight size={16} /></Link><Link to="/customer/support"><CircleHelp size={20} /><div><strong>Cần WDP hỗ trợ?</strong><span>Gửi câu hỏi và theo dõi phản hồi.</span></div><ArrowRight size={16} /></Link></div></section>
    </div>
  </section>;
}
