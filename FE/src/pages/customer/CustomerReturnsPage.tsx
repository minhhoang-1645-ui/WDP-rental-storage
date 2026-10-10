import { ClipboardCheck, RefreshCw, RotateCcw, WalletCards } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { formatPortalDate, moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { CustomerStatus, PortalEmpty, PortalError, PortalLoading, PortalPageHeader } from '../../components/customer/CustomerPortalUi'
import { ApiError, apiRequest } from '../../services/api'
import { useApiResource } from '../../services/useApiResource'
import type { CustomerDepositSettlement, CustomerRental, CustomerReturnRequest, Paginated } from '../../types/customer'

export function CustomerReturnsPage() {
  const { user } = useAuth()
  const rentals = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100', user?.id ?? '')
  const returns = useApiResource<Paginated<CustomerReturnRequest>>('/customer/returns?limit=100', user?.id ?? '', true)
  const settlements = useApiResource<Paginated<CustomerDepositSettlement>>('/customer/deposit-settlements?limit=100', user?.id ?? '', true)
  const [view, setView] = useState<'returns' | 'settlements'>('returns')
  const [today] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
  const [reservationId, setReservationId] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const activeReturnIds = new Set((returns.data?.items ?? []).filter(item => item.status !== 'COMPLETED').map(item => item.reservation.id))
  const eligibleRentals = (rentals.data?.items ?? []).filter(item => item.effectiveEndDate <= today && !activeReturnIds.has(item.reservationId))
  const current = view === 'returns' ? returns : settlements
  const refresh = () => { returns.refresh(); settlements.refresh(); rentals.refresh() }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(null); setSubmitting(true)
    try {
      await apiRequest<CustomerReturnRequest>('/customer/returns', { method: 'POST', headers: { 'Idempotency-Key': `return-${crypto.randomUUID()}` }, body: JSON.stringify({ reservationId, note: note.trim() || undefined }) })
      setMessage({ kind: 'ok', text: 'Đã gửi yêu cầu trả kho.' }); setReservationId(''); setNote(''); returns.refresh(); rentals.refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError || error instanceof Error ? error.message : 'Không thể gửi yêu cầu trả kho.' })
    } finally { setSubmitting(false) }
  }

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Kết thúc thuê" title="Trả kho và quyết toán tiền cọc" description="Gửi yêu cầu trả kho khi hết hạn, theo dõi kiểm tra hiện trạng và khoản tiền cọc." action={<button className="button-secondary" type="button" onClick={refresh} disabled={current.loading}><RefreshCw size={16} /> Làm mới</button>} />
    <div className="customer-module-layout">
      <section className="customer-panel"><div className="customer-module-tabs" role="tablist"><button type="button" role="tab" aria-selected={view === 'returns'} className={view === 'returns' ? 'is-active' : ''} onClick={() => setView('returns')}><RotateCcw size={17} /> Trả kho ({returns.data?.total ?? 0})</button><button type="button" role="tab" aria-selected={view === 'settlements'} className={view === 'settlements' ? 'is-active' : ''} onClick={() => setView('settlements')}><WalletCards size={17} /> Tiền cọc ({settlements.data?.total ?? 0})</button></div>
        {[returns.status, settlements.status, rentals.status].includes(401) ? <CustomerSessionExpired /> : current.loading ? <PortalLoading label="Đang tải dữ liệu trả kho…" /> : current.error ? <PortalError message={current.error} onRetry={refresh} /> : view === 'returns' ? <ReturnList items={returns.data?.items ?? []} /> : <SettlementList items={settlements.data?.items ?? []} />}
      </section>
      <form className="customer-panel customer-module-form" onSubmit={submit}><h2>Gửi yêu cầu trả kho</h2><p>BE chỉ chấp nhận từ ngày kết thúc hiệu lực của rental. WDP sẽ kiểm tra từng kho trước khi quyết toán tiền cọc.</p><label className="field-label">Rental đã đến hạn<select required value={reservationId} onChange={event => setReservationId(event.target.value)}><option value="">Chọn rental</option>{eligibleRentals.map(item => <option key={item.reservationId} value={item.reservationId}>{item.reservationReference} · {item.storageType.name} · hết hạn {formatPortalDate(item.effectiveEndDate)}</option>)}</select></label><label className="field-label">Ghi chú<textarea rows={4} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: đã dọn hết đồ và sẵn sàng kiểm tra" /></label>{message && <p className={`customer-form-message is-${message.kind}`} role="status">{message.text}</p>}<button className="button-primary" type="submit" disabled={submitting || !reservationId}><RotateCcw size={17} /> {submitting ? 'Đang gửi…' : 'Gửi yêu cầu trả kho'}</button>{!rentals.loading && eligibleRentals.length === 0 && <small>Hiện chưa có rental đã đến hạn và đủ điều kiện trả kho.</small>}</form>
    </div>
  </section>
}

