import { CircleHelp, RefreshCw, Send, Wrench } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { ApiError, apiRequest } from '../../services/api'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerInvoice, CustomerRental, CustomerSupportRequest, Paginated, SupportCategory } from '../../types/customer'

const categories: Array<{ value: SupportCategory; label: string }> = [
  { value: 'UNIT_ISSUE', label: 'Vấn đề với kho' },
  { value: 'LOCK_OR_KEY_ISSUE', label: 'Khóa hoặc chìa khóa' },
  { value: 'ACCESS_CODE_ISSUE', label: 'Quyền truy cập' },
  { value: 'FACILITY_EQUIPMENT_FAILURE', label: 'Thiết bị tại cơ sở' },
  { value: 'PAYMENT_SUPPORT', label: 'Thanh toán hoặc hóa đơn' },
  { value: 'STORED_ITEM_CONCERN', label: 'Hàng hóa đang lưu trữ' },
  { value: 'OTHER', label: 'Vấn đề khác' },
]

export function CustomerSupportPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const requests = useApiResource<Paginated<CustomerSupportRequest>>('/customer/support-requests?limit=100', user?.id ?? '', true)
  const reservations = useApiResource<Array<{ id: string }>>('/reservations', user?.id ?? '')
  const rentals = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100', user?.id ?? '')
  const invoices = useApiResource<Paginated<CustomerInvoice>>('/customer/invoices?limit=100', user?.id ?? '')
  const presetCategory = params.get('category') as SupportCategory | null
  const [reservationId, setReservationId] = useState('')
  const [category, setCategory] = useState<SupportCategory>(categories.some(item => item.value === presetCategory) ? presetCategory! : 'UNIT_ISSUE')
  const [contractId, setContractId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [subject, setSubject] = useState(params.get('subject') ?? '')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const reservationOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const reservation of reservations.data ?? []) map.set(reservation.id, reservation.id)
    for (const rental of rentals.data?.items ?? []) map.set(rental.reservationId, rental.reservationReference)
    for (const invoice of invoices.data?.items ?? []) map.set(invoice.reservation.id, invoice.reservation.reference)
    return [...map].map(([id, reference]) => ({ id, reference }))
  }, [reservations.data, rentals.data, invoices.data])
  const selectedRental = rentals.data?.items.find(item => item.reservationId === reservationId)
  const selectedInvoices = (invoices.data?.items ?? []).filter(item => item.reservation.id === reservationId)
  const operational = !['PAYMENT_SUPPORT', 'OTHER'].includes(category)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(null); setSubmitting(true)
    try {
      await apiRequest<CustomerSupportRequest>('/customer/support-requests', { method: 'POST', headers: { 'Idempotency-Key': `support-${crypto.randomUUID()}` }, body: JSON.stringify({ reservationId, category, subject, description, rentalContractId: operational && contractId ? contractId : undefined, storageUnitId: operational && unitId ? unitId : undefined, invoiceId: category === 'PAYMENT_SUPPORT' && invoiceId ? invoiceId : undefined }) })
      setMessage({ kind: 'ok', text: 'Đã gửi yêu cầu hỗ trợ đến WDP.' }); setSubject(''); setDescription(''); setContractId(''); setUnitId(''); setInvoiceId(''); requests.refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError || error instanceof Error ? error.message : 'Không thể gửi yêu cầu hỗ trợ.' })
    } finally { setSubmitting(false) }
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Hỗ trợ" title="Yêu cầu hỗ trợ" description="Gửi vấn đề gắn với reservation, kho hoặc hóa đơn và theo dõi tiến độ xử lý." action={<button className="button-secondary" type="button" onClick={requests.refresh} disabled={requests.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-form-layout">
      <form className="customer-panel customer-module-form" onSubmit={submit}><h2>Gửi yêu cầu mới</h2><label className="field-label">Reservation<select required value={reservationId} onChange={event => { setReservationId(event.target.value); setContractId(''); setUnitId(''); setInvoiceId('') }}><option value="">Chọn reservation</option>{reservationOptions.map(item => <option key={item.id} value={item.id}>{item.reference}</option>)}</select></label><label className="field-label">Loại hỗ trợ<select value={category} onChange={event => setCategory(event.target.value as SupportCategory)}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {operational && selectedRental && <><label className="field-label">Hợp đồng liên quan<select value={contractId} onChange={event => setContractId(event.target.value)}><option value="">Toàn bộ rental</option>{selectedRental.contracts.map(item => <option key={item.id} value={item.id}>{item.contractCode}</option>)}</select></label><label className="field-label">Kho liên quan<select value={unitId} onChange={event => setUnitId(event.target.value)}><option value="">Chọn kho nếu có</option>{selectedRental.contracts.map(item => <option key={item.unit.id} value={item.unit.id}>{item.unit.unitCode}</option>)}</select></label></>}
        {category === 'PAYMENT_SUPPORT' && <label className="field-label">Hóa đơn liên quan<select value={invoiceId} onChange={event => setInvoiceId(event.target.value)}><option value="">Chọn hóa đơn nếu có</option>{selectedInvoices.map(item => <option key={item.id} value={item.id}>{item.invoiceCode}</option>)}</select></label>}
        <label className="field-label">Tiêu đề<input required minLength={3} maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Mô tả ngắn vấn đề" /></label><label className="field-label">Chi tiết<textarea required minLength={3} maxLength={4000} rows={5} value={description} onChange={event => setDescription(event.target.value)} placeholder="Không nhập mã khóa hoặc thông tin truy cập bí mật" /></label>{message && <p className={`customer-form-message is-${message.kind}`} role="status">{message.text}</p>}<button className="button-primary" type="submit" disabled={submitting || !reservationId}><Send size={17} /> {submitting ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>{reservationOptions.length === 0 && !reservations.loading && !rentals.loading && !invoices.loading && <small>Chưa có reservation hoặc hóa đơn để tạo yêu cầu.</small>}</form>
      <section className="customer-panel"><div className="customer-panel-heading"><div><h2>Yêu cầu của tôi</h2><p>Trạng thái được cập nhật bởi đội vận hành.</p></div><CircleHelp size={20} /></div>{requests.status === 401 ? <CustomerSessionExpired /> : requests.loading ? <PortalLoading label="Đang tải yêu cầu hỗ trợ…" /> : requests.error ? <PortalError message={requests.error} onRetry={requests.refresh} /> : (requests.data?.items.length ?? 0) === 0 ? <PortalEmpty icon={<Wrench size={30} />} title="Chưa có yêu cầu hỗ trợ"><span>Yêu cầu mới của bạn sẽ xuất hiện tại đây.</span></PortalEmpty> : <div className="customer-card-list">{requests.data!.items.map(item => <article className="customer-record-card customer-record-card--compact" key={item.id}><div className="customer-record-heading"><div><small>{item.supportCode} · {formatPortalDate(item.createdAt, true)}</small><h2>{item.subject}</h2></div><CustomerStatus status={item.status} label={item.status === 'OPEN' ? 'Đang mở' : undefined} /></div><p>{categories.find(categoryItem => categoryItem.value === item.category)?.label ?? item.category} · {item.reservation.reference}{item.unit ? ` · ${item.unit.unitCode}` : ''}</p><p>{item.description}</p>{item.resolutionNote && <p className="customer-inline-notice"><strong>Kết quả:</strong> {item.resolutionNote}</p>}</article>)}</div>}</section>
    </div>
  </section>
}
