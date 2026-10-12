import { CreditCard, FileText, History, RefreshCw, Wallet, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import { customerBillingApi } from '../../services/billing'
import type { CustomerInvoice, CustomerPayment, Paginated } from '../../types/customer'
import type { BankTransferConfig, PaymentSubmission } from '../../types/payment'
import { buildVietQrPayload } from '../../utils/vietqr'

type View = 'invoices' | 'payments' | 'submissions'

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('invoices')
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null)
  const invoices = useApiResource<Paginated<CustomerInvoice>>('/customer/invoices?limit=100', user?.id ?? '', true)
  const payments = useApiResource<Paginated<CustomerPayment>>('/customer/payments?limit=100', user?.id ?? '', true)
  const submissions = useApiResource<Awaited<ReturnType<typeof customerBillingApi.submissions>>>('/customer/payment-submissions?limit=100', user?.id ?? '', true)
  const bank = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '')
  const current = view === 'invoices' ? invoices : view === 'payments' ? payments : submissions
  const refresh = () => { invoices.refresh(); payments.refresh(); submissions.refresh(); bank.refresh() }

  useEffect(() => {
    if (!submissions.data?.items.some((item) => item.status === 'PENDING_VERIFICATION')) return
    const timer = window.setInterval(() => { invoices.refresh(); payments.refresh(); submissions.refresh() }, 12000)
    return () => window.clearInterval(timer)
  }, [submissions.data, invoices.refresh, payments.refresh, submissions.refresh])

  const afterSubmission = () => {
    setSelectedInvoice(null)
    invoices.refresh()
    payments.refresh()
    submissions.refresh()
    setView('submissions')
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" description="Hóa đơn và giao dịch đã xác nhận được lấy trực tiếp từ hệ thống WDP." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist" aria-label="Thông tin thanh toán">
      <button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'submissions'} className={view === 'submissions' ? 'is-active' : ''} onClick={() => setView('submissions')}><Wallet size={17} /> Yêu cầu xác nhận ({submissions.data?.total ?? 0})</button>
    </div>
    {current.status === 401 ? <CustomerSessionExpired /> : current.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error ? <PortalError message={current.error} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList items={invoices.data?.items ?? []} submissions={submissions.data?.items ?? []} onPay={setSelectedInvoice} />
      : view === 'payments'
        ? <PaymentList items={payments.data?.items ?? []} />
        : <SubmissionList items={submissions.data?.items ?? []} />}
    {selectedInvoice && <PaymentModal invoice={selectedInvoice} bank={bank.data ?? null} bankLoading={bank.loading} bankError={bank.error} onClose={() => setSelectedInvoice(null)} onSubmitted={afterSubmission} />}
  </section>
}

function InvoiceList({ items, submissions, onPay }: { items: CustomerInvoice[]; submissions: PaymentSubmission[]; onPay: (invoice: CustomerInvoice) => void }) {
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi WDP xác nhận reservation hoặc kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => submission.status === 'PENDING_VERIFICATION').map((submission) => submission.invoice.id))
  return <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{items.map(invoice => <tr key={invoice.id}><td><strong>{invoice.invoiceCode}</strong><small>{invoice.reservation.reference}</small></td><td>{invoice.type}</td><td>{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td>{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td>{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</td><td><CustomerStatus status={invoice.status} /></td><td>{invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status) ? pendingInvoiceIds.has(invoice.id)
    ? <span className="payment-pending-label">Đang chờ WDP xác nhận</span>
    : <button type="button" className="button-primary payment-table-action" onClick={() => onPay(invoice)}><CreditCard size={15} /> Thanh toán</button> : '—'}</td></tr>)}</tbody></table></div>
}

function SubmissionList({ items }: { items: PaymentSubmission[] }) {
  if (!items.length) return <PortalEmpty icon={<Wallet size={30} />} title="Chưa có yêu cầu xác nhận"><span>Sau khi chuyển khoản, yêu cầu xác nhận của bạn sẽ hiển thị tại đây. Yêu cầu đang chờ chưa được tính là khoản thanh toán đã ghi nhận.</span></PortalEmpty>
  return <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã yêu cầu</th><th>Hóa đơn</th><th>Số tiền</th><th>Mã chuyển khoản</th><th>Thời gian gửi</th><th>Trạng thái</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.submissionCode}</strong><small>Thông báo chuyển khoản</small></td><td>{item.invoice.invoiceCode}</td><td><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></td><td>{item.transferReference || '—'}</td><td>{formatPortalDate(item.submittedAt, true)}</td><td><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{submissionStatus[item.status]}</span>{item.status === 'REJECTED' && item.rejectionReason && <small className="payment-rejection-reason">{item.rejectionReason}</small>}</td></tr>)}</tbody></table></div>
}

function PaymentList({ items }: { items: CustomerPayment[] }) {
  if (!items.length) return <PortalEmpty icon={<CreditCard size={30} />} title="Chưa có giao dịch"><span>Các khoản WDP đã xác nhận và ghi nhận sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã giao dịch</th><th>Hóa đơn</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th></tr></thead><tbody>{items.map(payment => <tr key={payment.id}><td><strong>{payment.paymentCode}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></td><td>{payment.invoice.invoiceCode}</td><td><strong>{moneyLabel(payment.amount)}</strong></td><td>{payment.method}</td><td>{formatPortalDate(payment.receivedAt, true)}</td></tr>)}</tbody></table></div>
}

