import { Check, RefreshCw, Search, Wallet, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/auth-context'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { managerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { PaymentSubmission, PaymentSubmissionStatus } from '../../types/payment'

const statusLabel: Record<PaymentSubmissionStatus, string> = { PENDING_VERIFICATION: 'Chờ xác nhận', VERIFIED: 'Đã xác nhận', REJECTED: 'Đã từ chối' }

export function ManagerPaymentSubmissionsPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<PaymentSubmissionStatus | 'ALL'>('PENDING_VERIFICATION')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<PaymentSubmission | null>(null)
  const [action, setAction] = useState<'verify' | 'reject' | null>(null)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const params = new URLSearchParams({ limit: '100' })
  if (status !== 'ALL') params.set('status', status)
  if (search) params.set('search', search)
  const submissions = usePaginatedResource<PaymentSubmission>(`/manager/payment-submissions?${params}`, user?.id ?? '')
  const invoices = usePaginatedResource<CustomerInvoice>('/manager/invoices', user?.id ?? '')
  const payments = usePaginatedResource<CustomerPayment>('/manager/payments', user?.id ?? '')
  const loading = submissions.loading || invoices.loading || payments.loading
  const refresh = () => { submissions.refresh(); invoices.refresh(); payments.refresh() }

  const applySearch = (event: FormEvent) => { event.preventDefault(); setSearch(searchInput.trim()) }
  const openAction = (item: PaymentSubmission, kind: 'verify' | 'reject') => {
    setActive(item); setAction(kind); setReference(''); setNote(''); setReason(''); setError(''); setMessage('')
  }
  const submitAction = async (event: FormEvent) => {
    event.preventDefault()
    if (!active || !action || working || (action === 'verify' && active.isDemo)) return
    setWorking(true); setError(''); setMessage('')
    try {
      if (action === 'verify') await managerBillingApi.verify(active.id, reference.trim(), note.trim())
      else await managerBillingApi.reject(active.id, reason.trim())
      setMessage(action === 'verify' ? `Đã xác nhận ${active.submissionCode}; Payment và hóa đơn đã được cập nhật.` : `Đã từ chối ${active.submissionCode}; hóa đơn không thay đổi.`)
      setActive(null); setAction(null); refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật thông báo thanh toán.')
    } finally { setWorking(false) }
  }

  return <section>
    <header className="manager-page-header"><div><p className="eyebrow">Tài chính</p><h1>Chờ xác nhận thanh toán</h1><p>Đối chiếu chuyển khoản thủ công. Chỉ xác nhận sau khi kiểm tra giao dịch ngân hàng.</p></div><button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button></header>
    {message && <div className="manager-notice is-ok" role="status">{message}</div>}{error && !active && <div className="manager-notice is-error" role="alert">{error}</div>}
    <div className="manager-payment-summary"><span>{submissions.data ? submissions.data.items.filter((item) => item.status === 'PENDING_VERIFICATION').length : '—'}<small>Đang chờ trong danh sách</small></span><span>{invoices.data?.total ?? '—'}<small>Hóa đơn đã tải</small></span><span>{payments.data?.total ?? '—'}<small>Payment đã ghi nhận</small></span></div>
    <form className="manager-filter-bar" onSubmit={applySearch}><label className="field-label">Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as PaymentSubmissionStatus | 'ALL')}><option value="PENDING_VERIFICATION">Chờ xác nhận</option><option value="VERIFIED">Đã xác nhận</option><option value="REJECTED">Đã từ chối</option><option value="ALL">Tất cả</option></select></label><label className="manager-payment-search"><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã hóa đơn, yêu cầu, khách hàng, tham chiếu" /></label><button className="button-secondary" type="submit">Tìm kiếm</button></form>
    {submissions.error ? <div className="booking-alert is-error" role="alert">{submissions.error}</div> : submissions.loading ? <p role="status">Đang tải yêu cầu xác nhận…</p> : !submissions.data?.items.length ? <div className="manager-empty"><Wallet size={28} /><h2>Không có yêu cầu xác nhận</h2><p>Thông báo chuyển khoản sẽ xuất hiện tại đây.</p></div> : <div className="manager-submission-list">{submissions.data.items.map((item) => <article className="manager-submission-card" key={item.id}>
      <div className="manager-submission-heading"><div><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{statusLabel[item.status]}</span><h2>{item.invoice.invoiceCode}</h2><small>{item.submissionCode} · {formatPortalDate(item.submittedAt, true)}</small></div><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></div>
      <dl className="manager-submission-facts"><div><dt>Khách hàng</dt><dd>{item.customer.fullName}</dd><small>{item.customer.email} · {item.customer.phone || 'Chưa có SĐT'}</small></div><div><dt>Số dư hóa đơn hiện tại</dt><dd>{moneyLabel(item.invoice.balanceDue, item.invoice.currency)}</dd></div><div><dt>Mã giao dịch chuyển khoản</dt><dd>{item.transferReference || 'Chưa cung cấp'}</dd></div><div><dt>Trạng thái hóa đơn</dt><dd>{item.invoice.status}</dd></div></dl>
      {item.isDemo && <p className="manager-notice">Bản ghi mô phỏng có sẵn, không có giao dịch ngân hàng thật. Không xác nhận nhận tiền cho bản ghi này.</p>}{item.customerNote && <p className="manager-submission-note">Ghi chú khách hàng: {item.customerNote}</p>}
      {item.status === 'REJECTED' && item.rejectionReason && <p className="manager-notice is-error">Lý do: {item.rejectionReason}</p>}
      {item.status === 'VERIFIED' && item.verifiedPayment && <p className="manager-notice is-ok">Payment {item.verifiedPayment.paymentCode} đã được ghi nhận.</p>}
      {item.status === 'PENDING_VERIFICATION' && <div className="manager-submission-actions"><button className="button-primary" type="button" disabled={Boolean(item.isDemo)} onClick={() => openAction(item, 'verify')}><Check size={16} /> Xác nhận</button><button className="button-secondary" type="button" onClick={() => openAction(item, 'reject')}><X size={16} /> Từ chối</button></div>}
    </article>)}</div>}
    {active && action && <div className="payment-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) { setActive(null); setAction(null) } }}><section className="payment-modal manager-review-modal" role="dialog" aria-modal="true" aria-labelledby="manager-review-title"><header><div><p className="eyebrow">{active.invoice.invoiceCode}</p><h2 id="manager-review-title">{action === 'verify' ? 'Xác nhận chuyển khoản' : 'Từ chối yêu cầu'}</h2></div><button type="button" aria-label="Đóng" disabled={working} onClick={() => { setActive(null); setAction(null) }}><X size={20} /></button></header><p className="manager-review-amount">Khách báo đã chuyển <strong>{moneyLabel(active.amount, active.invoice.currency)}</strong>. Số dư hiện tại <strong>{moneyLabel(active.invoice.balanceDue, active.invoice.currency)}</strong>.</p><form onSubmit={submitAction} className="manager-review-form">{action === 'verify' ? <><label className="field-label">Mã tham chiếu giao dịch ngân hàng<input required maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="BANK-TXN-123456" /></label><label className="field-label">Ghi chú đối chiếu, không bắt buộc<textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label><p className="staff-muted">Khi xác nhận, hệ thống tạo một Payment thật và cập nhật hóa đơn qua nghiệp vụ hiện có.</p></> : <label className="field-label">Lý do từ chối<textarea required minLength={1} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Không tìm thấy giao dịch phù hợp…" /></label>}{error && <div className="manager-notice is-error" role="alert">{error}</div>}<div className="manager-submission-actions"><button className="button-primary" type="submit" disabled={working || (action === 'verify' ? !reference.trim() : !reason.trim())}>{working ? 'Đang xử lý…' : action === 'verify' ? 'Xác nhận đã nhận tiền' : 'Từ chối yêu cầu'}</button><button className="button-secondary" type="button" disabled={working} onClick={() => { setActive(null); setAction(null) }}>Hủy</button></div></form></section></div>}
  </section>
}
