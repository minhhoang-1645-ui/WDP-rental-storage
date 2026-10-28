import { CheckCircle2, Clock3, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { bookingApi } from '../../services/booking'
import type { GuestInquiry, PendingReservation } from '../../types/booking'
import type { GuestBooking } from '../../services/guest-booking'

type BookingRecord = GuestInquiry | PendingReservation

export function BookingConfirmationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  return id?.startsWith('WDPG-') ? <GuestConfirmation key={id} id={id} /> : <ConfirmationRecord key={`${id}:${user?.id ?? ''}`} />
}

function GuestConfirmation({ id }: { id: string }) {
  const [record] = useState<GuestBooking | null>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem('wdp-guest-response:' + id) ?? 'null') as GuestBooking | null; return saved?.bookingCode === id ? saved : null } catch { return null }
  })
  return <section className="section-space"><Container className="max-w-3xl"><div className="confirmation-panel"><CheckCircle2 className="text-success" size={48} /><p className="eyebrow mt-6">Yêu cầu đặt kho qua email</p><h1>{record ? 'Đã ghi nhận yêu cầu xác minh email' : 'Tra cứu qua email của WDP'}</h1><p>Mã yêu cầu: <strong>{id}</strong>. Yêu cầu này chưa giữ kho, chưa tạo hợp đồng hoặc thanh toán.</p>{record && <p>{record.storage.name} · {record.quantity} kho · {record.startDate} đến {record.endDate}</p>}<div className="booking-alert mt-7">{record?.message?.includes('Development') ? 'Dịch vụ gửi email thật chưa được cấu hình. Email xác minh chưa được gửi; hãy liên hệ WDP hoặc dùng luồng gửi yêu cầu liên hệ.' : 'Mở liên kết xác minh WDP gửi trong email, sau đó đăng nhập bằng cùng email để nhận yêu cầu. Trang này hiển thị kết quả gửi ban đầu.'}</div><div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to="/storage">Xem kho</Link><Link className="button-secondary" to="/booking">Gửi yêu cầu liên hệ</Link></div></div></Container></section>
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
        const token = sessionStorage.getItem('wdp-inquiry-token:' + id)
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

  return <section className="section-space"><Container className="max-w-3xl">
    {record && record.id === id ? <div className="confirmation-panel">
      <CheckCircle2 className="text-success" size={48} />
      <p className="eyebrow mt-6">{record.status === 'PENDING_CONTACT' ? 'Đã gửi yêu cầu liên hệ' : 'Yêu cầu của bạn đã được gửi'}</p>
      <h1>{record.status === 'PENDING_CONTACT' ? 'WDP sẽ liên hệ để xác nhận.' : record.status === 'CONFIRMED' ? 'Yêu cầu đặt kho đã được xác nhận.' : record.status === 'REJECTED' ? 'Yêu cầu đặt kho đã bị từ chối.' : record.status === 'CANCELLED' ? 'Yêu cầu đặt kho đã hủy.' : record.status === 'EXPIRED' ? 'Yêu cầu đặt kho đã hết hạn.' : 'Yêu cầu đặt kho đang chờ xác nhận.'}</h1>
      <p>Mã tham chiếu <strong>{record.id}</strong> đã được lưu. {record.status === 'CONFIRMED' ? 'Xem yêu cầu trong tài khoản để theo dõi kho, hợp đồng và hóa đơn thực tế.' : 'Yêu cầu chưa phải là thanh toán hoặc hợp đồng thuê đang hoạt động.'}</p>
      {'expiresAt' in record && record.status === 'CONFIRMED' && record.expiresAt && <div className="booking-alert mt-7"><span><strong>Kho đang được giữ trong 24 giờ để chờ thanh toán.</strong> Hạn giữ: {new Date(record.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })}. Thanh toán hóa đơn ban đầu trước thời điểm này để tiếp tục nhận kho.</span></div>}
      <div className="confirmation-product"><StorageIllustration sizeId={record.product.sizeId} /><div><strong>{record.product.name}</strong><span>{record.product.code} · {record.product.dimensions}</span><span>{record.quantity} kho · {record.periodMode === 'duration' ? record.durationMonths + ' tháng' : 'Từ ' + record.startDate + ' đến ' + record.endDate}</span></div></div>
      <div className="confirmation-facts"><div><Clock3 /><span><strong>Bước tiếp theo</strong>{record.status === 'CONFIRMED' ? 'Theo dõi hợp đồng, thanh toán và lịch bàn giao trong tài khoản.' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(record.status) ? 'Chọn kho và gửi yêu cầu mới nếu bạn vẫn có nhu cầu.' : 'Nhân viên kiểm tra tình trạng, thông tin vận hành và liên hệ.'}</span></div><div><ReceiptText /><span><strong>Báo giá</strong>{record.status === 'CONFIRMED' ? 'Kiểm tra số tiền và trạng thái thanh toán trên hóa đơn trong tài khoản.' : 'Yêu cầu này chưa xác nhận việc thanh toán.'}</span></div></div>
      <div className="booking-alert mt-7"><span><strong>{record.status === 'CONFIRMED' ? 'Đã xác nhận đặt kho' : 'Chưa xác nhận giữ kho'}</strong>{record.status === 'PENDING_CONTACT' ? ' Yêu cầu liên hệ chỉ ghi nhận nhu cầu, không khóa kho.' : record.status === 'CONFIRMED' ? ' Xem phân bổ kho và hợp đồng thực tế trong tài khoản.' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(record.status) ? ' Yêu cầu này đã kết thúc và không giữ kho.' : ' Yêu cầu đặt kho đang chờ xử lý theo quy trình vận hành.'} Dữ liệu đã được lưu trong hệ thống.</span></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to={record.status === 'PENDING_CONTACT' ? '/storage' : '/customer/reservations/' + record.id}>{record.status === 'PENDING_CONTACT' ? 'Xem thêm kho' : 'Xem yêu cầu đặt kho của tôi'}</Link><Link className="button-secondary" to="/">Về trang chủ</Link></div>
    </div> : <div className="confirmation-panel"><h1>{error ? 'Chưa tải được yêu cầu' : 'Đang tải yêu cầu'}</h1><p>{error || (fetching ? 'Vui lòng đợi trong giây lát.' : 'Không tìm thấy dữ liệu yêu cầu.')}</p>{error && <div className="mt-6 flex gap-3"><button className="button-secondary" onClick={() => void load()}>Thử lại</button>{!user && !id?.startsWith('WDPQ-') && <Link className="button-primary" to={'/account/login?returnTo=' + encodeURIComponent('/booking/confirmation/' + id)}>Đăng nhập</Link>}</div>}</div>}
  </Container></section>
}