function PaymentModal({ invoice, bank, bankLoading, bankError, onClose, onSubmitted }: { invoice: CustomerInvoice; bank: BankTransferConfig | null; bankLoading: boolean; bankError: string; onClose: () => void; onSubmitted: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState<PaymentSubmission | null>(null)
  const [amount, setAmount] = useState(invoice.balanceDue)
  const [transferReference, setTransferReference] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const key = useRef(`cust-transfer-${crypto.randomUUID()}`)
  const qrPayload = useMemo(() => {
    if (!bank?.configured) return ''
    try { return buildVietQrPayload(bank, amount, invoice.invoiceCode) } catch { return '' }
  }, [bank, amount, invoice.invoiceCode])

  const submit = async () => {
    if (!bank?.configured || !qrPayload || submitting || !Number.isSafeInteger(amount) || amount <= 0 || amount > invoice.balanceDue) return
    setSubmitting(true)
    setError('')
    try {
      const result = await customerBillingApi.createSubmission(invoice.id, amount, key.current, transferReference.trim(), customerNote.trim())
      setSubmission(result)
      onSubmitted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gửi được yêu cầu xác nhận thanh toán.')
    } finally { setSubmitting(false) }
  }

  return <div className="payment-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <header><div><p className="eyebrow">Chuyển khoản ngân hàng</p><h2 id="payment-modal-title">Thanh toán hóa đơn</h2></div><button type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button></header>
      {submission ? <div className="payment-submit-success" role="status"><Wallet size={25} /><strong>Đang chờ xác nhận thanh toán</strong><span>Mã yêu cầu: {submission.submissionCode}</span><button className="button-primary" type="button" onClick={onSubmitted}>Xem trạng thái yêu cầu</button></div> : <>
        <div className="payment-invoice-summary"><span>Mã hóa đơn<strong>{invoice.invoiceCode}</strong></span><span>Số dư hiện tại<strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></span></div>
        {bankLoading ? <div className="payment-config-message">Đang tải thông tin chuyển khoản…</div> : bankError ? <div className="payment-config-message is-error" role="alert">Không tải được thông tin ngân hàng: {bankError}</div> : !bank?.configured ? <div className="payment-config-message is-error" role="alert">WDP chưa cấu hình đầy đủ thông tin tài khoản nhận chuyển khoản. Vui lòng liên hệ hỗ trợ.</div> : !qrPayload ? <div className="payment-config-message is-error" role="alert">Số tiền không hợp lệ nên chưa thể tạo QR. Hãy nhập số tiền nguyên dương nhỏ hơn hoặc bằng số dư.</div> : <>
          <label className="field-label payment-amount-field">Số tiền chuyển khoản (tối đa bằng số dư)<input type="number" min={1} max={invoice.balanceDue} step={1} value={amount} onChange={(event) => { setAmount(Number(event.target.value)); key.current = `cust-transfer-${crypto.randomUUID()}` }} /><small className="field-help">Có thể thanh toán một phần. WDP xác nhận xong, số dư hóa đơn sẽ cập nhật.</small></label>
          <div className="payment-qr-wrap"><QRCodeSVG value={qrPayload} size={224} level="M" title={`QR chuyển khoản hóa đơn ${invoice.invoiceCode}`} /></div>
          <dl className="payment-bank-details"><div><dt>Ngân hàng</dt><dd>{bank.bankName}</dd></div><div><dt>Số tài khoản</dt><dd>{bank.accountNumber}</dd></div><div><dt>Chủ tài khoản</dt><dd>{bank.accountName}</dd></div><div><dt>Số tiền</dt><dd>{moneyLabel(amount, invoice.currency)}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd>{invoice.invoiceCode}</dd></div></dl>
          <p className="payment-transfer-warning">Vui lòng chuyển đúng số tiền và nội dung để WDP dễ xác nhận giao dịch.</p>
          <label className="field-label payment-amount-field">Mã giao dịch ngân hàng, nếu có<input maxLength={200} value={transferReference} onChange={(event) => { setTransferReference(event.target.value); key.current = `cust-transfer-${crypto.randomUUID()}` }} placeholder="Mã trên biên nhận chuyển khoản" /></label>
          <label className="field-label payment-amount-field">Ghi chú cho WDP, không bắt buộc<textarea rows={2} maxLength={1000} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); key.current = `cust-transfer-${crypto.randomUUID()}` }} /></label>
          {error && <div className="booking-alert is-error" role="alert">{error}</div>}
          <button type="button" className="button-primary payment-submit-button" onClick={submit} disabled={submitting || !Number.isSafeInteger(amount) || amount <= 0 || amount > invoice.balanceDue}>{submitting ? 'Đang gửi yêu cầu…' : 'Tôi đã chuyển khoản'}</button>
        </>}
      </>}
    </section>
  </div>
}
