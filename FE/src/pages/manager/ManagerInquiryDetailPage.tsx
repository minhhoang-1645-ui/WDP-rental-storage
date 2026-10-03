import { ArrowLeft, CalendarDays, Mail, Phone, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { managerApi } from '../../services/booking'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerInquiry, ManagerRequestStatus } from '../../types/booking'

const inquiryOptions: { value: ManagerRequestStatus; label: string }[] = [
  { value: 'PENDING_CONTACT', label: 'Chờ liên hệ' },
  { value: 'CONTACTED', label: 'Đã liên hệ' },
  { value: 'IN_REVIEW', label: 'Đang xử lý' },
  { value: 'CLOSED', label: 'Đã đóng' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]
const reservationOptions: { value: ManagerRequestStatus; label: string }[] = [
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'EXPIRED', label: 'Đã hết hạn' },
]

export function ManagerInquiryDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, error, loading, refresh } = useApiResource<ManagerInquiry>(id ? '/manager/inquiries/' + encodeURIComponent(id) : null, user?.id ?? '')
  const [updated, setUpdated] = useState<ManagerInquiry | null>(null)
  const inquiry = updated ?? data
  const [statusDraft, setStatusDraft] = useState<ManagerRequestStatus | null>(null)
  const [internalNotesDraft, setInternalNotesDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const status = statusDraft ?? inquiry?.status ?? 'PENDING_CONTACT'
  const internalNotes = internalNotesDraft ?? inquiry?.internalNotes ?? ''
  const options = inquiry?.requestType === 'RESERVATION' ? reservationOptions : inquiryOptions

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const result = await managerApi.updateInquiry(id, { status, internalNotes })
      setUpdated(result)
      setStatusDraft(result.status)
      setInternalNotesDraft(result.internalNotes ?? '')
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Không thể cập nhật yêu cầu.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p role="status">Đang tải chi tiết yêu cầu…</p>
  if (error || !inquiry) return <div className="booking-alert is-error" role="alert">{error || 'Không tìm thấy yêu cầu.'}<button onClick={refresh}>Thử lại</button></div>
  const available = inquiry.availability?.available
  return <section>
    <Link className="booking-back" to="/manager/inquiries"><ArrowLeft size={16} /> Danh sách yêu cầu</Link>
    <header className="manager-detail-header"><div><p className="eyebrow">{inquiry.reference} · {inquiry.requestType === 'INQUIRY' ? 'Inquiry' : 'Reservation'}</p><h1>{inquiry.customer.fullName}</h1><p>Tạo lúc {new Date(inquiry.createdAt).toLocaleString('vi-VN')}</p></div><span className={'manager-status is-' + inquiry.status.toLowerCase()}>{options.find((item) => item.value === inquiry.status)?.label}</span></header>
    <div className="manager-detail-grid">
      <div className="manager-detail-content">
        <section className="manager-section"><h2>Thông tin khách hàng</h2><div className="manager-contact"><a href={'tel:' + inquiry.customer.phone}><Phone size={17} /> {inquiry.customer.phone}</a><a href={'mailto:' + inquiry.customer.email}><Mail size={17} /> {inquiry.customer.email}</a></div></section>
        <section className="manager-section"><h2>Nhu cầu lưu trữ</h2><dl className="manager-facts"><div><dt>Sản phẩm</dt><dd>{inquiry.product.name} · {inquiry.product.code}</dd></div><div><dt>Kích thước</dt><dd>{inquiry.product.dimensions}</dd></div><div><dt>Số lượng</dt><dd>{inquiry.quantity} kho</dd></div><div><dt>Liền kề</dt><dd>{inquiry.adjacencyPreference ? 'Có ưu tiên' : 'Không yêu cầu'}</dd></div><div><dt>Thời gian</dt><dd><CalendarDays size={16} /> {inquiry.startDate} đến {inquiry.endDateExclusive}</dd></div><div><dt>Khả dụng lúc gửi</dt><dd className={available ? 'text-success' : 'text-danger'}>{available ? 'Còn kho phù hợp' : 'Không còn kho phù hợp'}</dd></div></dl></section>
        <section className="manager-section"><h2>Báo giá tại thời điểm gửi</h2><div className="manager-quote">{inquiry.quote.lineItems.map((line) => <div key={line.code}><span><strong>{line.label}</strong><small>{line.basis}</small></span><strong>{line.amount === null ? 'Cần xác nhận báo giá' : new Intl.NumberFormat('vi-VN').format(line.amount) + ' đ'}</strong></div>)}</div></section>
        <section className="manager-section"><h2>Ghi chú khách hàng</h2><p>{inquiry.customerNotes || 'Không có ghi chú.'}</p></section>
      </div>
      <form className="manager-processing" onSubmit={submit}><h2>Xử lý yêu cầu</h2>{saveError && <div className="booking-alert is-error">{saveError}</div>}<label className="field-label">Trạng thái<select value={status} onChange={(event) => setStatusDraft(event.target.value as ManagerRequestStatus)}>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="field-label">Ghi chú nội bộ<textarea rows={7} maxLength={2000} value={internalNotes} onChange={(event) => setInternalNotesDraft(event.target.value)} placeholder="Nội dung trao đổi và bước xử lý tiếp theo" /></label><button className="button-primary w-full justify-center" disabled={saving}><Save size={17} /> {saving ? 'Đang lưu…' : 'Lưu cập nhật'}</button><small>Không tạo hợp đồng, thanh toán hoặc phân kho vật lý ở bước này.</small></form>
    </div>
  </section>
}
