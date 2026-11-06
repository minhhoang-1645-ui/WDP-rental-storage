import { useCustomerPagination } from '../../components/customer/useCustomerPagination'
import { CreditCard, ExternalLink, FileText, History, QrCode, RefreshCw, Wallet, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel, customerStatusLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import { customerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { BankTransferConfig, OnlinePaymentPollingStatus, OnlinePaymentStatusResult, PaymentSubmission } from '../../types/payment'
import { InvoiceTransferDialog } from '../../components/customer/InvoiceTransferDialog'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { readPendingOnlinePayments, removePendingOnlinePayment, savePendingOnlinePayment, type PendingOnlinePayment } from '../../services/online-payment-session'
import { paymentWindowClosed, paymentTimeLeft } from '../../utils/payment-state'
import { vnpayDestination } from '../../utils/vnpay-destination'

type View = 'invoices' | 'payments' | 'submissions'

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const invoiceFilter = params.get('invoice')?.trim() ?? ''
  const reservationFilter = params.get('reservation')?.trim() ?? ''
  const scoped = Boolean(invoiceFilter || reservationFilter)
  const matchesInvoice = (invoice: CustomerInvoice) => (!invoiceFilter || invoice.id === invoiceFilter || invoice.invoiceCode === invoiceFilter)
    && (!reservationFilter || invoice.reservation.id === reservationFilter || invoice.reservation.reference === reservationFilter)
  const [view, setView] = useState<View>(() => ['payments', 'submissions'].includes(params.get('view') ?? '') ? params.get('view') as View : 'invoices')
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null)
  const [onlineInvoiceId, setOnlineInvoiceId] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [onlineNotice, setOnlineNotice] = useState('')
  const [pendingOnline, setPendingOnline] = useState<PendingOnlinePayment | null>(() => user ? readPendingOnlinePayments(user.id)[0] ?? null : null)
  const [onlineStatus, setOnlineStatus] = useState<OnlinePaymentPollingStatus>('PENDING')
  const [pollError, setPollError] = useState('')
  const [onlineResult, setOnlineResult] = useState<OnlinePaymentStatusResult>()
  const onlineLock = useRef(false)
  const onlineKeys = useRef(new Map<string, string>())
  const invoices = usePaginatedResource<CustomerInvoice>('/customer/invoices', user?.id ?? '', true)
  const payments = usePaginatedResource<CustomerPayment>('/customer/payments', user?.id ?? '', true)
  const submissions = usePaginatedResource<PaymentSubmission>('/customer/payment-submissions', user?.id ?? '', true)
  const bank = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '')
  const refreshInvoices = invoices.refresh
  const refreshPayments = payments.refresh
  const refreshSubmissions = submissions.refresh
  const refreshBank = bank.refresh
  const current = view === 'invoices' ? invoices : view === 'payments' ? payments : submissions
  const shownInvoices = (invoices.data?.items ?? []).filter(matchesInvoice)
  const invoiceIds = new Set(shownInvoices.map(invoice => invoice.id))
  const shownPayments = (payments.data?.items ?? []).filter(payment => !scoped || invoiceIds.has(payment.invoice.id))
  const shownSubmissions = (submissions.data?.items ?? []).filter(submission => !scoped || invoiceIds.has(submission.invoice.id))
  const refresh = () => { refreshInvoices(); refreshPayments(); refreshSubmissions(); refreshBank() }

  useEffect(() => {
    if (!pendingOnline || onlineStatus !== 'FAILED' || onlineResult?.reconciliation || !invoices.data?.items.some(invoice => invoice.id === pendingOnline.invoiceId && invoice.status === 'PAID')) return
    // Synchronize the browser session after an authoritative invoice refresh.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      onlineLock.current = false
      setPendingOnline(null)
      setOnlineResult(undefined)
      setOnlineInvoiceId('')
      setPollError('')
      setOnlineStatus('PENDING')
    })
    return () => { cancelled = true }
  }, [invoices.data, pendingOnline, onlineStatus, onlineResult?.reconciliation])

  useEffect(() => {
    if (!pendingOnline) return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      try {
        const result = await customerBillingApi.onlinePaymentStatus(pendingOnline.transactionId, controller.signal)
        if (stopped) return
        setPollError('')
        setOnlineResult(result)
        if (result.status === 'SUCCESS' && result.invoice.status === 'PAID') {
          removePendingOnlinePayment(pendingOnline)
          setOnlineStatus('SUCCESS')
          refreshInvoices()
          refreshPayments()
          navigate(`/customer/payments/vnpay-return?transactionId=${encodeURIComponent(result.transactionId)}`, { replace: true })
          return
        }
        if (result.providerStatus === 'CANCELLED' && !result.reconciliation) {
          removePendingOnlinePayment(pendingOnline)
          onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
          setPendingOnline(null)
          setOnlineInvoiceId('')
          setOnlineStatus('PENDING')
          setOnlineNotice(`Phiên thanh toán VNPay cho ${pendingOnline.invoiceCode} đã được hủy.`)
          onlineLock.current = false
          refreshInvoices()
          return
        }
        if (result.status === 'FAILED') {
          setOnlineStatus('FAILED')
          onlineLock.current = false
          if (!result.reconciliation || result.reconciliation.status === 'RECONCILED') return
        }
      } catch (caught) {
        if (!stopped && !controller.signal.aborted) setPollError(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái VNPay.')
      }
      if (!stopped) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer) }
  }, [pendingOnline, navigate, refreshInvoices, refreshPayments])

  useEffect(() => {
    if (!submissions.data?.items.some((item) => item.status === 'PENDING_VERIFICATION')) return
    const timer = window.setInterval(() => { refreshInvoices(); refreshPayments(); refreshSubmissions() }, 12000)
    return () => window.clearInterval(timer)
  }, [submissions.data, refreshInvoices, refreshPayments, refreshSubmissions])

  const afterSubmission = () => {
    refreshInvoices()
    refreshPayments()
    refreshSubmissions()
  }

  const createOnlinePayment = async (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => {
    if (!user || onlineLock.current || pendingOnline || invoice.signing?.complete === false || paymentWindowClosed(invoice) || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) { setOnlineError('Trình duyệt đã chặn tab VNPay. Hãy cho phép popup rồi thử lại.'); return }
    paymentWindow.opener = null
    onlineLock.current = true
    setOnlineInvoiceId(invoice.id)
    setOnlineError('')
    setOnlineNotice('')
    setOnlineResult(undefined)
    const keyIdentity = `${invoice.id}:${mode}`
    let key = onlineKeys.current.get(keyIdentity)
    if (!key) {
      key = `cust-vnpay-${crypto.randomUUID()}`
      onlineKeys.current.set(keyIdentity, key)
    }
    try {
      const transaction = await customerBillingApi.createOnlinePayment(invoice.id, key, mode === 'VNPAYQR' ? 'VNPAYQR' : undefined)
      const destination = vnpayDestination(transaction.paymentUrl)
      const pending: PendingOnlinePayment = { customerId: user.id, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, transactionId: transaction.transactionId, merchantOrderRef: transaction.merchantOrderRef, amount: transaction.amount, expiresAt: transaction.expiresAt, paymentUrl: destination.href, mode, createdAt: new Date().toISOString() }
      savePendingOnlinePayment(pending)
      setPendingOnline(pending)
      setOnlineStatus('PENDING')
      setPollError('')
      paymentWindow.location.replace(destination.href)
    } catch (caught) {
      paymentWindow.close()
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
    {pendingOnline && <OnlinePaymentWaiting payment={pendingOnline} status={onlineStatus} reconciliation={onlineResult?.reconciliation} providerStatus={onlineResult?.providerStatus} networkError={pollError} onRelease={() => {
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      setPendingOnline(null)
      setOnlineStatus('PENDING')
      setPollError('')
      setOnlineInvoiceId('')
      onlineLock.current = false
      setOnlineResult(undefined)
      refreshInvoices()
    }} />}
    {onlineError && <div className="booking-alert is-error payment-online-error" role="alert">{onlineError}</div>}
    {onlineNotice && <p className="customer-filter-notice" role="status">{onlineNotice}</p>}
    {scoped && <p className="customer-filter-notice">Đang xem giao dịch của {reservationFilter ? 'đơn thuê được chọn' : 'hóa đơn được chọn'} · <Link to="/customer/payments">Xem tất cả</Link></p>}
    {current.status === 401 || scoped && invoices.status === 401 ? <CustomerSessionExpired /> : current.loading || scoped && invoices.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error || scoped && invoices.error ? <PortalError message={current.error || invoices.error || 'Không tải được dữ liệu thanh toán.'} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList items={shownInvoices} submissions={shownSubmissions} onBankTransfer={setSelectedInvoice} onOnlinePay={createOnlinePayment} onlineInvoiceId={onlineInvoiceId} hasPendingOnline={Boolean(pendingOnline)} vnpayConfigured={bank.data?.vnpayConfigured === true} />
      : view === 'payments'
        ? <PaymentList items={shownPayments} />
        : <SubmissionList items={shownSubmissions} />}
    {selectedInvoice && <InvoiceTransferDialog id={selectedInvoice.id} onlinePending={Boolean(pendingOnline)} onClose={() => setSelectedInvoice(null)} onSaved={afterSubmission} />}
  </section>
}

function OnlinePaymentWaiting({ payment, status, reconciliation, providerStatus, networkError, onRelease }: { payment: PendingOnlinePayment; status: OnlinePaymentPollingStatus; reconciliation?: OnlinePaymentStatusResult['reconciliation']; providerStatus?: OnlinePaymentStatusResult['providerStatus']; networkError: string; onRelease: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const failed = status === 'FAILED'
  const resolved = reconciliation?.status === 'RECONCILED'
  const awaitingRefund = reconciliation?.status === 'REFUND_REQUIRED'
  return <div className={`vnpay-waiting-panel ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    <span className="vnpay-waiting-icon">{failed ? <X size={23} /> : <span className="customer-spinner" />}</span>
    {!failed && !reconciliation && <small>{paymentTimeLeft(payment.expiresAt, now)}. Hết phiên có thể thử lại nếu đơn còn hạn giữ kho.</small>}
    <div><strong>{reconciliation ? resolved ? 'Đã hoàn tất đối soát' : awaitingRefund ? 'Đang chờ hoàn tiền' : 'Giao dịch đang được đối soát' : failed ? providerStatus === 'EXPIRED' ? 'Phiên thanh toán đã hết hạn' : providerStatus === 'CANCELLED' ? 'Bạn đã hủy thanh toán VNPay' : 'Thanh toán VNPay không thành công' : 'Đang chờ VNPay xác nhận'}</strong><span>{payment.invoiceCode} · {moneyLabel(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</span>{networkError && (!failed || reconciliation && !resolved) && <small>{networkError} Hệ thống sẽ tự thử lại.</small>}</div>
    {!failed && !reconciliation && payment.paymentUrl && (() => { try { const url = vnpayDestination(payment.paymentUrl); return <a className="button-secondary" href={url.href} target="_blank" rel="noopener noreferrer">Mở lại VNPay</a> } catch { return null } })()}
    {reconciliation && <div style={{ gridColumn: '1 / -1', minWidth: 0, overflowWrap: 'anywhere' }}><p>Hồ sơ {reconciliation.reconciliationCode}. {resolved ? 'NestBox đã ghi nhận kết quả xử lý. Việc đóng thông báo không tạo thanh toán mới.' : awaitingRefund ? 'NestBox đã xác định khoản tiền cần hoàn lại và sẽ cập nhật khi xác nhận hoàn tiền thực tế; vui lòng không thanh toán lại.' : 'VNPay đã báo thành công nhưng khoản tiền cần được kiểm tra. NestBox đang đối soát; vui lòng không thanh toán lại.'}</p>{reconciliation.resolutionNote && <p>Kết quả từ NestBox: {reconciliation.resolutionNote}</p>}</div>}
    {resolved ? <button type="button" className="button-secondary" style={{ gridColumn: '1 / -1' }} onClick={onRelease}>Đã xem kết quả đối soát</button> : failed && !reconciliation && <button type="button" className="button-secondary" onClick={onRelease}>Thử thanh toán lại</button>}
  </div>
}

function InvoiceList({ items, submissions, onBankTransfer, onOnlinePay, onlineInvoiceId, hasPendingOnline, vnpayConfigured }: { items: CustomerInvoice[]; submissions: PaymentSubmission[]; onBankTransfer: (invoice: CustomerInvoice) => void; onOnlinePay: (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => void; onlineInvoiceId: string; hasPendingOnline: boolean; vnpayConfigured: boolean }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi NestBox xác nhận yêu cầu đặt kho hoặc kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => submission.status === 'PENDING_VERIFICATION').map((submission) => submission.invoice.id))
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleItems.map(invoice => {
    const payable = invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status);
    const unsigned = invoice.signing?.complete === false;
    const expired = paymentWindowClosed(invoice);
    return <tr key={invoice.id}>
      <td data-label="Mã hóa đơn"><strong>{invoice.invoiceCode}</strong><small>{invoice.reservation.reference}</small></td><td data-label="Kỳ thanh toán">{customerStatusLabel(invoice.type)}</td><td data-label="Tổng tiền">{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td data-label="Đã trả">{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td data-label="Còn lại"><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td data-label="Hạn trả">{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</td><td data-label="Trạng thái"><CustomerStatus status={invoice.status} /></td>
      <td data-label="Thao tác"><div className="payment-actions">
        <button type="button" className="button-secondary payment-table-action" onClick={() => onBankTransfer(invoice)}>{payable ? 'Chi tiết & chuyển khoản' : 'Xem hóa đơn'}</button>
        {payable && (expired ? <p>Đã hết hạn giữ kho. Nếu đã chuyển tiền, hãy gửi hỗ trợ để đối chiếu.</p> : unsigned ? <><p>Bạn cần ký tài liệu trước khi thanh toán.</p><Link className="portal-text-button" to={invoice.signing?.renewalId ? `/customer/renewals?renewal=${encodeURIComponent(invoice.signing.renewalId)}` : `/customer/contracts?reservation=${encodeURIComponent(invoice.reservation.reference)}`}>Xem và ký tài liệu</Link></> : pendingInvoiceIds.has(invoice.id) ? <span className="payment-pending-label">Đang chờ NestBox xác nhận</span> : ['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type) ? <>
          {!vnpayConfigured ? <><small>Thanh toán trực tuyến hiện chưa khả dụng. Bạn có thể xem chi tiết hóa đơn để chuyển khoản hoặc liên hệ cơ sở thanh toán trực tiếp.</small><Link className="portal-text-button" to={`/customer/support?reservation=${encodeURIComponent(invoice.reservation.id)}`}>Hỗ trợ về hóa đơn</Link></> : <><button type="button" className="button-secondary payment-table-action" disabled={!vnpayConfigured || Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice, 'VNPAY')}><ExternalLink size={15} /> Thanh toán VNPay</button>
          <button type="button" className="button-primary payment-table-action" disabled={!vnpayConfigured || Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice, 'VNPAYQR')}><QrCode size={15} />{onlineInvoiceId === invoice.id ? 'Đang mở VNPay QR…' : 'Quét VNPay QR'}</button></>}
        </> : null)}
      </div></td>
    </tr>;
  })}</tbody></table></div>{pagination}</>
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
