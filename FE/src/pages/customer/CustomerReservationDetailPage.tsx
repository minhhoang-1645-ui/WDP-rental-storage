import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, PackageOpen, ReceiptText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { PortalError, PortalLoading, PortalPageHeader, ReservationStatus } from '../../components/customer/CustomerPortalUi'
import { formatPortalDate, quoteLabel } from '../../components/customer/CustomerPortalHelpers'
import { useApiResource } from '../../services/useApiResource'
import type { PendingReservation } from '../../types/booking'

export function CustomerReservationDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data: reservation, error, status, loading, refresh } = useApiResource<PendingReservation>(id ? '/reservations/' + encodeURIComponent(id) : null, user?.id ?? '')
  if (status === 401) return <CustomerSessionExpired />
  if (loading) return <section className="customer-page"><PortalLoading label="Đang tải chi tiết reservation…" /></section>
  if (error || !reservation) return <section className="customer-page"><Link to="/customer/reservations" className="customer-back"><ArrowLeft size={16} /> Quay lại danh sách</Link><PortalError message={error || 'Không tìm thấy reservation này.'} onRetry={refresh} /></section>

  return <section className="customer-page">
    <Link to="/customer/reservations" className="customer-back"><ArrowLeft size={16} /> Quay lại danh sách</Link>
    <PortalPageHeader eyebrow="Chi tiết reservation" title={reservation.id} description={`Tạo lúc ${formatPortalDate(reservation.createdAt, true)}. Reservation chưa phải là hợp đồng, thanh toán hoặc phân kho vật lý.`} action={<ReservationStatus status={reservation.status} />} />
    <div className="customer-detail-grid">
      <div className="customer-detail-content">
        <section className="customer-panel"><h2>Thông tin kho</h2><div className="customer-facts"><div><dt>Loại kho</dt><dd>{reservation.product.name}</dd></div><div><dt>Mã sản phẩm</dt><dd>{reservation.product.code}</dd></div><div><dt>Kích thước</dt><dd>{reservation.product.dimensions}</dd></div><div><dt>Số lượng</dt><dd>{reservation.quantity} kho</dd></div><div><dt>Ưu tiên vị trí</dt><dd>{reservation.adjacencyPreference ? 'Ưu tiên các kho liền kề' : 'Không yêu cầu kho liền kề'}</dd></div></div></section>
        <section className="customer-panel"><h2>Thời gian thuê yêu cầu</h2><div className="customer-facts"><div><dt>Ngày bắt đầu</dt><dd><CalendarDays size={16} /> {formatPortalDate(reservation.startDate)}</dd></div><div><dt>Ngày kết thúc</dt><dd><CalendarDays size={16} /> {formatPortalDate(reservation.endDateExclusive)}</dd></div><div><dt>Hình thức thời hạn</dt><dd>{reservation.periodMode === 'duration' ? `${reservation.durationMonths} tháng` : 'Theo ngày kết thúc'}</dd></div></div></section>
        <section className="customer-panel"><h2>Báo giá tại thời điểm gửi</h2><div className="customer-quote-list">{reservation.quote.lineItems.map((line) => <div key={line.code}><span><strong>{line.label}</strong><small>{line.basis}</small></span><b>{line.status === 'INCLUDED' ? 'Đã bao gồm' : quoteLabel(line.amount)}</b></div>)}</div><p className="customer-note">{reservation.quote.message}</p></section>
        <section className="customer-panel"><h2>Thông tin tài khoản</h2><div className="customer-facts"><div><dt>Họ và tên</dt><dd>{reservation.customer.fullName}</dd></div><div><dt>Email</dt><dd>{reservation.customer.email}</dd></div><div><dt>Số điện thoại</dt><dd>{reservation.customer.phone || 'Chưa cập nhật'}</dd></div></div></section>
      </div>
      <aside className="customer-detail-aside"><section className="customer-panel"><h2>Trạng thái hiện tại</h2><div className="customer-timeline"><div><span><Clock3 size={17} /></span><p><strong><ReservationStatus status={reservation.status} /></strong><small>Trạng thái hiện tại lấy từ hệ thống.</small></p></div><div><span><CheckCircle2 size={17} /></span><p><strong>Đã ghi nhận</strong><small>{formatPortalDate(reservation.createdAt, true)}</small></p></div></div></section><section className="customer-panel customer-disabled-actions"><h2>Bước tiếp theo</h2><button disabled><ReceiptText size={16} /> Chấp nhận báo giá</button><button disabled><CalendarDays size={16} /> Đặt lịch hẹn</button><button disabled><PackageOpen size={16} /> Thanh toán</button><p>Các thao tác này sẽ được mở khi backend có API phù hợp. Hiện chưa có hành động nào được gửi đi.</p></section></aside>
    </div>
  </section>
}
