import { RecordIdentity } from '../../components/workspace/RecordIdentity';
import { useCustomerOnlinePayment } from './useCustomerOnlinePayment'
import { useCustomerPagination } from '../../components/customer/useCustomerPagination'
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
import { isScheduledRenewalInvoice, paymentWindowClosed } from '../../utils/payment-state'

type View = 'invoices' | 'payments' | 'submissions'

const submissionStatus: Record<PaymentSubmission['status'], string> = {
  PENDING_VERIFICATION: 'Chờ xác nhận',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Không xác nhận được',
}

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const invoiceFilter = params.get('invoice')?.trim() ?? ''
  const reservationFilter = params.get('reservation')?.trim() ?? ''
  const scoped = Boolean(invoiceFilter || reservationFilter)
  const matchesInvoice = (invoice: CustomerInvoice) => (!invoiceFilter || invoice.id === invoiceFilter || invoice.invoiceCode === invoiceFilter)
    && (!reservationFilter || invoice.reservation.id === reservationFilter || invoice.reservation.reference === reservationFilter)
  const [view, setView] = useState<View>(() => ['payments', 'submissions'].includes(params.get('view') ?? '') ? params.get('view') as View : 'invoices')
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
  const shownInvoices = (invoices.data?.items ?? []).filter(invoice => matchesInvoice(invoice) && (invoice.amountPaid > 0 || !isScheduledRenewalInvoice(invoice)))
  const invoiceIds = new Set(shownInvoices.map(invoice => invoice.id))
  const shownPayments = (payments.data?.items ?? []).filter(payment => !scoped || invoiceIds.has(payment.invoice.id))
  const shownSubmissions = (submissions.data?.items ?? []).filter(submission => !scoped || invoiceIds.has(submission.invoice.id))
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
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" description="Hóa đơn và giao dịch đã xác nhận được lấy trực tiếp từ hệ thống NestBox." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist" aria-label="Thông tin thanh toán">
      <button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button>
      <button type="button" role="tab" aria-selected={view === 'submissions'} className={view === 'submissions' ? 'is-active' : ''} onClick={() => setView('submissions')}><Wallet size={17} /> Yêu cầu xác nhận ({submissions.data?.total ?? 0})</button>
    </div>
    {feedback}
    {scoped && <p className="customer-filter-notice">Đang xem giao dịch của {reservationFilter ? 'đơn thuê được chọn' : 'hóa đơn được chọn'} · <Link to="/customer/payments">Xem tất cả</Link></p>}
    {current.status === 401 || scoped && invoices.status === 401 ? <CustomerSessionExpired /> : current.loading || scoped && invoices.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error || scoped && invoices.error ? <PortalError message={current.error || invoices.error || 'Không tải được dữ liệu thanh toán.'} onRetry={refresh} /> : view === 'invoices'
      ? <InvoiceList items={shownInvoices} submissions={shownSubmissions} onBankTransfer={setSelectedInvoice} onOnlinePay={createOnlinePayment} onlineInvoiceId={onlineInvoiceId} hasPendingOnline={hasPendingOnline} vnpayConfigured={bank.data?.vnpayConfigured === true} />
      : view === 'payments'
        ? <PaymentList items={shownPayments} />
        : <SubmissionList items={shownSubmissions} />}
    {selectedInvoice && <InvoiceTransferDialog id={selectedInvoice.id} onlinePending={hasPendingOnline} onClose={() => setSelectedInvoice(null)} onSaved={afterSubmission} />}
  </section>
}

function InvoiceList({ items, submissions, onBankTransfer, onOnlinePay, onlineInvoiceId, hasPendingOnline, vnpayConfigured }: { items: CustomerInvoice[]; submissions: PaymentSubmission[]; onBankTransfer: (invoice: CustomerInvoice) => void; onOnlinePay: (invoice: CustomerInvoice, mode: 'VNPAY' | 'VNPAYQR') => void; onlineInvoiceId: string; hasPendingOnline: boolean; vnpayConfigured: boolean }) {
  const { items: visibleItems, pagination } = useCustomerPagination(items)
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi NestBox xác nhận yêu cầu đặt kho hoặc kỳ thanh toán.</span></PortalEmpty>
  const pendingInvoiceIds = new Set(submissions.filter((submission) => submission.status === 'PENDING_VERIFICATION').map((submission) => submission.invoice.id))
  return <><div className="customer-table-wrap customer-responsive-table"><table className="customer-table"><thead><tr><th>Hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleItems.map(invoice => {
    const payable = !isScheduledRenewalInvoice(invoice) && invoice.balanceDue > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(invoice.status);
    const unsigned = invoice.signing?.complete === false;
    const expired = paymentWindowClosed(invoice);
    return <tr key={invoice.id}>
      <td data-label="Mã hóa đơn"><RecordIdentity row={invoice} resource="invoices" /><small>Lập ngày {formatPortalDate(invoice.issuedAt, true)}</small></td><td data-label="Kỳ thanh toán">{customerStatusLabel(invoice.type)}</td><td data-label="Tổng tiền">{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td data-label="Đã trả">{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td data-label="Còn lại"><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td data-label="Hạn trả">{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</td><td data-label="Trạng thái"><CustomerStatus status={invoice.status} /></td>
      <td data-label="Thao tác"><div className="payment-actions">
        <button type="button" className="button-secondary payment-table-action" onClick={() => onBankTransfer(invoice)}>{payable ? 'Chi tiết & chuyển khoản' : 'Xem hóa đơn'}</button>
        {payable && (expired ? <p>Đã hết hạn giữ kho. Nếu đã chuyển tiền, hãy gửi hỗ trợ để đối chiếu.</p> : unsigned ? <><p>Bạn cần ký tài liệu trước khi thanh toán.</p><Link className="portal-text-button" to={invoice.signing?.renewalId ? `/customer/renewals?renewal=${encodeURIComponent(invoice.signing.renewalId)}` : `/customer/contracts?reservation=${encodeURIComponent(invoice.reservation.reference)}`}>Xem và ký tài liệu</Link></> : pendingInvoiceIds.has(invoice.id) ? <span className="payment-pending-label">Đang chờ NestBox xác nhận</span> : ['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type) ? <>
          {!vnpayConfigured ? <><small>Thanh toán trực tuyến hiện chưa khả dụng. Bạn có thể xem chi tiết hóa đơn để chuyển khoản hoặc liên hệ cơ sở thanh toán trực tiếp.</small><Link className="portal-text-button" to={`/customer/support?reservation=${encodeURIComponent(invoice.reservation.id)}`}>Hỗ trợ về hóa đơn</Link></> : <><button type="button" className="button-secondary payment-table-action" disabled={!vnpayConfigured || Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => onOnlinePay(invoice, 'VNPAY')}><ExternalLink size={15} />{onlineInvoiceId === invoice.id ? 'Đang mở VNPay…' : 'Thanh toán VNPay'}</button>
          </>}
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
