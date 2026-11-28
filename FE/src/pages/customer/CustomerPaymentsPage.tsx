import { DetailRow } from '../../components/workspace/DetailRow'
import { LoadState, Facts, Modal } from '../../components/manager/PortalUi'
import { useCustomerOnlinePayment } from './useCustomerOnlinePayment'
import { useListPagination } from '../../components/workspace/useListPagination'
import { CreditCard, ExternalLink, FileText, History, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel, customerStatusLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerInvoice, CustomerPayment } from '../../types/customer'
import type { BankTransferConfig, PaymentSubmission } from '../../types/payment'
import { InvoiceTransferDialog } from '../../components/customer/InvoiceTransferDialog'
import { usePaginatedResource } from '../../services/usePaginatedResource'
import { invoicePaymentBlockedBySchedule, paymentWindowClosed } from '../../utils/payment-state'

function submissionLabel(item: PaymentSubmission) {
  if(item.reconciliation) return item.reconciliation.status==='RECONCILED'?'Đã xử lý đối soát':item.reconciliation.status==='REFUND_REQUIRED'?'Đang chờ hoàn tiền':'Khoản tiền cần đối soát'
  return submissionStatus[item.status]
}

type View = 'invoices' | 'payments' | 'submissions'
type LedgerRecord = { kind: 'payments' | 'payment-submissions'; id: string }

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const invoiceFilter = params.get('invoice')?.trim() ?? ''
  const reservationFilter = params.get('reservation')?.trim() ?? ''
  const scoped = Boolean(invoiceFilter || reservationFilter)
  const matchesInvoice = (invoice: CustomerInvoice) => (!invoiceFilter || invoice.id === invoiceFilter || invoice.invoiceCode === invoiceFilter)
    && (!reservationFilter || invoice.reservation.id === reservationFilter || invoice.reservation.reference === reservationFilter)
  const requestedView = params.get('view')
  const view: View = requestedView === 'payments' || requestedView === 'submissions' ? requestedView : 'invoices'
  const submissionFilter = params.get('submission')
  const setView = (value: View) => setParams(previous => {
    const next = new URLSearchParams(previous)
    if (value === 'invoices') next.delete('view')
    else next.set('view', value)
    if (value !== 'submissions') next.delete('submission')
    next.delete('page')
    return next
  }, { replace: true })
  const [record, setRecord] = useState<LedgerRecord | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null)
  const invoices = usePaginatedResource<CustomerInvoice>('/customer/invoices', user?.id ?? '', true)
  const payments = usePaginatedResource<CustomerPayment>('/customer/payments', user?.id ?? '', true)
  const submissions = usePaginatedResource<PaymentSubmission>('/customer/payment-submissions', user?.id ?? '', true)
  const bank = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '')
  const refreshInvoices = invoices.refresh
  const refreshPayments = payments.refresh
  const refreshSubmissions = submissions.refresh
  const refreshBank = bank.refresh
  const { createOnlinePayment, onlineInvoiceId, hasPendingOnline, feedback } = useCustomerOnlinePayment(user?.id ?? '', refreshInvoices, refreshPayments, invoices.data?.items)
  const current = view === 'invoices' ? invoices : view === 'payments' ? payments : submissions
  const shownInvoices = (invoices.data?.items ?? []).filter(invoice => matchesInvoice(invoice) && (invoice.amountPaid > 0 || !invoicePaymentBlockedBySchedule(invoice)))
  const invoiceIds = new Set(shownInvoices.map(invoice => invoice.id))
  const shownPayments = (payments.data?.items ?? []).filter(payment => !scoped || invoiceIds.has(payment.invoice.id))
  const shownSubmissions = (submissions.data?.items ?? []).filter(submission => submissionFilter ? submission.id === submissionFilter : !scoped || invoiceIds.has(submission.invoice.id))
  const refresh = () => { refreshInvoices(); refreshPayments(); refreshSubmissions(); refreshBank() }

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

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist" aria-label="Thông tin thanh toán">
      <button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'submissions'} className={view === 'submissions' ? 'is-active' : ''} onClick={() => setView('submissions')}><Wallet size={17} /> Yêu cầu xác nhận ({submissions.data?.total ?? 0})</button>
    </div>
    {feedback}
    {scoped && <p className="customer-filter-notice">Đang xem giao dịch của {reservationFilter ? 'đơn thuê được chọn' : 'hóa đơn được chọn'} · <Link to="/customer/payments">Xem tất cả</Link></p>}
    {current.status === 401 || scoped && invoices.status === 401 ? <CustomerSessionExpired /> : current.loading || scoped && invoices.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error || scoped && invoices.error ? <PortalError message={current.error || invoices.error || 'Không tải được dữ liệu thanh toán.'} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList items={shownInvoices} submissions={shownSubmissions} onView={setSelectedInvoice} paymentStateReady={Boolean(submissions.data) && !submissions.error} onOnlinePay={createOnlinePayment} onlineInvoiceId={onlineInvoiceId} hasPendingOnline={hasPendingOnline} vnpayConfigured={bank.data?.vnpayConfigured === true} />
      : view === 'payments'
        ? <PaymentList items={shownPayments} onView={id => setRecord({ kind: 'payments', id })} />
        : <SubmissionList items={shownSubmissions} onView={id => setRecord({ kind: 'payment-submissions', id })} />}
    {record && <PaymentRecordDialog key={record.kind + record.id} record={record} onClose={() => setRecord(null)} />}
    {selectedInvoice && <InvoiceTransferDialog id={selectedInvoice.id} onlinePending={hasPendingOnline} onlineBusy={Boolean(onlineInvoiceId)} onOnlinePay={(invoice) => {
      void createOnlinePayment(invoice, 'VNPAY')
      setSelectedInvoice(null)
    }} onClose={() => setSelectedInvoice(null)} onSaved={afterSubmission} />}
  </section>
}

