import { CheckCircle2, Clock3, ReceiptText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { useApiResource } from '../../services/useApiResource'
import type { GuestInquiry, PendingReservation } from '../../types/booking'

type BookingRecord = GuestInquiry | PendingReservation

export function BookingConfirmationPage() {
  const { id } = useParams()
  const { user, loading } = useAuth()
  const path = !loading && id ? (id.startsWith('WDPQ-') ? '/inquiries/' : '/reservations/') + encodeURIComponent(id) : null
  const { data: record, error, refresh } = useApiResource<BookingRecord>(path, user?.id ?? 'guest')
  return <section className="section-space"><Container className="max-w-3xl">
    {record && record.id === id ? <div className="confirmation-panel">
      <CheckCircle2 className="text-success" size={48} />
      <p className="eyebrow mt-6">{record.status === 'PENDING_CONTACT' ? 'Đã gửi yêu cầu liên hệ' : 'Đã tạo reservation'}</p>
      <h1>{record.status === 'PENDING_CONTACT' ? 'WDP sẽ liên hệ để xác nhận.' : 'Reservation đang ở trạng thái PENDING.'}</h1>
      <p>Mã tham chiếu <strong>{record.id}</strong> đã được tạo. Yêu cầu này chưa phải là thanh toán, hợp đồng, giữ chỗ đảm bảo hoặc phân kho vật lý.</p>
      <div className="confirmation-product"><StorageIllustration sizeId={record.product.sizeId} /><div><strong>{record.product.name}</strong><span>{record.product.code} · {record.product.dimensions}</span><span>{record.quantity} kho · {record.periodMode === 'duration' ? record.durationMonths + ' tháng' : 'Từ ' + record.startDate + ' đến ' + record.endDate}</span></div></div>
      <div className="confirmation-facts"><div><Clock3 /><span><strong>Bước tiếp theo</strong>Nhân viên kiểm tra tình trạng, thông tin vận hành và liên hệ.</span></div><div><ReceiptText /><span><strong>Báo giá</strong>Các khoản tiền hiện cần WDP xác nhận, chưa thanh toán.</span></div></div>
      <div className="booking-alert mt-7"><span><strong>Không đảm bảo tồn kho</strong>{record.status === 'PENDING_CONTACT' ? ' Inquiry khách chỉ ghi nhận nhu cầu, không khóa inventory.' : ' Reservation PENDING cần được xử lý theo quy trình vận hành.'} Dữ liệu prototype lưu trong bộ nhớ backend.</span></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to={record.status === 'PENDING_CONTACT' ? '/storage' : '/account/reservations'}>{record.status === 'PENDING_CONTACT' ? 'Xem thêm kho' : 'Xem reservation của tôi'}</Link><Link className="button-secondary" to="/">Về trang chủ</Link></div>
    </div> : <div className="confirmation-panel"><h1>{error ? 'Chưa tải được yêu cầu' : 'Đang tải yêu cầu'}</h1><p>{error || 'Vui lòng đợi trong giây lát.'}</p>{error && <div className="mt-6 flex gap-3"><button className="button-secondary" onClick={refresh}>Thử lại</button>{!user && <Link className="button-primary" to={'/account/login?returnTo=' + encodeURIComponent('/booking/confirmation/' + id)}>Đăng nhập</Link>}</div>}</div>}
  </Container></section>
}
