import { ArrowRight, CalendarDays, CircleHelp, ClipboardList, PackageOpen, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader, ReservationStatus } from '../../components/customer/CustomerPortalUi'
import { formatPortalDate } from '../../components/customer/CustomerPortalHelpers'
import { useApiResource } from '../../services/useApiResource'
import type { PendingReservation } from '../../types/booking'

export function CustomerDashboardPage() {
  const { user } = useAuth()
  const { data, error, status, loading, refresh } = useApiResource<PendingReservation[]>('/reservations', user?.id ?? '', true)
  const reservations = data ?? []
  const pending = reservations.filter((item) => item.status === 'PENDING')

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Khu vực khách hàng" title={`Chào ${user?.fullName ?? 'bạn'}`} description="Theo dõi yêu cầu đặt kho và các bước tiếp theo trong một nơi." action={<Link className="button-primary" to="/booking"><Plus size={17} /> Đặt kho mới</Link>} />
    {status === 401 ? <CustomerSessionExpired /> : loading ? <PortalLoading label="Đang tải tổng quan của bạn…" /> : error ? <PortalError message={error} onRetry={refresh} /> : <>
      <div className="customer-overview-grid">
        <article className="customer-overview-card"><ClipboardList size={20} /><span>Yêu cầu đang xử lý</span><strong>{pending.length}</strong><p>Dựa trên các reservation đang lưu trong hệ thống.</p></article>
        <article className="customer-overview-card"><PackageOpen size={20} /><span>Kho đang thuê</span><strong>—</strong><p>Chưa có API để hiển thị hợp đồng hoặc kho đang sử dụng.</p></article>
        <article className="customer-overview-card"><CalendarDays size={20} /><span>Lịch hẹn sắp tới</span><strong>—</strong><p>Chưa có API lịch hẹn để hiển thị dữ liệu này.</p></article>
      </div>
      <div className="customer-dashboard-grid">
        <section className="customer-panel">
          <div className="customer-panel-heading"><div><h2>Yêu cầu gần đây</h2><p>Thông tin lấy trực tiếp từ Reservation API.</p></div><Link to="/customer/reservations">Xem tất cả <ArrowRight size={15} /></Link></div>
          {reservations.length === 0 ? <PortalEmpty title="Chưa có yêu cầu đặt kho"><span>Reservation của bạn sẽ xuất hiện ở đây sau khi hoàn tất đặt kho.</span><Link className="button-primary" to="/booking">Bắt đầu đặt kho</Link></PortalEmpty> : <div className="customer-recent-list">{reservations.slice(0, 3).map((item) => <Link key={item.id} to={`/customer/reservations/${item.id}`} className="customer-recent-item"><div><strong>{item.id}</strong><span>{item.product.name} · {item.quantity} kho</span></div><div><ReservationStatus status={item.status} /><small>{formatPortalDate(item.createdAt)}</small></div></Link>)}</div>}
        </section>
        <section className="customer-panel customer-quick-actions"><div className="customer-panel-heading"><div><h2>Thao tác nhanh</h2><p>Đi tới các việc bạn có thể thực hiện ngay.</p></div></div><Link to="/booking"><Plus size={18} /><span><strong>Đặt kho mới</strong><small>Chọn kho và gửi reservation.</small></span><ArrowRight size={17} /></Link><Link to="/customer/reservations"><ClipboardList size={18} /><span><strong>Yêu cầu của tôi</strong><small>Xem trạng thái reservation đã gửi.</small></span><ArrowRight size={17} /></Link><Link to="/customer/support"><CircleHelp size={18} /><span><strong>Liên hệ hỗ trợ</strong><small>Xem kênh hỗ trợ khi có API.</small></span><ArrowRight size={17} /></Link></section>
      </div>
    </>}
  </section>
}