function InvoiceList({ items, submissions, onView, onOnlinePay, onlineInvoiceId, hasPendingOnline, vnpayConfigured, paymentStateReady }: {
  items: CustomerInvoice[];
  submissions: PaymentSubmission[];
  onView: (invoice: CustomerInvoice) => void;
  onOnlinePay: (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => void;
  onlineInvoiceId: string;
  hasPendingOnline: boolean;
  vnpayConfigured: boolean;
  paymentStateReady: boolean;
}) {
  const { items: visibleItems, pagination } = useListPagination(items)
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện khi yêu cầu đặt kho được xác nhận hoặc đến kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => (submission.status === 'PENDING_VERIFICATION' || Boolean(submission.reconciliation && submission.reconciliation.status !== 'RECONCILED'))).map((submission) => submission.invoice.id))
  return <>
    <div className="customer-table-wrap customer-responsive-table"><table className="customer-table customer-invoices-table">
      <thead><tr><th>Hóa đơn</th><th>Kho</th><th>Ngày lập</th><th>Tổng tiền</th><th>Còn phải trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{visibleItems.map(invoice => {
        const payable = !invoicePaymentBlockedBySchedule(invoice) && !paymentWindowClosed(invoice)
          && invoice.signing?.complete !== false && invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status)
        const pending = pendingInvoiceIds.has(invoice.id)
        const unitCount = invoice.breakdown?.units.length || invoice.reservation.quantity
        const unitCodes = invoice.breakdown?.units.map(unit => unit.unitCode).filter(Boolean)
        return <DetailRow key={invoice.id} detail={{ open: () => onView(invoice), label: `Mở hóa đơn ${invoice.invoiceCode}` }}>
          <td data-label="Hóa đơn"><strong>{customerStatusLabel(invoice.type)}</strong><small className="customer-invoice-code">{invoice.invoiceCode}</small></td>
          <td data-label="Kho"><strong>{unitCount} kho</strong><small>{unitCodes?.length ? unitCodes.join(', ') : invoice.reservation.storageType?.name}</small></td>
          <td data-label="Ngày lập">{formatPortalDate(invoice.issuedAt)}</td>
          <td data-label="Tổng tiền" className="table-number">{moneyLabel(invoice.totalAmount, invoice.currency)}</td>
          <td data-label="Còn phải trả" className="table-number"><strong>{invoice.status === 'VOID' ? '—' : moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td>
          <td data-label="Trạng thái"><CustomerStatus status={invoice.status} />{pending && <small>Chờ đối chiếu</small>}</td>
          <td data-label="Thao tác"><div className="payment-actions">
            <button type="button" className="button-secondary payment-table-action" onClick={() => onView(invoice)}>Xem chi tiết</button>
            {payable && vnpayConfigured && paymentStateReady && !pending && invoice.type !== 'SETTLEMENT' && <button
              type="button" className="button-secondary payment-table-action"
              disabled={Boolean(onlineInvoiceId) || hasPendingOnline}
              onClick={() => onOnlinePay(invoice, 'VNPAY')}
            ><ExternalLink size={15} aria-hidden="true" />{onlineInvoiceId === invoice.id ? 'Đang mở VNPay…' : 'Thanh toán VNPay'}</button>}
          </div></td>
        </DetailRow>
      })}</tbody>
    </table></div>
    {pagination}
  </>
}