function ReturnList({ items }: { items: CustomerReturnRequest[] }) {
  if (!items.length) return <PortalEmpty icon={<RotateCcw size={30} />} title="Chưa có yêu cầu trả kho"><span>Các yêu cầu trả kho và tiến độ kiểm tra sẽ xuất hiện tại đây.</span></PortalEmpty>
  return <div className="customer-card-list">{items.map(item => <article className="customer-record-card customer-record-card--compact" key={item.id}><div className="customer-record-heading"><div><small>{item.returnCode}</small><h2>{item.reservation.storageType.name}</h2></div><CustomerStatus status={item.status} /></div><p>{item.reservation.reference} · yêu cầu ngày {formatPortalDate(item.requestedAt, true)}</p><dl className="customer-record-facts"><div><dt>Đã kiểm tra</dt><dd>{item.inspectionSummary.passed}/{item.inspectionSummary.total}</dd></div><div><dt>Có vấn đề</dt><dd>{item.inspectionSummary.issues}</dd></div><div><dt>Quyết toán</dt><dd>{item.settlementStatus ? <CustomerStatus status={item.settlementStatus} /> : 'Chưa tạo'}</dd></div></dl><div className="customer-inspection-list" aria-label="Chi tiết kiểm tra từng kho">{item.inspections.map(inspection => <p key={inspection.id}><strong>{inspection.unit.unitCode}</strong> · {inspection.result === 'PASS' ? 'Đạt' : inspection.result === 'ISSUE_FOUND' ? 'Có vấn đề, chờ xử lý' : 'Chờ kiểm tra'}</p>)}</div>{item.note && <p>Ghi chú: {item.note}</p>}</article>)}</div>
}

function SettlementList({ items }: { items: CustomerDepositSettlement[] }) {
  if (!items.length) return <PortalEmpty icon={<ClipboardCheck size={30} />} title="Chưa có quyết toán tiền cọc"><span>Quyết toán được tạo sau khi WDP hoàn tất kiểm tra trả kho.</span></PortalEmpty>
  return <div className="customer-card-list">{items.map(item => <article className="customer-record-card customer-record-card--compact" key={item.id}><div className="customer-record-heading"><div><small>{item.settlementCode}</small><h2>{item.reservation.storageType.name}</h2></div><CustomerStatus status={item.status} /></div><p>{item.reservation.reference} · {item.returnCode}</p><dl className="customer-record-facts"><div><dt>Tiền cọc</dt><dd>{moneyLabel(item.depositAmount)}</dd></div><div><dt>Khấu trừ</dt><dd>{moneyLabel(item.deductionAmount)}</dd></div><div><dt>Hoàn lại</dt><dd>{moneyLabel(item.refundAmount)}</dd></div></dl>{item.outstandingAmount > 0 && <p className="customer-form-message is-error">Còn phải thanh toán: {moneyLabel(item.outstandingAmount)}{item.outstandingInvoice ? ` · ${item.outstandingInvoice.invoiceCode}` : ''}</p>}{item.issues.map(issue => <p key={issue.inspectionId} className="customer-inline-notice">Kho {issue.unit.unitCode}: {issue.reason || issue.approvedIssueType} · {moneyLabel(issue.approvedChargeAmount)}</p>)}</article>)}</div>
}
