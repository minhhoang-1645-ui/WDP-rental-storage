import { Check, RefreshCw, Search, Wallet, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pagination } from '../../components/manager/PortalUi'
import { CopyRecordCode } from '../../components/workspace/RecordIdentity'
import { internalPageSize } from '../../utils/internal-pagination'
import { useDialog } from '../../hooks/useDialog'
import { useAuth } from '../../auth/auth-context'
import { formatPortalDate, moneyLabel, customerStatusLabel } from '../../components/customer/CustomerPortalHelpers'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { managerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { PaymentSubmission, PaymentSubmissionStatus } from '../../types/payment'

const statusLabel: Record<PaymentSubmissionStatus, string> = { PENDING_VERIFICATION: 'Chờ xác nhận', VERIFIED: 'Đã xác nhận', REJECTED: 'Đã từ chối' }

export function ManagerPaymentSubmissionsPage() {
  const { user } = useAuth()
  const [locationParams, setLocationParams] = useSearchParams()
  const selectedId = locationParams.get('submission')
  const limit = internalPageSize(locationParams)
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
  const dialogRef = useDialog(Boolean(active && action), working, () => { setActive(null); setAction(null) })
  const params = new URLSearchParams({ limit: '100' })
  if (!selectedId && status !== 'ALL') params.set('status', status)
  if (!selectedId && search) params.set('search', search)
  const submissions = usePaginatedResource<PaymentSubmission>(`/manager/payment-submissions?${params}`, user?.id ?? '')
  const invoices = usePaginatedResource<CustomerInvoice>('/manager/invoices', user?.id ?? '')
  const payments = usePaginatedResource<CustomerPayment>('/manager/payments', user?.id ?? '')
  const loading = submissions.loading || invoices.loading || payments.loading
  const refresh = () => { submissions.refresh(); invoices.refresh(); payments.refresh() }

  const items = (submissions.data?.items ?? []).filter(item => !selectedId || item.id === selectedId)
  const page = Math.min(Math.max(1, Math.floor(Number(locationParams.get('page')) || 1)), Math.max(1, Math.ceil(items.length / limit)))
  const visibleItems = items.slice((page - 1) * limit, page * limit)
  function updatePage(key: 'page' | 'limit', value: number) {
    setLocationParams(previous => {
      const next = new URLSearchParams(previous)
      next.set(key, String(value))
      if (key === 'limit') next.delete('page')
      return next
    }, { replace: true })
  }
  const applySearch = (event: FormEvent) => { event.preventDefault(); setSearch(searchInput.trim()); updatePage('page', 1) }
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
      setMessage(action === 'verify' ? `Đã xác nhận ${active.submissionCode}; khoản thu và hóa đơn đã được cập nhật.` : `Đã từ chối ${active.submissionCode}; hóa đơn không thay đổi.`)
      setActive(null); setAction(null); refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật thông báo thanh toán.')
    } finally { setWorking(false) }
  }

  return <section>
    <header className="manager-page-header"><div><h1>Xác minh chuyển khoản</h1><p>Chỉ xác nhận sau khi đối chiếu tiền thực nhận với giao dịch ngân hàng.</p></div><button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button></header>
    {message && <div className="manager-notice is-ok" role="status">{message}</div>}{error && !active && <div className="manager-notice is-error" role="alert">{error}</div>}
    <div className="manager-payment-summary"><span>{submissions.data ? items.filter((item) => item.status === 'PENDING_VERIFICATION').length : '—'}<small>Đang chờ trong danh sách</small></span><span>{invoices.data?.total ?? '—'}<small>Hóa đơn đã tải</small></span><span>{payments.data?.total ?? '—'}<small>Khoản thu đã ghi nhận</small></span></div>
    {selectedId ? <Link className="button-secondary manager-back-to-list" to="/manager/payment-submissions">Xem tất cả thông báo chuyển khoản</Link> :
      <form data-wdp-draft="ignore" className="manager-filter-bar" onSubmit={applySearch}><label className="field-label">Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value as PaymentSubmissionStatus | 'ALL'); updatePage('page', 1) }}><option value="PENDING_VERIFICATION">Chờ xác nhận</option><option value="VERIFIED">Đã xác nhận</option><option value="REJECTED">Đã từ chối</option><option value="ALL">Tất cả</option></select></label><label className="manager-payment-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Tìm thông báo chuyển khoản" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã hóa đơn, yêu cầu, khách hàng, tham chiếu" /></label><button className="button-secondary" type="submit">Tìm kiếm</button></form>}
    {submissions.error ? <div className="booking-alert is-error" role="alert">{submissions.error}</div> : submissions.loading ? <p role="status">Đang tải yêu cầu xác nhận…</p> : !items.length ? <div className="manager-empty"><Wallet size={28} /><h2>Không có thông báo phù hợp</h2></div> : <div className="manager-submission-list">{visibleItems.map((item) => <article className="manager-submission-card" key={item.id}>
      <div className="manager-submission-heading">
        <div><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{statusLabel[item.status]}</span><h2>{item.customer.fullName}</h2><small>{item.customer.email} · {item.customer.phone || 'Chưa có SĐT'}</small></div>
        <div><small>Số tiền khách báo chuyển</small><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></div>
      </div>
      <dl className="manager-submission-facts"><div><dt>Hóa đơn</dt><dd>{item.invoice.invoiceCode}</dd><small>{customerStatusLabel(item.invoice.status)}</small></div><div><dt>Số dư hóa đơn hiện tại</dt><dd>{moneyLabel(item.invoice.balanceDue, item.invoice.currency)}</dd></div><div><dt>Mã giao dịch chuyển khoản</dt><dd>{item.transferReference || 'Chưa cung cấp'}</dd></div><div><dt>Thông báo chuyển khoản</dt><dd><CopyRecordCode value={item.submissionCode} /></dd><small>{formatPortalDate(item.submittedAt, true)}</small></div></dl>
      {item.isDemo && <p className="manager-notice">Bản ghi mô phỏng có sẵn, không có giao dịch ngân hàng thật. Không xác nhận nhận tiền cho bản ghi này.</p>}{item.customerNote && <p className="manager-submission-note">Ghi chú khách hàng: {item.customerNote}</p>}
      {item.status === 'REJECTED' && item.rejectionReason && <p className="manager-notice is-error">Lý do: {item.rejectionReason}</p>}
      {item.status === 'VERIFIED' && item.verifiedPayment && <p className="manager-notice is-ok">Khoản thu {item.verifiedPayment.paymentCode} đã được ghi nhận.</p>}
      {item.status === 'PENDING_VERIFICATION' && <div className="manager-submission-actions"><button className="button-primary" type="button" disabled={Boolean(item.isDemo)} onClick={() => openAction(item, 'verify')}><Check size={16} /> Xác nhận</button><button className="button-secondary" type="button" onClick={() => openAction(item, 'reject')}><X size={16} /> Từ chối</button></div>}
    </article>)}</div>}
    {!selectedId && items.length > 0 && <Pagination page={page} limit={limit} total={items.length} onChange={value => updatePage('page', value)} onLimitChange={value => updatePage('limit', value)} />}
    {active && action && <div className="payment-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) { setActive(null); setAction(null) } }}><section ref={dialogRef} tabIndex={-1} className="payment-modal manager-review-modal" role="dialog" aria-modal="true" aria-labelledby="manager-review-title"><header><div><p className="eyebrow">{active.invoice.invoiceCode}</p><h2 id="manager-review-title">{action === 'verify' ? 'Xác nhận chuyển khoản' : 'Từ chối yêu cầu'}</h2></div><button type="button" aria-label="Đóng" disabled={working} onClick={() => { setActive(null); setAction(null) }}><X size={20} /></button></header><p className="manager-review-amount">Khách báo đã chuyển <strong>{moneyLabel(active.amount, active.invoice.currency)}</strong>. Số dư hiện tại <strong>{moneyLabel(active.invoice.balanceDue, active.invoice.currency)}</strong>.</p><form onSubmit={submitAction} className="manager-review-form">{action === 'verify' ? <><label className="field-label">Mã tham chiếu giao dịch ngân hàng<input required maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="BANK-TXN-123456" /></label><label className="field-label">Ghi chú đối chiếu, không bắt buộc<textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label><p className="staff-muted">Khi xác nhận, hệ thống ghi nhận khoản tiền đã thu và cập nhật số dư hóa đơn.</p></> : <label className="field-label">Lý do từ chối<textarea required minLength={1} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Không tìm thấy giao dịch phù hợp…" /></label>}{error && <div className="manager-notice is-error" role="alert">{error}</div>}<div className="manager-submission-actions"><button className="button-primary" type="submit" disabled={working || (action === 'verify' ? !reference.trim() : !reason.trim())}>{working ? 'Đang xử lý…' : action === 'verify' ? 'Xác nhận đã nhận tiền' : 'Từ chối yêu cầu'}</button><button className="button-secondary" type="button" disabled={working} onClick={() => { setActive(null); setAction(null) }}>Hủy</button></div></form></section></div>}
  </section>
}