function SubmissionList({ items, onView }: { items: PaymentSubmission[]; onView: (id: string) => void }) {
  const { items: visibleItems, pagination } = useListPagination(items)
  if (!items.length) return <PortalEmpty icon={<Wallet size={30} />} title="Chưa có yêu cầu xác nhận"><span>Sau khi chuyển khoản, yêu cầu xác nhận của bạn sẽ hiển thị tại đây. Yêu cầu đang chờ chưa được tính là khoản thanh toán đã ghi nhận.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã yêu cầu</th><th>Hóa đơn</th><th>Số tiền</th><th>Mã chuyển khoản</th><th>Thời gian gửi</th><th>Trạng thái</th></tr></thead><tbody>{visibleItems.map((item) => <DetailRow key={item.id} detail={{ open: () => onView(item.id), label: `Mở yêu cầu chuyển khoản ${item.submissionCode}` }}><td data-label="Mã yêu cầu"><strong>{item.submissionCode}</strong><small>{item.isDemo ? 'Bản ghi mô phỏng có sẵn · không có tiền thật' : 'Thông báo chuyển khoản'}</small></td><td data-label="Hóa đơn">{item.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(item.amount, item.invoice.currency)}</strong></td><td data-label="Mã chuyển khoản">{item.transferReference || '—'}</td><td data-label="Thời gian gửi">{formatPortalDate(item.submittedAt, true)}</td><td data-label="Trạng thái"><span className={'payment-submission-status is-' + item.status.toLowerCase()}>{submissionLabel(item)}</span>{item.status === 'REJECTED' && item.rejectionReason && <small className="payment-rejection-reason">{item.rejectionReason}</small>}</td></DetailRow>)}</tbody></table></div>{pagination}</>
}

function PaymentList({ items, onView }: { items: CustomerPayment[]; onView: (id: string) => void }) {
  const { items: visibleItems, pagination } = useListPagination(items)
  if (!items.length) return <PortalEmpty icon={<CreditCard size={30} />} title="Chưa có giao dịch"><span>Các khoản NestBox đã xác nhận và ghi nhận sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Mã giao dịch</th><th>Hóa đơn</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th></tr></thead><tbody>{visibleItems.map(payment => <DetailRow key={payment.id} detail={{ open: () => onView(payment.id), label: `Mở giao dịch ${payment.paymentCode}` }}><td data-label="Mã giao dịch"><strong>{payment.paymentCode}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></td><td data-label="Hóa đơn">{payment.invoice.invoiceCode}</td><td data-label="Số tiền"><strong>{moneyLabel(payment.amount)}</strong></td><td data-label="Phương thức">{payment.reference?.startsWith('WDP-DEMO-') ? 'Mô phỏng · không có tiền thật' : customerStatusLabel(payment.method)}</td><td data-label="Thời gian">{formatPortalDate(payment.receivedAt, true)}</td></DetailRow>)}</tbody></table></div>{pagination}</>
}

function PaymentRecordDialog({ record, onClose }: { record: LedgerRecord; onClose: () => void }) {
  const { user } = useAuth()
  const { data, loading, error, refresh } = useApiResource<CustomerPayment | PaymentSubmission>(
    `/customer/${record.kind}/${encodeURIComponent(record.id)}`, user?.id,
  )
  const title = record.kind === 'payments' ? 'Chi tiết giao dịch' : 'Chi tiết yêu cầu chuyển khoản'
  const facts: [string, string | undefined | null][] = !data ? [] : 'paymentCode' in data ? [
    ['Mã giao dịch', data.paymentCode], ['Số tiền', moneyLabel(data.amount)],
    ['Phương thức', customerStatusLabel(data.method)], ['Thời gian ghi nhận', formatPortalDate(data.receivedAt, true)],
    ['Mã tham chiếu', data.reference], ['Ghi chú', data.note],
  ] : [
    ['Mã yêu cầu', data.submissionCode], ['Số tiền', moneyLabel(data.amount, data.invoice.currency)],
    ['Trạng thái', submissionLabel(data)], ['Ngày gửi', formatPortalDate(data.submittedAt, true)],
    ['Mã chuyển khoản', data.transferReference], ['Ghi chú', data.customerNote], [data.reconciliation ? 'Kết quả kiểm tra' : 'Lý do từ chối', data.reconciliation?.resolutionNote || data.rejectionReason],
  ]
  return <Modal title={title} onClose={onClose} footer={<button type="button" className="button-secondary" onClick={onClose}>Đóng</button>}>
    <LoadState loading={loading} error={error} retry={refresh} layout="detail" />
    {data && <><Facts items={facts.filter(([, value]) => Boolean(value))} />
      {data.invoice?.invoiceCode && <Link className="portal-text-button" to={`/customer/payments?invoice=${encodeURIComponent(data.invoice.id || data.invoice.invoiceCode)}`} onClick={onClose}>
        Hóa đơn {data.invoice.invoiceCode}
      </Link>}
    </>}
  </Modal>
}
