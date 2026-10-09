import { CreditCard, FileText, History, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerInvoice, CustomerPayment, Paginated } from '../../types/customer'

export function CustomerPaymentsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<'invoices' | 'payments'>('invoices')
  const invoices = useApiResource<Paginated<CustomerInvoice>>('/customer/invoices?limit=100', user?.id ?? '', true)
  const payments = useApiResource<Paginated<CustomerPayment>>('/customer/payments?limit=100', user?.id ?? '', true)
  const current = view === 'invoices' ? invoices : payments
  const refresh = () => { invoices.refresh(); payments.refresh() }
  return <section className="customer-page">
    <PortalPageHeader eyebrow="Thanh toán" title="Hóa đơn và lịch sử thanh toán" description="Số tiền và trạng thái được lấy trực tiếp từ hệ thống WDP." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-tabs" role="tablist"><button type="button" role="tab" aria-selected={view === 'invoices'} className={view === 'invoices' ? 'is-active' : ''} onClick={() => setView('invoices')}><FileText size={17} /> Hóa đơn ({invoices.data?.total ?? 0})</button><button type="button" role="tab" aria-selected={view === 'payments'} className={view === 'payments' ? 'is-active' : ''} onClick={() => setView('payments')}><History size={17} /> Đã thanh toán ({payments.data?.total ?? 0})</button></div>
    {current.status === 401 ? <CustomerSessionExpired /> : current.loading ? <PortalLoading label="Đang tải dữ liệu thanh toán…" /> : current.error ? <PortalError message={current.error} onRetry={refresh} /> : view === 'invoices' ? <InvoiceList items={invoices.data?.items ?? []} /> : <PaymentList items={payments.data?.items ?? []} />}
  </section>
}

function InvoiceList({ items }: { items: CustomerInvoice[] }) {
  if (!items.length) return <PortalEmpty icon={<FileText size={30} />} title="Chưa có hóa đơn"><span>Hóa đơn sẽ xuất hiện sau khi WDP xác nhận reservation hoặc kỳ thanh toán.</span></PortalEmpty>
  return <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã hóa đơn</th><th>Kỳ thanh toán</th><th>Tổng tiền</th><th>Đã trả</th><th>Còn lại</th><th>Hạn trả</th><th>Trạng thái</th></tr></thead><tbody>{items.map(invoice => <tr key={invoice.id}><td><strong>{invoice.invoiceCode}</strong><small>{invoice.reservation.reference}</small></td><td>{invoice.type}</td><td>{moneyLabel(invoice.totalAmount, invoice.currency)}</td><td>{moneyLabel(invoice.amountPaid, invoice.currency)}</td><td><strong>{moneyLabel(invoice.balanceDue, invoice.currency)}</strong></td><td>{invoice.dueAt ? formatPortalDate(invoice.dueAt) : '—'}</td><td><CustomerStatus status={invoice.status} /></td></tr>)}</tbody></table></div>
}

function PaymentList({ items }: { items: CustomerPayment[] }) {
  if (!items.length) return <PortalEmpty icon={<CreditCard size={30} />} title="Chưa có giao dịch"><span>Các khoản WDP đã ghi nhận sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã giao dịch</th><th>Hóa đơn</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th></tr></thead><tbody>{items.map(payment => <tr key={payment.id}><td><strong>{payment.paymentCode}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></td><td>{payment.invoice.invoiceCode}</td><td><strong>{moneyLabel(payment.amount)}</strong></td><td>{payment.method}</td><td>{formatPortalDate(payment.receivedAt, true)}</td></tr>)}</tbody></table></div>
}
