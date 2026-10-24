import { useCustomerPagination } from '../../components/customer/useCustomerPagination'
import { CreditCard, ExternalLink, FileText, History, QrCode, RefreshCw, Wallet, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useDialog } from '../../hooks/useDialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel, customerStatusLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import { customerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { BankTransferConfig, OnlinePaymentPollingStatus, PaymentSubmission } from '../../types/payment'
import { buildVietQrPayload } from '../../utils/vietqr'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { readPendingOnlinePayments, removePendingOnlinePayment, savePendingOnlinePayment, type PendingOnlinePayment } from '../../services/online-payment-session'

type View = 'invoices' | 'payments' | 'submissions'

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('invoices')
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null)
  const [onlineInvoiceId, setOnlineInvoiceId] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [pendingOnline, setPendingOnline] = useState<PendingOnlinePayment | null>(() => user ? readPendingOnlinePayments(user.id)[0] ?? null : null)
  const [onlineStatus, setOnlineStatus] = useState<OnlinePaymentPollingStatus>('PENDING')
  const [pollError, setPollError] = useState('')
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
  const refresh = () => { refreshInvoices(); refreshPayments(); refreshSubmissions(); refreshBank() }

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
        if (result.status === 'SUCCESS' && result.invoice.status === 'PAID') {
          removePendingOnlinePayment(pendingOnline)
          setOnlineStatus('SUCCESS')
          refreshInvoices()
          refreshPayments()
          navigate(`/customer/payments/vnpay-return?transactionId=${encodeURIComponent(result.transactionId)}`, { replace: true })
          return
        }
        if (result.status === 'FAILED') {
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
    if (!submissions.data?.items.some((item) => item.status === 'PENDING_VERIFICATION')) return
    const timer = window.setInterval(() => { refreshInvoices(); refreshPayments(); refreshSubmissions() }, 12000)
    return () => window.clearInterval(timer)
  }, [submissions.data, refreshInvoices, refreshPayments, refreshSubmissions])

  const afterSubmission = () => {
    setSelectedInvoice(null)
    refreshInvoices()
    refreshPayments()
    refreshSubmissions()
    setView('submissions')
  }

  const createOnlinePayment = async (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => {
    if (!user || onlineLock.current || pendingOnline || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) { setOnlineError('Trình duyệt đã chặn tab VNPay. Hãy cho phép popup rồi thử lại.'); return }
    paymentWindow.opener = null
    onlineLock.current = true
    setOnlineInvoiceId(invoice.id)
    setOnlineError('')
    const keyIdentity = `${invoice.id}:${mode}`
    let key = onlineKeys.current.get(keyIdentity)
    if (!key) {
      key = `cust-vnpay-${crypto.randomUUID()}`
      onlineKeys.current.set(keyIdentity, key)
    }
    try {
      const transaction = await customerBillingApi.createOnlinePayment(invoice.id, key, mode === 'VNPAYQR' ? 'VNPAYQR' : undefined)
      const destination = new URL(transaction.paymentUrl)
      if (destination.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(destination.hostname) || destination.username || destination.password) throw new Error('Đường dẫn thanh toán VNPay không hợp lệ.')
      const pending: PendingOnlinePayment = { customerId: user.id, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, transactionId: transaction.transactionId, merchantOrderRef: transaction.merchantOrderRef, amount: transaction.amount, mode, createdAt: new Date().toISOString() }
      savePendingOnlinePayment(pending)
      setPendingOnline(pending)
      setOnlineStatus('PENDING')
      setPollError('')
      paymentWindow.location.replace(transaction.paymentUrl)
    } catch (caught) {
      paymentWindow.close()
      setOnlineError(caught instanceof Error ? caught.message : 'Không thể khởi tạo thanh toán VNPay.')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" description="Hóa đơn và giao dịch đã xác nhận được lấy trực tiếp từ hệ thống WDP." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist" aria-label="Thông tin thanh toán">
      <button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'submissions'} className={view === 'submissions' ? 'is-active' : ''} onClick={() => setView('submissions')}><Wallet size={17} /> Yêu cầu xác nhận ({submissions.data?.total ?? 0})</button>
    </div>
    {pendingOnline && <OnlinePaymentWaiting payment={pendingOnline} status={onlineStatus} networkError={pollError} onRetry={() => {
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      setPendingOnline(null)
      setOnlineStatus('PENDING')
      setPollError('')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }} />}
    {onlineError && <div className="booking-alert is-error payment-online-error" role="alert">{onlineError}</div>}
    {current.status === 401 ? <CustomerSessionExpired /> : current.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error ? <PortalError message={current.error} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList items={invoices.data?.items ?? []} submissions={submissions.data?.items ?? []} onBankTransfer={setSelectedInvoice} onOnlinePay={createOnlinePayment} onlineInvoiceId={onlineInvoiceId} hasPendingOnline={Boolean(pendingOnline)} />
      : view === 'payments'
        ? <PaymentList items={payments.data?.items ?? []} />
        : <SubmissionList items={submissions.data?.items ?? []} />}
    {selectedInvoice && <PaymentModal invoice={selectedInvoice} bank={bank.data ?? null} bankLoading={bank.loading} bankError={bank.error} onClose={() => setSelectedInvoice(null)} onRefresh={() => { refreshInvoices(); refreshSubmissions() }} onSubmitted={afterSubmission} />}
  </section>
}

function OnlinePaymentWaiting({ payment, status, networkError, onRetry }: { payment: PendingOnlinePayment; status: OnlinePaymentPollingStatus; networkError: string; onRetry: () => void }) {
  const failed = status === 'FAILED'
  return <div className={`vnpay-waiting-panel ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    <span className="vnpay-waiting-icon">{failed ? <X size={23} /> : <span className="customer-spinner" />}</span>
    <div><strong>{failed ? 'Thanh toán VNPay không thành công' : 'Đang chờ VNPay xác nhận'}</strong><span>{payment.invoiceCode} · {moneyLabel(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</span>{networkError && !failed && <small>{networkError} Hệ thống sẽ tự thử lại.</small>}</div>
    {failed && <button type="button" className="button-secondary" onClick={onRetry}>Thử thanh toán lại</button>}
  </div>
}

function InvoiceList({ items, submissions, onBankTransfer, onOnlinePay, onlineInvoiceId, hasPendingOnline }: { items: CustomerInvoice[]; submissions: PaymentSubmission[]; onBankTransfer: (invoice: CustomerInvoice) => void; onOnlinePay: (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => void; onlineInvoiceId: string; hasPendingOnline: boolean }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi WDP xác nhận reservation hoặc kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => submission.status === 'PENDING_VERIFICATION').map((submission) => submission.invoice.id))
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleItems.map(invoice => <tr key={invoice.id}><td data-label="Mã hóa đơn"><strong>{invoice.invoiceCode}</strong><small>{invoice.reservation.reference}</small></td><td data-label="Kỳ thanh toán">{customerStatusLabel(invoice.type)}</td><td data-label="Tổng tiền">{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td data-label="Đã trả">{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td data-label="Còn lại"><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td data-label="Hạn trả">{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</td><td data-label="Trạng thái"><CustomerStatus status={invoice.status} /></td><td data-label="Thao tác">{invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status) ? pendingInvoiceIds.has(invoice.id)
    ? <span className="payment-pending-label">Đang chờ WDP xác nhận</span>
    : <div className="payment-actions"><button type="button" className="button-secondary payment-table-action" disabled={Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onBankTransfer(invoice)}><Wallet size={15} /> Chuyển khoản QR</button>{['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type) && <><button type="button" className="button-secondary payment-table-action" disabled={Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice, 'VNPAY')}><ExternalLink size={15} /> Thanh toán VNPay</button><button type="button" className="button-primary payment-table-action" disabled={Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice, 'VNPAYQR')}><QrCode size={15} /> {onlineInvoiceId === invoice.id ? 'Đang mở VNPay QR…' : 'Quét VNPay QR'}</button></>}</div> : '—'}</td></tr>)}</tbody></table></div>{pagination}</>
}

function SubmissionList({ items }: { items: PaymentSubmission[] }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<Wallet size={30} />} title="Chưa có yêu cầu xác nhận"><span>Sau khi chuyển khoản, yêu cầu xác nhận của bạn sẽ hiển thị tại đây. Yêu cầu đang chờ chưa được tính là khoản thanh toán đã ghi nhận.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã yêu cầu</th><th>Hóa đơn</th><th>Số tiền</th><th>Mã chuyển khoản</th><th>Thời gian gửi</th><th>Trạng thái</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id}><td data-label="Mã yêu cầu"><strong>{item.submissionCode}</strong><small>{item.isDemo ? 'Bản ghi mô phỏng có sẵn · không có tiền thật' : 'Thông báo chuyển khoản'}</small></td><td data-label="Hóa đơn">{item.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></td><td data-label="Mã chuyển khoản">{item.transferReference || '—'}</td><td data-label="Thời gian gửi">{formatPortalDate(item.submittedAt, true)}</td><td data-label="Trạng thái"><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{submissionStatus[item.status]}</span>{item.status === 'REJECTED' && item.rejectionReason && <small className="payment-rejection-reason">{item.rejectionReason}</small>}</td></tr>)}</tbody></table></div>{pagination}</>
}

function PaymentList({ items }: { items: CustomerPayment[] }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<CreditCard size={30} />} title="Chưa có giao dịch"><span>Các khoản WDP đã xác nhận và ghi nhận sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã giao dịch</th><th>Hóa đơn</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th></tr></thead><tbody>{visibleItems.map(payment => <tr key={payment.id}><td data-label="Mã giao dịch"><strong>{payment.paymentCode}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></td><td data-label="Hóa đơn">{payment.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(payment.amount)}</strong></td><td data-label="Phương thức">{payment.reference?.startsWith('WDP-DEMO-') ? 'Mô phỏng · không có tiền thật' : customerStatusLabel(payment.method)}</td><td data-label="Thời gian">{formatPortalDate(payment.receivedAt, true)}</td></tr>)}</tbody></table></div>{pagination}</>
}

function PaymentModal({ invoice, bank, bankLoading, bankError, onClose, onRefresh, onSubmitted }: { invoice: CustomerInvoice; bank: BankTransferConfig | null; bankLoading: boolean; bankError: string; onClose: () => void; onRefresh: () => void; onSubmitted: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState<PaymentSubmission | null>(null)
  const [amount, setAmount] = useState(invoice.balanceDue)
  const [transferReference, setTransferReference] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const key = useRef(`cust-transfer-${crypto.randomUUID()}`)
  const lock = useRef(false)
  const dialogRef = useDialog(true, submitting, onClose)
  const qrPayload = useMemo(() => {
    if (!bank?.configured) return ''
    try { return buildVietQrPayload(bank, amount, invoice.invoiceCode) } catch { return '' }
  }, [bank, amount, invoice.invoiceCode])

  const submit = async () => {
    if (!bank?.configured || !qrPayload || lock.current || !Number.isSafeInteger(amount) || amount <= 0 || amount > invoice.balanceDue) return
    lock.current = true
    setSubmitting(true)
    setError('')
    try {
      const result = await customerBillingApi.createSubmission(invoice.id, amount, key.current, transferReference.trim(), customerNote.trim())
      setSubmission(result)
      onRefresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gửi được yêu cầu xác nhận thanh toán.')
    } finally { lock.current = false; setSubmitting(false) }
  }

  return <div className="payment-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <header><div><p className="eyebrow">Chuyển khoản ngân hàng</p><h2 id="payment-modal-title">Thanh toán hóa đơn</h2></div><button type="button" disabled={submitting} onClick={onClose} aria-label="Đóng"><X size={20} /></button></header>
      {submission ? <div className="payment-submit-success" role="status"><Wallet size={25} /><strong>Đang chờ xác nhận thanh toán</strong><span>Mã yêu cầu: {submission.submissionCode}</span><button className="button-primary" type="button" onClick={onSubmitted}>Xem trạng thái yêu cầu</button></div> : <>
        <div className="payment-invoice-summary"><span>Mã hóa đơn<strong>{invoice.invoiceCode}</strong></span><span>Số dư hiện tại<strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></span></div>
        {bank?.configured && <label className="field-label payment-amount-field">Số tiền chuyển khoản (tối đa bằng số dư)<input disabled={submitting} type="number" min={1} max={invoice.balanceDue} step={1} value={amount} onChange={(event) => { setAmount(Number(event.target.value)); key.current = `cust-transfer-${crypto.randomUUID()}` }} /><small className="field-help">Có thể thanh toán một phần. WDP xác nhận xong, số dư hóa đơn sẽ cập nhật.</small></label>}
        {bankLoading ? <div className="payment-config-message">Đang tải thông tin chuyển khoản…</div> : bankError ? <div className="payment-config-message is-error" role="alert">Không tải được thông tin ngân hàng: {bankError}</div> : !bank?.configured ? <div className="payment-config-message is-error" role="alert">WDP chưa cấu hình đầy đủ thông tin tài khoản nhận chuyển khoản. Vui lòng liên hệ hỗ trợ.</div> : !qrPayload ? <div className="payment-config-message is-error" role="alert">Số tiền không hợp lệ nên chưa thể tạo QR. Hãy nhập số tiền nguyên dương nhỏ hơn hoặc bằng số dư.</div> : <>
          <div className="payment-qr-wrap"><QRCodeSVG value={qrPayload} size={224} level="M" title={`QR chuyển khoản hóa đơn ${invoice.invoiceCode}`} /></div>
          <dl className="payment-bank-details"><div><dt>Ngân hàng</dt><dd>{bank.bankName}</dd></div><div><dt>Số tài khoản</dt><dd>{bank.accountNumber}</dd></div><div><dt>Chủ tài khoản</dt><dd>{bank.accountName}</dd></div><div><dt>Số tiền</dt><dd>{moneyLabel(amount, invoice.currency)}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd>{invoice.invoiceCode}</dd></div></dl>
          <p className="payment-transfer-warning">Vui lòng chuyển đúng số tiền và nội dung để WDP dễ xác nhận giao dịch.</p>
          <label className="field-label payment-amount-field">Mã giao dịch ngân hàng, nếu có<input disabled={submitting} maxLength={200} value={transferReference} onChange={(event) => { setTransferReference(event.target.value); key.current = `cust-transfer-${crypto.randomUUID()}` }} placeholder="Mã trên biên nhận chuyển khoản" /></label>
          <label className="field-label payment-amount-field">Ghi chú cho WDP, không bắt buộc<textarea disabled={submitting} rows={2} maxLength={1000} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); key.current = `cust-transfer-${crypto.randomUUID()}` }} /></label>
          {error && <div className="booking-alert is-error" role="alert">{error}</div>}
          <button type="button" className="button-primary payment-submit-button" onClick={submit} disabled={submitting || !Number.isSafeInteger(amount) || amount <= 0 || amount > invoice.balanceDue}>{submitting ? 'Đang gửi yêu cầu…' : 'Tôi đã chuyển khoản'}</button>
        </>}
      </>}
    </section>
  </div>
}
