import { CalendarRange, RefreshCw, Repeat2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { ApiError, apiRequest } from '../../services/api'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerRenewal, CustomerRental, Paginated } from '../../types/customer'

export function CustomerRenewalsPage() {
  const { user } = useAuth()
  const rentals = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100', user?.id ?? '')
  const renewals = useApiResource<Paginated<CustomerRenewal>>('/customer/renewals?limit=100', user?.id ?? '', true)
  const [reservationId, setReservationId] = useState('')
  const [termMonths, setTermMonths] = useState('3')
  const [paymentPlan, setPaymentPlan] = useState<'PAY_MONTHLY' | 'PREPAID'>('PREPAID')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(null); setSubmitting(true)
    try {
      await apiRequest<CustomerRenewal>('/customer/renewals', { method: 'POST', headers: { 'Idempotency-Key': `renewal-${crypto.randomUUID()}` }, body: JSON.stringify({ reservationId, termMonths: Number(termMonths), paymentPlan }) })
      setMessage({ kind: 'ok', text: 'Đã gửi yêu cầu gia hạn.' }); setReservationId(''); renewals.refresh(); rentals.refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError || error instanceof Error ? error.message : 'Không thể gửi yêu cầu gia hạn.' })
    } finally { setSubmitting(false) }
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Gia hạn" title="Yêu cầu gia hạn" description="Gửi yêu cầu cho kho đang thuê và theo dõi kết quả xử lý." action={<button className="button-secondary" type="button" onClick={renewals.refresh} disabled={renewals.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-form-layout">
      <form className="customer-panel customer-module-form" onSubmit={submit}><h2>Tạo yêu cầu mới</h2><label className="field-label">Kho đang thuê<select required value={reservationId} onChange={event => setReservationId(event.target.value)}><option value="">Chọn kho</option>{(rentals.data?.items ?? []).map(item => <option key={item.reservationId} value={item.reservationId}>{item.reservationReference} · {item.storageType.name} · đến {formatPortalDate(item.effectiveEndDate)}</option>)}</select></label><label className="field-label">Thời hạn gia hạn<select value={termMonths} onChange={event => setTermMonths(event.target.value)}><option value="1">1 tháng</option><option value="3">3 tháng</option><option value="6">6 tháng</option><option value="12">12 tháng</option></select></label><label className="field-label">Kế hoạch thanh toán<select value={paymentPlan} onChange={event => setPaymentPlan(event.target.value as 'PAY_MONTHLY' | 'PREPAID')}><option value="PREPAID">Thanh toán trước</option><option value="PAY_MONTHLY">Thanh toán hàng tháng</option></select></label>{message && <p className={`customer-form-message is-${message.kind}`} role="status">{message.text}</p>}<button className="button-primary" type="submit" disabled={submitting || !reservationId}><Repeat2 size={17} /> {submitting ? 'Đang gửi…' : 'Gửi yêu cầu gia hạn'}</button>{!rentals.loading && (rentals.data?.items.length ?? 0) === 0 && <small>Chưa có kho đang thuê đủ điều kiện gia hạn.</small>}</form>
      <section className="customer-panel"><div className="customer-panel-heading"><div><h2>Lịch sử gia hạn</h2><p>Giá và trạng thái lấy trực tiếp từ backend.</p></div><CalendarRange size={20} /></div>{renewals.status === 401 ? <CustomerSessionExpired /> : renewals.loading ? <PortalLoading label="Đang tải yêu cầu gia hạn…" /> : renewals.error ? <PortalError message={renewals.error} onRetry={renewals.refresh} /> : (renewals.data?.items.length ?? 0) === 0 ? <PortalEmpty icon={<Repeat2 size={30} />} title="Chưa có yêu cầu gia hạn"><span>Các yêu cầu bạn gửi sẽ xuất hiện ở đây.</span></PortalEmpty> : <div className="customer-card-list">{renewals.data!.items.map(item => <article className="customer-record-card customer-record-card--compact" key={item.id}><div className="customer-record-heading"><div><small>{item.renewalCode}</small><h2>{item.reservation.storageType.name}</h2></div><CustomerStatus status={item.status} /></div><dl className="customer-record-facts"><div><dt>Thời hạn</dt><dd>{formatPortalDate(item.previousEndDate)} – {formatPortalDate(item.requestedEndDate)}</dd></div><div><dt>Báo giá</dt><dd>{moneyLabel(item.quoteSnapshot.totalAmount, item.quoteSnapshot.currency)}</dd></div></dl>{item.rejectionReason && <p className="customer-form-message is-error">{item.rejectionReason}</p>}</article>)}</div>}</section>
    </div>
  </section>
}
