import { CheckCircle2, Clock3, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { bookingApi } from '../../services/booking'
import type { GuestInquiry, PendingReservation } from '../../types/booking'

type BookingRecord = GuestInquiry | PendingReservation

export function BookingConfirmationPage() {
  const { id } = useParams()
  const location = useLocation()
  const { user, loading } = useAuth()
  const initialRecord = (location.state as { record?: BookingRecord } | null)?.record ?? null
  const [record, setRecord] = useState<BookingRecord | null>(initialRecord)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(!initialRecord)

  const load = useCallback(async () => {
    if (!id || loading) return
    const controller = new AbortController()
    setFetching(true)
    setError('')
    try {
      if (id.startsWith('WDPQ-')) {
        const token = sessionStorage.getItem('wdp-inquiry-token:' + id)
        if (!token) {
          if (!initialRecord) setError('Liên kết xác nhận này không có mã truy cập bảo mật. Hãy mở lại ngay sau khi gửi yêu cầu.')
          return
        }
        setRecord(await bookingApi.getInquiry(id, token, controller.signal))
      } else {
        if (!user) {
          setError('Bạn cần đăng nhập bằng tài khoản đã tạo reservation này.')
          return
        }
        setRecord(await bookingApi.getReservation(id, controller.signal))
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải yêu cầu.')
    } finally {
      if (!controller.signal.aborted) setFetching(false)
    }
    return () => controller.abort()
  }, [id, initialRecord, loading, user])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return <section className="section-space"><Container className="max-w-3xl">
    {record && record.id === id ? <div className="confirmation-panel">
      <CheckCircle2 className="text-success" size={48} />
      <p className="eyebrow mt-6">{record.status === 'PENDING_CONTACT' ? 'Đã gửi yêu cầu liên hệ' : 'Đã tạo reservation'}</p>
      <h1>{record.status === 'PENDING_CONTACT' ? 'WDP sẽ liên hệ để xác nhận.' : 'Reservation đang ở trạng thái PENDING.'}</h1>
      <p>Mã tham chiếu <strong>{record.id}</strong> đã được lưu. Yêu cầu này chưa phải là thanh toán, hợp đồng, giữ chỗ đảm bảo hoặc phân kho vật lý.</p>
      <div className="confirmation-product"><StorageIllustration sizeId={record.product.sizeId} /><div><strong>{record.product.name}</strong><span>{record.product.code} · {record.product.dimensions}</span><span>{record.quantity} kho · {record.periodMode === 'duration' ? record.durationMonths + ' tháng' : 'Từ ' + record.startDate + ' đến ' + record.endDate}</span></div></div>
      <div className="confirmation-facts"><div><Clock3 /><span><strong>Bước tiếp theo</strong>Nhân viên kiểm tra tình trạng, thông tin vận hành và liên hệ.</span></div><div><ReceiptText /><span><strong>Báo giá</strong>Các khoản tiền hiện cần WDP xác nhận, chưa thanh toán.</span></div></div>
      <div className="booking-alert mt-7"><span><strong>Không đảm bảo tồn kho</strong>{record.status === 'PENDING_CONTACT' ? ' Inquiry chỉ ghi nhận nhu cầu, không khóa inventory.' : ' Reservation PENDING cần được xử lý theo quy trình vận hành.'} Dữ liệu đã được lưu trong hệ thống.</span></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to={record.status === 'PENDING_CONTACT' ? '/storage' : '/account/reservations'}>{record.status === 'PENDING_CONTACT' ? 'Xem thêm kho' : 'Xem reservation của tôi'}</Link><Link className="button-secondary" to="/">Về trang chủ</Link></div>
    </div> : <div className="confirmation-panel"><h1>{error ? 'Chưa tải được yêu cầu' : 'Đang tải yêu cầu'}</h1><p>{error || (fetching ? 'Vui lòng đợi trong giây lát.' : 'Không tìm thấy dữ liệu yêu cầu.')}</p>{error && <div className="mt-6 flex gap-3"><button className="button-secondary" onClick={() => void load()}>Thử lại</button>{!user && !id?.startsWith('WDPQ-') && <Link className="button-primary" to={'/account/login?returnTo=' + encodeURIComponent('/booking/confirmation/' + id)}>Đăng nhập</Link>}</div>}</div>}
  </Container></section>
}
