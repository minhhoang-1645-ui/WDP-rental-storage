import { InvoiceTransferDialog } from '../../components/customer/InvoiceTransferDialog';
import { useCustomerPagination } from '../../components/customer/useCustomerPagination'
import { CreditCard, ExternalLink, FileText, History, RefreshCw, Wallet, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel, customerStatusLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { customerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { BankTransferConfig, OnlinePaymentPollingStatus, OnlinePaymentStatus, OnlinePaymentStatusResult, PaymentSubmission } from '../../types/payment'
import { useApiResource } from '../../services/useApiResource'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { readPendingOnlinePayments, removePendingOnlinePayment, savePendingOnlinePayment, type PendingOnlinePayment } from '../../services/online-payment-session'
import { hasDraft } from '../../services/live-events'
import { paymentTimeLeft, paymentWindowClosed } from '../../utils/payment-state'

type View = 'invoices' | 'payments' | 'submissions'

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}
export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'submissions' ? 'submissions' : params.get('view') === 'payments' ? 'payments' : 'invoices'
  const setView = (next: View) => setParams(current => {
    const value = new URLSearchParams(current)
    value.set('view', next)
    return value
  }, { replace: true })
  const invoiceFilter = params.get('invoice') ?? ''
  const reservationFilter = params.get('reservation') ?? ''
  const [onlineInvoiceId, setOnlineInvoiceId] = useState('')
  const [detailsId, setDetailsId] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [pendingOnline, setPendingOnline] = useState<PendingOnlinePayment | null>(() => user ? readPendingOnlinePayments(user.id)[0] ?? null : null)
  const [onlineStatus, setOnlineStatus] = useState<OnlinePaymentPollingStatus>('PENDING')
  const [providerStatus, setProviderStatus] = useState<OnlinePaymentStatus>('PENDING')
  const [pollError, setPollError] = useState('')
  const [reconciliationRequired, setReconciliationRequired] = useState(false)
  const onlineLock = useRef(false)
  const onlineKeys = useRef(new Map<string, string>())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const invoices = usePaginatedResource<CustomerInvoice>('/customer/invoices', user?.id ?? '', true)
  const payments = usePaginatedResource<CustomerPayment>('/customer/payments', user?.id ?? '', true)
  const submissions = usePaginatedResource<PaymentSubmission>('/customer/payment-submissions', user?.id ?? '', true)
  const channels = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '', true)
  const refreshInvoices = invoices.refresh
  const refreshPayments = payments.refresh
  const refreshSubmissions = submissions.refresh
  const current = view === 'invoices' ? invoices : view === 'payments' ? payments : submissions
  const matchesInvoice = (invoice: { id?: string; invoiceCode: string; reservation?: { id: string; reference: string } }) => (!invoiceFilter || invoice.id === invoiceFilter || invoice.invoiceCode === invoiceFilter) && (!reservationFilter || invoice.reservation?.id === reservationFilter || invoice.reservation?.reference === reservationFilter)
  const refresh = () => { refreshInvoices(); refreshPayments(); refreshSubmissions(); channels.refresh() }

  useEffect(() => {
    if (!pendingOnline || onlineStatus !== 'PENDING') return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      try {
        const result = await customerBillingApi.onlinePaymentStatus(pendingOnline.transactionId, controller.signal)
        if (stopped) return
        setPollError('')
        setProviderStatus(result.providerStatus)
        if (result.status === 'SUCCESS' && result.invoice.status === 'PAID') {
          removePendingOnlinePayment(pendingOnline)
          setOnlineStatus('SUCCESS')
          refreshInvoices()
          refreshPayments()
          navigate(paymentSuccessPath(result.invoice.type, result.transactionId), { replace: true })
          return
        }
        if (result.status === 'FAILED') {
          if (result.reconciliation) {
            setReconciliationRequired(true)
            setPollError(`VNPay đã xác nhận giao dịch nhưng hóa đơn không còn hiệu lực. WDP đã tạo hồ sơ ${result.reconciliation.reconciliationCode} để đối soát; không cần thanh toán lại.`)
          }
          setOnlineStatus('FAILED')
          onlineLock.current = false
          return
        }
      } catch (caught) {
        if (!stopped && !controller.signal.aborted) setPollError(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái VNPay.')
      }
      if (!stopped) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer) }
  }, [pendingOnline, onlineStatus, navigate, refreshInvoices, refreshPayments])

  useEffect(() => {
    if (!pendingOnline || onlineStatus !== 'FAILED') return
    if (invoices.data?.items.some(invoice => invoice.id === pendingOnline.invoiceId && invoice.status === 'PAID')) {
      const timer = window.setTimeout(() => {
        removePendingOnlinePayment(pendingOnline)
        setPendingOnline(null)
        setOnlineInvoiceId('')
        onlineLock.current = false
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [pendingOnline, onlineStatus, invoices.data])

  useEffect(() => {
    if (!submissions.data?.items.some((item) => item.status === 'PENDING_VERIFICATION')) return
    const timer = window.setInterval(() => {
      if (!hasDraft()) { refreshInvoices(); refreshPayments(); refreshSubmissions() }
    }, 12000)
    return () => window.clearInterval(timer)
  }, [submissions.data, refreshInvoices, refreshPayments, refreshSubmissions])

  const createOnlinePayment = async (invoice: CustomerInvoice) => {
    if (!user || channels.data?.vnpayConfigured !== true || onlineLock.current || pendingOnline || invoice.signing?.complete === false || paymentWindowClosed(invoice) || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) {
      setOnlineError('Trình duyệt đã chặn tab thanh toán mới. Hãy cho phép popup rồi thử lại.')
      return
    }
    paymentWindow.opener = null
    paymentWindow.document.title = 'Đang kết nối VNPay…'
    onlineLock.current = true
    setOnlineInvoiceId(invoice.id)
    setOnlineError('')
    const keyIdentity = `${invoice.id}:VNPAY`
    let key = onlineKeys.current.get(keyIdentity)
    if (!key) {
      key = `cust-vnpay-${crypto.randomUUID()}`
      onlineKeys.current.set(keyIdentity, key)
    }
    try {
      const transaction = await customerBillingApi.createOnlinePayment(invoice.id, key)
      const destination = new URL(transaction.paymentUrl)
      if (destination.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(destination.hostname) || destination.username || destination.password) throw new Error('Đường dẫn thanh toán VNPay không hợp lệ.')
      const pending: PendingOnlinePayment = { customerId: user.id, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, transactionId: transaction.transactionId, merchantOrderRef: transaction.merchantOrderRef, amount: transaction.amount, mode: 'VNPAY', createdAt: new Date().toISOString(), expiresAt: transaction.expiresAt }
      savePendingOnlinePayment(pending)
      setPendingOnline(pending)
      setOnlineStatus('PENDING')
      setProviderStatus('PENDING')
      setPollError('')
      paymentWindow.location.replace(transaction.paymentUrl)
    } catch (caught) {
      paymentWindow.close()
      onlineKeys.current.delete(keyIdentity)
      setOnlineError(caught instanceof Error ? caught.message : 'Không thể khởi tạo thanh toán VNPay.')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" description="Hóa đơn và giao dịch đã xác nhận được lấy trực tiếp từ hệ thống NestBox." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist" aria-label="Thông tin thanh toán">
      <button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'submissions'} className={view === 'submissions' ? 'is-active' : ''} onClick={() => setView('submissions')}><Wallet size={17} /> Yêu cầu xác nhận ({submissions.data?.total ?? 0})</button>
    </div>
    {pendingOnline && <OnlinePaymentWaiting payment={pendingOnline} status={onlineStatus} providerStatus={providerStatus} networkError={pollError} reconciliationRequired={reconciliationRequired} onRetry={() => {
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      setPendingOnline(null)
      setOnlineStatus('PENDING')
      setProviderStatus('PENDING')
      setPollError('')
      setReconciliationRequired(false)
      setOnlineInvoiceId('')
      onlineLock.current = false
    }} />}
    {onlineError && <div className="booking-alert is-error payment-online-error" role="alert">{onlineError}</div>}
    {channels.error && <PortalError message="Chưa kiểm tra được các kênh thanh toán. Hãy thử lại trước khi thanh toán." onRetry={channels.refresh} />}
    {channels.data && !channels.data.configured && !channels.data.vnpayConfigured && <p role="status" className="activity-update-note">Thanh toán trực tuyến hiện chưa khả dụng. Bạn có thể thanh toán tại cơ sở hoặc gửi hỗ trợ về hóa đơn để được hướng dẫn. Chỉ khi NestBox xác nhận thu tiền, hóa đơn mới được cập nhật.</p>}
    {(invoiceFilter || reservationFilter) && <div className="activity-update-note"><span>{invoiceFilter ? `Đang xem hóa đơn: ${invoices.data?.items.find(matchesInvoice)?.invoiceCode ?? invoiceFilter}` : 'Đang xem hóa đơn của kho thuê được chọn'}</span><button type="button" className="portal-text-button" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('invoice'); next.delete('reservation'); return next }, { replace: true })}>Xem tất cả hóa đơn</button></div>}
    {current.status === 401 ? <CustomerSessionExpired /> : current.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error ? <PortalError message={current.error} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList onlineAvailable={channels.data?.vnpayConfigured === true} now={now} items={(invoices.data?.items ?? []).filter(matchesInvoice)} submissions={submissions.data?.items ?? []} onOnlinePay={createOnlinePayment} onDetails={setDetailsId} onlineInvoiceId={onlineInvoiceId} hasPendingOnline={Boolean(pendingOnline)} />
      : view === 'payments'
        ? <PaymentList items={(payments.data?.items ?? []).filter(item => matchesInvoice(item.invoice))} />
        : <SubmissionList items={(submissions.data?.items ?? []).filter(item => matchesInvoice(item.invoice))} />}
    {detailsId && <InvoiceTransferDialog id={detailsId} onlinePending={Boolean(pendingOnline)} onClose={() => setDetailsId('')} onSaved={refresh} />}
  </section>
}

function paymentSuccessPath(type: OnlinePaymentStatusResult['invoice']['type'], transactionId: string) {
  const query = `payment=success&transactionId=${encodeURIComponent(transactionId)}`
  if (type === 'INITIAL') return `/customer/contracts?${query}`
  if (type === 'RENEWAL') return `/customer/renewals?${query}`
  return `/customer/payments?view=payments&${query}`
}

function OnlinePaymentWaiting({ payment, status, providerStatus, networkError, reconciliationRequired, onRetry }: { payment: PendingOnlinePayment; status: OnlinePaymentPollingStatus; providerStatus: OnlinePaymentStatus; networkError: string; reconciliationRequired: boolean; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (status !== 'PENDING') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status])
  const failed = status === 'FAILED'
  const failureTitle = reconciliationRequired ? 'Giao dịch đang được đối soát' : providerStatus === 'EXPIRED' ? 'Phiên thanh toán đã hết hạn' : providerStatus === 'CANCELLED' ? 'Bạn đã hủy thanh toán VNPay' : 'Thanh toán VNPay không thành công'
  return <div className={`vnpay-waiting-panel ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    <span className="vnpay-waiting-icon">{failed ? <X size={23} /> : <span className="customer-spinner" />}</span>
    <div><strong>{failed ? failureTitle : 'Đang chờ VNPay xác nhận'}</strong><span>{payment.invoiceCode} · {moneyLabel(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</span>{!failed && <small>{paymentTimeLeft(payment.expiresAt, now)}. Hệ thống tự kiểm tra kết quả.</small>}{networkError && <small>{networkError}{!failed ? ' Hệ thống sẽ tự thử lại.' : ''}</small>}</div>
    {failed && !reconciliationRequired && <button type="button" className="button-secondary" onClick={onRetry}>Thử thanh toán lại</button>}
  </div>
}

function InvoiceList({ onlineAvailable, now, items, submissions, onOnlinePay, onDetails, onlineInvoiceId, hasPendingOnline }: { onlineAvailable: boolean; onDetails: (id: string) => void; now: number; items: CustomerInvoice[]; submissions: PaymentSubmission[]; onOnlinePay: (invoice: CustomerInvoice) => void; onlineInvoiceId: string; hasPendingOnline: boolean }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi NestBox xác nhận yêu cầu đặt kho hoặc đến kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => submission.status === 'PENDING_VERIFICATION').map((submission) => submission.invoice.id))
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleItems.map(invoice => <tr key={invoice.id}><td data-label="Mã hóa đơn"><strong>{invoice.invoiceCode}</strong><small>{invoice.reservation.reference}</small></td><td data-label="Kỳ thanh toán">{customerStatusLabel(invoice.type)}</td><td data-label="Tổng tiền">{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td data-label="Đã trả">{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td data-label="Còn lại"><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td data-label="Hạn trả">{invoice.dueAt ? formatPortalDate(invoice.type === 'INITIAL' ? invoice.reservation.expiresAt || invoice.dueAt : invoice.dueAt, invoice.type === 'INITIAL' && Boolean(invoice.reservation.expiresAt)) : '—'}</td><td data-label="Trạng thái"><CustomerStatus status={invoice.status} /></td><td data-label="Thao tác"><button type="button" className="button-secondary" onClick={() => onDetails(invoice.id)}>Chi tiết & chuyển khoản</button>{invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status) ? pendingInvoiceIds.has(invoice.id)
    ? <span className="payment-pending-label">Đang chờ NestBox xác nhận</span>
    : invoice.signing?.complete === false
      ? <div className="payment-actions"><span>Bạn cần ký tài liệu trước khi thanh toán.</span>{invoice.signing.contracts.map(contract => <Link key={contract.id} className="button-secondary" to={`/customer/contracts?contract=${encodeURIComponent(contract.id)}`}>Ký {contract.code}</Link>)}<Link className="button-primary" to={invoice.signing.renewalId ? `/customer/renewals?renewal=${encodeURIComponent(invoice.signing.renewalId)}` : `/customer/contracts?reservation=${encodeURIComponent(invoice.reservation.reference)}`}>{invoice.signing.renewalId ? 'Xem và ký phụ lục' : 'Xem các hợp đồng cần ký'}</Link></div>
    : paymentWindowClosed(invoice, now)
      ? <span className="payment-pending-label">Đã hết hạn giữ kho</span>
      : <div className="payment-actions">{onlineAvailable && ['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type) && <button type="button" className="button-primary payment-table-action" disabled={Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice)}><ExternalLink size={15} /> {onlineInvoiceId === invoice.id ? 'Đang mở VNPay…' : 'Thanh toán VNPay'}</button>}<Link to={`/customer/support?reservation=${encodeURIComponent(invoice.reservation.id)}`}>Hỗ trợ về hóa đơn</Link></div> : '—'}</td></tr>)}</tbody></table></div>{pagination}</>
}

function SubmissionList({ items }: { items: PaymentSubmission[] }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<Wallet size={30} />} title="Chưa có yêu cầu xác nhận"><span>Sau khi chuyển khoản, yêu cầu xác nhận của bạn sẽ hiển thị tại đây. Yêu cầu đang chờ chưa được tính là khoản thanh toán đã ghi nhận.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã yêu cầu</th><th>Hóa đơn</th><th>Số tiền</th><th>Mã chuyển khoản</th><th>Thời gian gửi</th><th>Trạng thái</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id}><td data-label="Mã yêu cầu"><strong>{item.submissionCode}</strong><small>{item.isDemo ? 'Bản ghi mô phỏng có sẵn · không có tiền thật' : 'Thông báo chuyển khoản'}</small></td><td data-label="Hóa đơn">{item.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></td><td data-label="Mã chuyển khoản">{item.transferReference || '—'}</td><td data-label="Thời gian gửi">{formatPortalDate(item.submittedAt, true)}</td><td data-label="Trạng thái"><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{submissionStatus[item.status]}</span>{item.status === 'REJECTED' && item.rejectionReason && <small className="payment-rejection-reason">{item.rejectionReason}</small>}</td></tr>)}</tbody></table></div>{pagination}</>
}

function PaymentList({ items }: { items: CustomerPayment[] }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<CreditCard size={30} />} title="Chưa có giao dịch"><span>Các khoản NestBox đã xác nhận và ghi nhận sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã giao dịch</th><th>Hóa đơn</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th></tr></thead><tbody>{visibleItems.map(payment => <tr key={payment.id}><td data-label="Mã giao dịch"><strong>{payment.paymentCode}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></td><td data-label="Hóa đơn">{payment.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(payment.amount)}</strong></td><td data-label="Phương thức">{payment.reference?.startsWith('WDP-DEMO-') ? 'Mô phỏng · không có tiền thật' : customerStatusLabel(payment.method)}</td><td data-label="Thời gian">{formatPortalDate(payment.receivedAt, true)}</td></tr>)}</tbody></table></div>{pagination}</>
}
