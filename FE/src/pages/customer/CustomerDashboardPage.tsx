import { newestFirst } from '../../utils/record-identity';
import { ArrowRight, Boxes, CircleHelp, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useActivity } from '../../activity/context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { useApiResource } from '../../services/useApiResource';
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader, ReservationStatus } from '../../components/customer/CustomerPortalUi';
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired';
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers';
import { CustomerJourney } from '../../components/workspace/WorkHub';
import { InternalKpis, InternalPriority } from '../../components/workspace/InternalDashboard';
import { CustomerRentalProgress } from '../../components/customer/CustomerRentalProgress';
import type { PendingReservation } from '../../types/booking';
import type { CustomerAppointment, CustomerInvoice, CustomerRental } from '../../types/customer';

export function CustomerDashboardPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const reservations = useApiResource<PendingReservation[]>('/reservations', user?.id, true);
  const rentals = usePaginatedResource<CustomerRental>('/customer/rentals', user?.id, true);
  const appointments = usePaginatedResource<CustomerAppointment>('/customer/appointments', user?.id, true);
  const invoices = usePaginatedResource<CustomerInvoice>('/customer/invoices', user?.id, true);
  const sources = [reservations, rentals, appointments, invoices];
  const refresh = () => { sources.forEach(source => source.refresh()); activity.refresh(); };
  const pending = (reservations.data ?? []).filter(item => item.status === 'PENDING');
  const payable = (invoices.data?.items ?? []).filter(item => ['OPEN', 'PARTIALLY_PAID'].includes(item.status) && item.balanceDue > 0);
  const upcoming = (appointments.data?.items ?? []).filter(item => ['REQUESTED', 'CONFIRMED'].includes(item.status));
  const count = (source: { loading: boolean; error: string }, value: number) => source.loading || source.error ? '—' : value;
  const recent = newestFirst(reservations.data ?? []).slice(0, 5);
  return <section className="customer-page workspace-home">
    <PortalPageHeader eyebrow="Tổng quan" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Theo dõi kho thuê và những việc cần hoàn tất." action={<div className="customer-header-actions"><button className="button-secondary" onClick={refresh} disabled={sources.some(source => source.loading)}><RefreshCw size={17} />Làm mới</button><Link className="button-primary" to="/booking"><Plus size={17} />Đặt kho mới</Link></div>} />
    <InternalKpis items={[
      { title: 'Kho đang thuê', value: count(rentals, rentals.data?.total ?? 0), to: '/customer/rentals' },
      { title: 'Hóa đơn cần trả', value: count(invoices, payable.length), hint: invoices.loading || invoices.error ? undefined : payable.length ? moneyLabel(payable.reduce((sum, item) => sum + item.balanceDue, 0)) : 'Không có khoản cần trả', to: '/customer/payments' },
      { title: 'Lịch bàn giao', value: count(appointments, upcoming.length), to: '/customer/appointments' },
      { title: 'Đơn chờ xử lý', value: count(reservations, pending.length), to: '/customer/reservations' },
    ]} />
    {sources.filter(source => source.error).map((source, index) => <PortalError key={index} message={source.error} onRetry={source.refresh} />)}
    <InternalPriority entries={activity.entries.filter(entry => entry.action)} to="/customer/notifications?view=action" loading={activity.loading} failed={activity.failed} onRead={activity.markRead} />
    <section className="customer-panel">
      <div className="customer-panel-heading"><h2>Đơn gần đây</h2><Link to="/customer/reservations">Xem tất cả <ArrowRight size={16} /></Link></div>
      {reservations.status === 401 ? <CustomerSessionExpired /> : reservations.loading ? <PortalLoading label="Đang tải đơn…" /> : reservations.error ? null : !recent.length ? <PortalEmpty title="Bạn chưa có đơn đặt kho" action={<Link className="button-primary" to="/booking">Tìm kho phù hợp</Link>}>Chọn kho và thời gian thuê để bắt đầu.</PortalEmpty> : <div className="customer-recent-list">{recent.map(item => <Link key={item.id} to={`/customer/reservations/${encodeURIComponent(item.id)}`} className="customer-recent-item"><div><strong>{item.product.name} · {item.quantity} kho</strong><span>{item.id} · {formatPortalDate(item.createdAt, true)}</span></div><div><ReservationStatus status={item.status} /><ArrowRight size={17} /></div></Link>)}</div>}
    </section>
    <div className="internal-shortcuts"><Link className="button-secondary" to="/customer/stock-movements"><Boxes size={18} />Nhập – xuất hàng</Link><Link className="button-secondary" to="/customer/support"><CircleHelp size={18} />Gửi hỗ trợ</Link></div>
    <details className="customer-process-guide"><summary>Tiến độ đơn thuê & hướng dẫn</summary><CustomerRentalProgress /><CustomerJourney /></details>
  </section>;
}
