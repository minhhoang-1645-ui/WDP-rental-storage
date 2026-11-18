import { safeSessionStorage } from '../../services/browser-storage'
import { CheckCircle2, Clock3, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { bookingApi } from '../../services/booking'
import { quotePeriod } from '../../utils/quote-payment-summary'
import type { GuestInquiry, PendingReservation } from '../../types/booking'
import type { GuestBooking } from '../../services/guest-booking'

type BookingRecord = GuestInquiry | PendingReservation

export function BookingConfirmationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  return id?.startsWith('WDPG-') ? <GuestConfirmation key={id} id={id} /> : <ConfirmationRecord key={`${id}:${user?.id ?? ''}`} />
}

function GuestConfirmation({ id }: { id: string }) {
  const location = useLocation()
  const [record] = useState<GuestBooking | null>(() => {
    const initial = (location.state as { guestBooking?: GuestBooking } | null)?.guestBooking
    if (initial?.bookingCode === id) return initial
    try { const saved = JSON.parse(safeSessionStorage.getItem('wdp-guest-response:' + id) ?? 'null') as GuestBooking | null; return saved?.bookingCode === id ? saved : null } catch { return null }
  })
  const emailUnavailable = record?.status === 'PENDING_VERIFICATION' && record.message?.includes('Development');
  const closed = record?.status === 'EXPIRED' || record?.status === 'CANCELLED';
  const title = emailUnavailable ? 'Chưa gửi được email xác minh'
    : record?.status === 'CLAIMED' ? 'Yêu cầu đã được nhận'
    : record?.status === 'VERIFIED' ? 'Email đã được xác minh'
    : closed ? (record?.status === 'EXPIRED' ? 'Yêu cầu đã hết hạn' : 'Yêu cầu đã hủy')
    : 'Kiểm tra email để tiếp tục';
  return <section className="public-page-content"><Container className="max-w-3xl">
    <div className="confirmation-panel">
      <h1>{title}</h1>
      {record && <p><strong>{record.quantity} kho · {record.storage.name}</strong> · {quotePeriod(record.startDate, record.endDate)}</p>}
      <p>Mã yêu cầu <strong>{id}</strong></p>
      {emailUnavailable
        ? <p className="booking-alert" role="status">Hãy dùng lựa chọn gửi yêu cầu liên hệ để NestBox hỗ trợ.</p>
        : (!record || record.status === 'PENDING_VERIFICATION') && <p>Mở liên kết xác minh trong email của NestBox. {record && 'Yêu cầu chưa giữ kho.'}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {emailUnavailable
          ? <Link className="button-primary" to="/booking?mode=quick&step=3&contact=1">Gửi yêu cầu liên hệ</Link>
          : <Link className="button-secondary" to="/storage">Xem kho</Link>}
      </div>
    </div>
  </Container></section>
}

function ConfirmationRecord() {
  const { id } = useParams()
  const location = useLocation()
  const { user, loading } = useAuth()
  const initialRecord = (location.state as { record?: BookingRecord } | null)?.record ?? null
  const [record, setRecord] = useState<BookingRecord | null>(initialRecord)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(!initialRecord)
  const pending = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!id || loading) return
    const controller = new AbortController()
    pending.current?.abort()
    pending.current = controller
    setFetching(true)
    setError('')
    try {
      if (id.startsWith('WDPQ-')) {
        const token = safeSessionStorage.getItem('wdp-inquiry-token:' + id)
        if (!token) {
          if (!initialRecord) setError('Liên kết xác nhận này không có mã truy cập bảo mật. Hãy mở lại ngay sau khi gửi yêu cầu.')
          return
        }
        const result = await bookingApi.getInquiry(id, token, controller.signal)
        if (!controller.signal.aborted) setRecord(result)
      } else {
        if (!user) {
          setError('Bạn cần đăng nhập bằng tài khoản đã tạo yêu cầu đặt kho này.')
          return
        }
        const result = await bookingApi.getReservation(id, controller.signal)
        if (!controller.signal.aborted) setRecord(result)
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải yêu cầu.')
    } finally {
      if (!controller.signal.aborted) setFetching(false)
    }
  }, [id, initialRecord, loading, user])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => { window.clearTimeout(timer); pending.current?.abort() }
  }, [load])

  return <section className="public-page-content"><Container className="max-w-3xl">
    {record && record.id === id ? <div className="confirmation-panel">
      <CheckCircle2 className="text-success" size={48} />

      <h1>{record.status === 'PENDING_CONTACT' ? 'NestBox sẽ liên hệ để xác nhận.' : record.status === 'CONFIRMED' ? 'Yêu cầu đặt kho đã được xác nhận.' : record.status === 'REJECTED' ? 'Yêu cầu đặt kho đã bị từ chối.' : record.status === 'CANCELLED' ? 'Yêu cầu đặt kho đã hủy.' : record.status === 'EXPIRED' ? 'Yêu cầu đặt kho đã hết hạn.' : 'Yêu cầu đặt kho đang chờ xác nhận.'}</h1>
      <p>Mã tham chiếu <strong>{record.id}</strong> đã được lưu. {record.status === 'CONFIRMED' ? 'Xem yêu cầu trong tài khoản để theo dõi kho, hợp đồng và hóa đơn thực tế.' : 'Yêu cầu chưa phải là thanh toán hoặc hợp đồng thuê đang hoạt động.'}</p>
      {'expiresAt' in record && record.status === 'CONFIRMED' && record.expiresAt && <div className="booking-alert mt-7"><span><strong>Kho đang được giữ trong 24 giờ để chờ thanh toán.</strong> Hạn giữ: {new Date(record.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })}. Thanh toán hóa đơn ban đầu trước thời điểm này để tiếp tục nhận kho.</span></div>}
      <div className="confirmation-product"><StorageImage className="booking-product-thumb" src={record.product.image} alt="" /><div><strong>{record.product.name}</strong><span>{record.product.code} · {record.product.dimensions}</span><span>{record.quantity} kho · {record.periodMode === 'duration' ? record.durationMonths + ' tháng' : 'Từ ' + record.startDate + ' đến ' + record.endDate}</span></div></div>
      <div className="confirmation-facts"><div><Clock3 /><span><strong>Bước tiếp theo</strong>{record.status === 'CONFIRMED' ? 'Theo dõi hợp đồng, thanh toán và lịch bàn giao trong tài khoản.' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(record.status) ? 'Chọn kho và gửi yêu cầu mới nếu bạn vẫn có nhu cầu.' : 'Nhân viên kiểm tra tình trạng, thông tin vận hành và liên hệ.'}</span></div><div><ReceiptText /><span><strong>Báo giá</strong>{record.status === 'CONFIRMED' ? 'Kiểm tra số tiền và trạng thái thanh toán trên hóa đơn trong tài khoản.' : 'Yêu cầu này chưa xác nhận việc thanh toán.'}</span></div></div>
      <div className="booking-alert mt-7"><span><strong>{record.status === 'CONFIRMED' ? 'Đã xác nhận đặt kho' : 'Chưa xác nhận giữ kho'}</strong>{record.status === 'PENDING_CONTACT' ? ' Yêu cầu liên hệ chỉ ghi nhận nhu cầu, không khóa kho.' : record.status === 'CONFIRMED' ? ' Xem phân bổ kho và hợp đồng thực tế trong tài khoản.' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(record.status) ? ' Yêu cầu này đã kết thúc và không giữ kho.' : ' Yêu cầu đặt kho đang chờ xử lý theo quy trình vận hành.'}</span></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to={record.status === 'PENDING_CONTACT' ? '/storage' : '/customer/reservations/' + record.id}>{record.status === 'PENDING_CONTACT' ? 'Xem thêm kho' : 'Xem yêu cầu đặt kho của tôi'}</Link><Link className="button-secondary" to="/">Về trang chủ</Link></div>
    </div> : <div className="confirmation-panel"><h1>{error ? 'Chưa tải được yêu cầu' : 'Đang tải yêu cầu'}</h1><p>{error || (fetching ? 'Vui lòng đợi trong giây lát.' : 'Không tìm thấy dữ liệu yêu cầu.')}</p>{error && <div className="mt-6 flex gap-3"><button className="button-secondary" onClick={() => void load()}>Thử lại</button>{!user && !id?.startsWith('WDPQ-') && <Link className="button-primary" to={'/account/login?returnTo=' + encodeURIComponent('/booking/confirmation/' + id)}>Đăng nhập</Link>}</div>}</div>}
  </Container></section>
}
