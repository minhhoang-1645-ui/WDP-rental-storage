import { AlertCircle, ArrowRight, CalendarClock, Check, ClipboardCheck, ClipboardList, RefreshCw, RotateCcw, Search, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { formatPortalDate } from '../../components/customer/CustomerPortalHelpers'
import { useApiResource } from '../../services/useApiResource'
import { ApiError, apiRequest } from '../../services/api'
import type { StaffAppointment, StaffMaintenanceCase, StaffPage, StaffRental, StaffReturnRequest, StaffSupportRequest } from '../../types/staff'

const statusLabels: Record<string, string> = {
  REQUESTED: 'Mới gửi', CONFIRMED: 'Đã xác nhận', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  OPEN: 'Đang mở', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang xử lý', ESCALATED: 'Chờ quản lý', RESOLVED: 'Đã giải quyết',
  INSPECTION_IN_PROGRESS: 'Đang kiểm tra', ISSUE_FOUND: 'Có vấn đề', PENDING_SETTLEMENT: 'Chờ quyết toán',
  AWAITING_VERIFICATION: 'Chờ quản lý xác minh', ACTIVE: 'Đang thuê', OVERDUE: 'Quá hạn',
}
const issueTypes = [
  ['NORMAL_WEAR', 'Hao mòn thông thường'], ['FACILITY_FAULT', 'Lỗi cơ sở vật chất'], ['CUSTOMER_DAMAGE', 'Hư hỏng do khách'],
  ['CLEANING_REQUIRED', 'Cần vệ sinh'], ['LOST_KEY_OR_ACCESS_ITEM', 'Mất chìa khóa hoặc vật dụng truy cập'], ['OTHER', 'Khác'],
]
const supportResolutions = [
  ['ON_SITE_RESOLVED', 'Đã xử lý tại chỗ'], ['CUSTOMER_GUIDANCE', 'Đã hướng dẫn khách'], ['ACCESS_RESTORED', 'Đã khôi phục quyền truy cập'],
  ['PAYMENT_GUIDANCE', 'Đã hướng dẫn thanh toán'], ['NO_ACTION_REQUIRED', 'Không cần thao tác'], ['OTHER', 'Khác'],
]

function Status({ value }: { value: string }) { return <span className={`staff-status is-${value.toLowerCase()}`}>{statusLabels[value] ?? value}</span> }
function PageHeader({ eyebrow, title, description, refresh, loading }: { eyebrow: string; title: string; description: string; refresh?: () => void; loading?: boolean }) {
  return <header className="staff-page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{refresh && <button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button>}</header>
}
function ErrorOrLoading({ loading, error, refresh }: { loading: boolean; error: string; refresh: () => void }) {
  if (loading) return <div className="staff-state" role="status">Đang tải dữ liệu…</div>
  if (error) return <div className="staff-state is-error" role="alert"><AlertCircle size={20} />{error}<button className="button-secondary" onClick={refresh}>Thử lại</button></div>
  return null
}
function Empty({ children = 'Chưa có dữ liệu phù hợp.' }: { children?: ReactNode }) { return <div className="staff-state"><ClipboardList size={26} /><strong>{children}</strong></div> }
function StaffCard({ children }: { children: ReactNode }) { return <article className="staff-card">{children}</article> }
function Facts({ items }: { items: Array<[string, ReactNode]> }) { return <dl className="staff-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> }
function ActionNotice({ notice }: { notice: { kind: 'ok' | 'error'; text: string } | null }) { return notice ? <p className={`staff-notice is-${notice.kind}`} role="status">{notice.text}</p> : null }
function keyFor(prefix: string) { return `${prefix}-${crypto.randomUUID()}` }
function errorText(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : 'Thao tác chưa hoàn tất.' }

export function StaffDashboardPage() {
  const { user } = useAuth()
  const appts = useApiResource<StaffPage<StaffAppointment>>('/staff/appointments?limit=100', user?.id ?? '', true)
  const supports = useApiResource<StaffPage<StaffSupportRequest>>('/staff/support-requests?limit=100&assignedToMe=true', user?.id ?? '', true)
  const maintenance = useApiResource<StaffPage<StaffMaintenanceCase>>('/staff/maintenance?limit=100&assignedToMe=true', user?.id ?? '', true)
  const returns = useApiResource<StaffPage<StaffReturnRequest>>('/staff/returns?limit=100', user?.id ?? '', true)
  const refresh = () => { appts.refresh(); supports.refresh(); maintenance.refresh(); returns.refresh() }
  const cards = [
    { title: 'Lịch bàn giao', count: appts.data?.items.filter(item => item.status === 'CONFIRMED').length ?? '—', caption: 'Đã xác nhận, chờ bàn giao', icon: CalendarClock, to: '/staff/appointments' },
    { title: 'Hỗ trợ được giao', count: supports.data?.total ?? '—', caption: 'Yêu cầu thuộc nhân viên', icon: ClipboardCheck, to: '/staff/support' },
    { title: 'Công việc bảo trì', count: maintenance.data?.total ?? '—', caption: 'Case bảo trì được giao', icon: Wrench, to: '/staff/maintenance' },
    { title: 'Yêu cầu trả kho', count: returns.data?.items.filter(item => !['COMPLETED', 'PENDING_SETTLEMENT'].includes(item.status)).length ?? '—', caption: 'Đang chờ kiểm tra', icon: RotateCcw, to: '/staff/returns' },
  ]
  const loading = appts.loading || supports.loading || maintenance.loading || returns.loading
  const error = [appts, supports, maintenance, returns].find(item => item.status === 401)?.error ?? [appts, supports, maintenance, returns].find(item => item.error)?.error ?? ''
  return <section><PageHeader eyebrow="Vận hành" title="Tổng quan nhân viên" description="Theo dõi bàn giao, yêu cầu hỗ trợ, bảo trì và trả kho." refresh={refresh} loading={loading} />
    <ErrorOrLoading loading={loading && !appts.data} error={error} refresh={refresh} />
    <div className="staff-overview-grid">{cards.map(({ title, count, caption, icon: Icon, to }) => <Link className="staff-overview-card" to={to} key={title}><span><Icon size={20} /></span><small>{title}</small><strong>{count}</strong><p>{caption}</p><ArrowRight size={16} /></Link>)}</div>
    <div className="staff-panel staff-transfer-hint"><h2>Quy trình chuyển kho</h2><p>Hiện BE có thao tác hoàn tất chuyển kho theo mã lệnh, nhưng chưa có API danh sách/chi tiết lệnh để Staff tra cứu. Xem phần Chuyển kho để biết API cần bổ sung.</p><Link to="/staff/transfers">Chi tiết giới hạn API <ArrowRight size={16} /></Link></div>
  </section>
}

export function StaffAppointmentsPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')
  const [search, setSearch] = useState('')
  const path = `/staff/appointments?limit=100${status ? `&status=${status}` : ''}${date ? `&date=${date}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`
  const resource = useApiResource<StaffPage<StaffAppointment>>(path, user?.id ?? '', true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const complete = async (appointment: StaffAppointment) => {
    setBusy(appointment.id); setNotice(null)
    try { await apiRequest(`/staff/appointments/${encodeURIComponent(appointment.id)}/complete-handover`, { method: 'POST', body: JSON.stringify({ note: notes[appointment.id]?.trim() || undefined }) }); setNotice({ kind: 'ok', text: `Đã hoàn tất bàn giao ${appointment.appointmentCode}.` }); resource.refresh() }
    catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } finally { setBusy('') }
  }
  return <section><PageHeader eyebrow="Bàn giao" title="Lịch bàn giao kho" description="Kiểm tra hợp đồng và tình trạng kho trước khi xác nhận đã bàn giao cho khách." refresh={resource.refresh} loading={resource.loading} />
    <div className="staff-filter-bar"><label className="field-label">Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả</option><option value="REQUESTED">Mới gửi</option><option value="CONFIRMED">Đã xác nhận</option><option value="COMPLETED">Hoàn tất</option><option value="CANCELLED">Đã hủy</option></select></label><label className="field-label">Ngày bàn giao<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="field-label staff-search"><span>Tìm mã lịch hoặc khách</span><div><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã lịch, reservation, tên khách" /></div></label></div>
    <ActionNotice notice={notice} />
    <ErrorOrLoading loading={resource.loading} error={resource.error} refresh={resource.refresh} />
    {!resource.loading && !resource.error && !(resource.data?.items.length) ? <Empty>Chưa có lịch bàn giao.</Empty> : <div className="staff-card-list">{resource.data?.items.map(item => <StaffCard key={item.id}><div className="staff-card-heading"><div><small>{item.appointmentCode}</small><h2>{item.reservation.customer?.fullName ?? 'Khách hàng'} · {item.reservation.reference}</h2></div><Status value={item.status} /></div><Facts items={[
      ['Thời gian', formatPortalDate(item.scheduledAt, true)], ['Liên hệ', item.reservation.customer?.phone || item.reservation.customer?.email || '—'], ['Kho bàn giao', item.allocatedUnits.map(unit => unit.unitCode).join(', ') || 'Chưa phân kho'],
    ]} />{item.note && <p className="staff-muted">Ghi chú lịch: {item.note}</p>}<div className="staff-unit-list">{item.allocatedUnits.map(unit => <span key={unit.contractCode}><strong>{unit.unitCode}</strong> · {unit.contractCode} · {unit.unitStatus} / {unit.contractStatus}</span>)}</div>{item.status === 'CONFIRMED' && <div className="staff-action-row"><label className="field-label">Ghi chú bàn giao (không bắt buộc)<input value={notes[item.id] ?? ''} maxLength={2000} onChange={e => setNotes(value => ({ ...value, [item.id]: e.target.value }))} placeholder="Xác nhận tình trạng và vật dụng đã bàn giao" /></label><button className="button-primary" disabled={busy === item.id} onClick={() => complete(item)}><Check size={16} />{busy === item.id ? 'Đang lưu…' : 'Hoàn tất bàn giao'}</button></div>}</StaffCard>)}</div>}
  </section>
}

export function StaffRentalsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [overdue, setOverdue] = useState('')
  const [submitted, setSubmitted] = useState({ search: '', overdue: '' })
  const path = `/staff/rentals?limit=100${submitted.search ? `&search=${encodeURIComponent(submitted.search)}` : ''}${submitted.overdue ? `&overdue=${submitted.overdue}` : ''}`
  const resource = useApiResource<StaffPage<StaffRental>>(path, user?.id ?? '', true)
  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted({ search, overdue }) }
  return <section><PageHeader eyebrow="Vận hành" title="Kho đang thuê" description="Tra cứu khách thuê, vị trí kho, ngày hết hạn và nguy cơ trùng phân bổ." refresh={resource.refresh} loading={resource.loading} />
    <form className="staff-filter-bar" onSubmit={submit}><label className="field-label staff-search"><span>Tìm kiếm</span><div><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã reservation, khách, mã kho" /></div></label><label className="field-label">Tình trạng<select value={overdue} onChange={e => setOverdue(e.target.value)}><option value="">Tất cả rental</option><option value="true">Quá hạn</option><option value="false">Còn hạn</option></select></label><button className="button-primary" type="submit"><Search size={16} /> Tìm</button></form>
    <ErrorOrLoading loading={resource.loading} error={resource.error} refresh={resource.refresh} />
    {!resource.loading && !resource.error && !resource.data?.items.length ? <Empty>Không tìm thấy rental phù hợp.</Empty> : <div className="staff-card-list">{resource.data?.items.map(item => <StaffCard key={item.reservationId}><div className="staff-card-heading"><div><small>{item.reservationReference} · {item.storageType.name}</small><h2>{item.customer.fullName}</h2></div><Status value={item.rentalState} /></div><Facts items={[
      ['Liên hệ', item.customer.phone || item.customer.email || '—'], ['Số kho', item.unitCount], ['Ngày kết thúc hiệu lực', formatPortalDate(item.effectiveEndDate)], ['Gia hạn chờ xử lý', item.pendingRenewal?.renewalCode ?? 'Không'], ['Hóa đơn chưa thanh toán', item.billingReadiness.hasUnpaidInvoices ? 'Có' : 'Không'], ['Phân bổ tương lai', item.futureAllocationRisk.hasFutureAllocation ? 'Có' : 'Không'],
    ]} />{item.futureAllocationRisk.hasCurrentAllocationConflict && <p className="staff-notice is-error">Rental quá hạn đang ảnh hưởng đến lịch phân bổ kho tiếp theo. Báo quản lý xử lý.</p>}<div className="staff-unit-list">{item.contracts.map(contract => <span key={contract.id}><strong>{contract.unit.unitCode}</strong> · {contract.contractCode} · {contract.unit.floor ?? '—'} / {contract.unit.zone ?? '—'} · {contract.unit.status}{contract.unit.nextConfirmedAllocation ? ` · sắp phân bổ ${contract.unit.nextConfirmedAllocation.startDate} cho ${contract.unit.nextConfirmedAllocation.reservationReference}` : ''}</span>)}</div></StaffCard>)}</div>}
  </section>
}

export function StaffSupportPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [resolution, setResolution] = useState('CUSTOMER_GUIDANCE')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const path = `/staff/support-requests?limit=100&assignedToMe=true${status ? `&status=${status}` : ''}`
  const resource = useApiResource<StaffPage<StaffSupportRequest>>(path, user?.id ?? '', true)
  const act = async (item: StaffSupportRequest, action: 'start' | 'resolve' | 'escalate') => {
    setBusy(`${item.id}-${action}`); setNotice(null)
    try {
      const body = action === 'resolve' ? { resolutionType: resolution, resolutionNote: notes[item.id]?.trim() } : action === 'escalate' ? { reason: notes[item.id]?.trim() } : undefined
      if (action !== 'start' && (!body || Object.values(body).some(value => typeof value === 'string' && value.length < 3))) throw new Error(action === 'resolve' ? 'Nhập kết quả xử lý tối thiểu 3 ký tự.' : 'Nhập lý do chuyển quản lý tối thiểu 3 ký tự.')
      await apiRequest(`/staff/support-requests/${encodeURIComponent(item.id)}/${action}`, { method: 'POST', headers: { 'Idempotency-Key': keyFor(`support-${action}`) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      setNotice({ kind: 'ok', text: 'Đã cập nhật yêu cầu hỗ trợ.' }); resource.refresh()
    } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } finally { setBusy('') }
  }
  return <section><PageHeader eyebrow="Chăm sóc khách hàng" title="Yêu cầu hỗ trợ được giao" description="Xử lý yêu cầu của khách; chuyển Manager các trường hợp cần phê duyệt hoặc đổi kho." refresh={resource.refresh} loading={resource.loading} />
    <div className="staff-filter-bar"><label className="field-label">Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{['ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'].map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><p className="staff-muted">Danh sách chỉ gồm yêu cầu đang giao cho tài khoản của bạn.</p></div><ActionNotice notice={notice} /><ErrorOrLoading loading={resource.loading} error={resource.error} refresh={resource.refresh} />
    {!resource.loading && !resource.error && !resource.data?.items.length ? <Empty>Chưa có yêu cầu được giao cho bạn.</Empty> : <div className="staff-card-list">{resource.data?.items.map(item => <StaffCard key={item.id}><div className="staff-card-heading"><div><small>{item.supportCode} · {item.category} · Ưu tiên {item.priority}</small><h2>{item.subject}</h2></div><Status value={item.status} /></div><p>{item.customer.fullName} · {item.customer.phone || item.customer.email || 'Không có thông tin liên hệ'}</p><p>{item.reservation.reference}{item.unit ? ` · Kho ${item.unit.unitCode}` : ''}{item.invoice ? ` · Hóa đơn ${item.invoice.invoiceCode}` : ''}</p><p className="staff-description">{item.description}</p>{item.escalationReason && <p className="staff-notice">Lý do chuyển quản lý: {item.escalationReason}</p>}{item.resolutionNote && <p className="staff-notice is-ok">Kết quả: {item.resolutionNote}</p>}
      {item.status === 'ASSIGNED' && <button className="button-primary" disabled={busy === `${item.id}-start`} onClick={() => act(item, 'start')}>Bắt đầu xử lý</button>}
      {item.status === 'IN_PROGRESS' && <div className="staff-action-form"><label className="field-label">Kết quả<select value={resolution} onChange={e => setResolution(e.target.value)}>{supportResolutions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Ghi chú / lý do chuyển quản lý<textarea rows={3} maxLength={4000} value={notes[item.id] ?? ''} onChange={e => setNotes(value => ({ ...value, [item.id]: e.target.value }))} placeholder="Mô tả thao tác đã làm, hoặc vì sao cần Manager hỗ trợ" /></label><div className="staff-button-row"><button className="button-primary" disabled={Boolean(busy)} onClick={() => act(item, 'resolve')}>Hoàn tất xử lý</button><button className="button-secondary" disabled={Boolean(busy)} onClick={() => act(item, 'escalate')}>Chuyển Manager</button></div></div>}
    </StaffCard>)}</div>}
  </section>
}

export function StaffMaintenancePage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState('')
  const [workNotes, setWorkNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const path = `/staff/maintenance?limit=100&assignedToMe=true${filter ? `&status=${filter}` : ''}`
  const resource = useApiResource<StaffPage<StaffMaintenanceCase>>(path, user?.id ?? '', true)
  const act = async (item: StaffMaintenanceCase, action: 'start' | 'complete-work') => {
    setBusy(item.id); setNotice(null)
    try {
      const note = workNotes[item.id]?.trim()
      if (action === 'complete-work' && (!note || note.length < 3)) throw new Error('Ghi mô tả công việc đã thực hiện (tối thiểu 3 ký tự).')
      await apiRequest(`/staff/maintenance/${encodeURIComponent(item.id)}/${action}`, { method: 'POST', headers: { 'Idempotency-Key': keyFor(`maintenance-${action}`) }, ...(action === 'complete-work' ? { body: JSON.stringify({ workNote: note }) } : {}) })
      setNotice({ kind: 'ok', text: action === 'start' ? 'Đã bắt đầu bảo trì.' : 'Đã gửi công việc để Manager xác minh.' }); resource.refresh()
    } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } finally { setBusy('') }
  }
  return <section><PageHeader eyebrow="Vận hành kho" title="Bảo trì được giao" description="Cập nhật tiến độ các case bảo trì; kho chỉ được mở lại sau khi Manager xác minh." refresh={resource.refresh} loading={resource.loading} />
    <div className="staff-filter-bar"><label className="field-label">Trạng thái<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tất cả</option>{['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'].map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><p className="staff-muted">Chỉ Staff được giao mới bắt đầu và gửi hoàn tất công việc.</p></div><ActionNotice notice={notice} /><ErrorOrLoading loading={resource.loading} error={resource.error} refresh={resource.refresh} />
    {!resource.loading && !resource.error && !resource.data?.items.length ? <Empty>Chưa có case bảo trì được giao.</Empty> : <div className="staff-card-list">{resource.data?.items.map(item => { const assignedToMe = item.assignedStaff?.id === user?.id; return <StaffCard key={item.id}><div className="staff-card-heading"><div><small>{item.maintenanceCode} · {item.category} · Ưu tiên {item.priority}</small><h2>{item.unit.unitCode} · {item.unit.storageType.name}</h2></div><Status value={item.status} /></div><p>{item.unit.floor ?? '—'} / {item.unit.zone ?? '—'} · {item.unit.status}</p><p className="staff-description">{item.description}</p><p className="staff-muted">Giao cho: {item.assignedStaff?.fullName ?? 'Chưa giao nhân viên'}</p>{item.workNote && <p className="staff-notice is-ok">Ghi chú công việc: {item.workNote}</p>}{item.status === 'OPEN' && assignedToMe && <button className="button-primary" disabled={busy === item.id} onClick={() => act(item, 'start')}>Bắt đầu bảo trì</button>}{item.status === 'IN_PROGRESS' && assignedToMe && <div className="staff-action-form"><label className="field-label">Công việc đã thực hiện<textarea rows={3} maxLength={4000} value={workNotes[item.id] ?? ''} onChange={e => setWorkNotes(value => ({ ...value, [item.id]: e.target.value }))} /></label><button className="button-primary" disabled={busy === item.id} onClick={() => act(item, 'complete-work')}>Gửi Manager xác minh</button></div>}{['OPEN', 'IN_PROGRESS'].includes(item.status) && !assignedToMe && <p className="staff-muted">Chờ Manager giao case cho đúng nhân viên trước khi thao tác.</p>}</StaffCard> })}</div>}
    <p className="staff-api-note">Báo maintenance mới cần chọn kho AVAILABLE; BE chưa có API danh sách kho trống dành cho Staff nên biểu mẫu tạo mới chưa thể chọn đúng kho.</p>
  </section>
}

export function StaffReturnsPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { result: string; issueType: string; conditionNote: string; issueNote: string }>>({})
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const path = `/staff/returns?limit=100${filter ? `&status=${filter}` : ''}`
  const resource = useApiResource<StaffPage<StaffReturnRequest>>(path, user?.id ?? '', true)
  const draftFor = (item: StaffReturnRequest, inspectionId: string) => {
    const inspection = item.inspections.find(i => i.id === inspectionId)
    return drafts[inspectionId] ?? { result: inspection?.result ?? 'PENDING', issueType: inspection?.issueType ?? 'OTHER', conditionNote: inspection?.conditionNote ?? '', issueNote: inspection?.issueNote ?? '' }
  }
  const mutate = async (returnId: string, action: 'start-inspection' | 'finalize', inspectionId?: string) => {
    const key = inspectionId ?? returnId; setBusy(key); setNotice(null)
    try { await apiRequest(`/staff/returns/${encodeURIComponent(returnId)}/${action}`, { method: 'POST' }); setNotice({ kind: 'ok', text: action === 'finalize' ? 'Đã hoàn tất trả kho vật lý và tạo bước quyết toán.' : 'Đã bắt đầu kiểm tra.' }); resource.refresh() }
    catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } finally { setBusy('') }
  }
  const saveInspection = async (item: StaffReturnRequest, inspectionId: string) => {
    const draft = draftFor(item, inspectionId); setBusy(inspectionId); setNotice(null)
    try {
      if (draft.result === 'PENDING') throw new Error('Chọn PASS hoặc ISSUE_FOUND trước khi lưu.')
      await apiRequest(`/staff/returns/${encodeURIComponent(item.id)}/inspections/${encodeURIComponent(inspectionId)}`, { method: 'PATCH', body: JSON.stringify({ result: draft.result, issueType: draft.result === 'ISSUE_FOUND' ? draft.issueType : undefined, conditionNote: draft.conditionNote || undefined, issueNote: draft.result === 'ISSUE_FOUND' ? draft.issueNote || undefined : undefined }) })
      setNotice({ kind: 'ok', text: 'Đã lưu kết quả kiểm tra kho.' }); resource.refresh()
    } catch (error) { setNotice({ kind: 'error', text: errorText(error) }) } finally { setBusy('') }
  }
  return <section><PageHeader eyebrow="Trả kho" title="Kiểm tra kho hoàn trả" description="Ghi nhận từng kho trước khi hoàn tất trả vật lý; vấn đề phát sinh sẽ được chuyển Manager quyết toán." refresh={resource.refresh} loading={resource.loading} />
    <div className="staff-filter-bar"><label className="field-label">Trạng thái<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Đang mở và đã hoàn tất</option>{['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'PENDING_SETTLEMENT', 'COMPLETED'].map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><p className="staff-muted">Hoàn tất chỉ khả dụng sau khi ghi kết quả cho toàn bộ kho.</p></div><ActionNotice notice={notice} /><ErrorOrLoading loading={resource.loading} error={resource.error} refresh={resource.refresh} />
    {!resource.loading && !resource.error && !resource.data?.items.length ? <Empty>Chưa có yêu cầu trả kho.</Empty> : <div className="staff-card-list">{resource.data?.items.map(item => <StaffCard key={item.id}><div className="staff-card-heading"><div><small>{item.returnCode} · {item.reservation.reference}</small><h2>{item.reservation.customer?.fullName ?? item.reservation.storageType.name}</h2></div><Status value={item.status} /></div><p>{item.reservation.customer?.phone ?? item.reservation.customer?.email ?? ''} · Gửi {formatPortalDate(item.requestedAt, true)}</p>{item.note && <p className="staff-muted">Ghi chú khách: {item.note}</p>}
      {item.status === 'REQUESTED' && <button className="button-primary" disabled={busy === item.id} onClick={() => mutate(item.id, 'start-inspection')}>Bắt đầu kiểm tra</button>}
      <div className="staff-inspection-list">{item.inspections.map(inspection => { const draft = draftFor(item, inspection.id); const editable = ['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(item.status); return <div className="staff-inspection" key={inspection.id}><div className="staff-card-heading"><div><strong>{inspection.unit.unitCode}</strong><small>{inspection.contract.contractCode} · {inspection.unit.floor ?? '—'} / {inspection.unit.zone ?? '—'}</small></div><Status value={inspection.result} /></div>{editable && <div className="staff-action-form"><label className="field-label">Kết quả<select disabled={inspection.result === 'ISSUE_FOUND'} value={draft.result} onChange={e => setDrafts(value => ({ ...value, [inspection.id]: { ...draft, result: e.target.value } }))}><option value="PENDING">Chọn kết quả</option><option value="PASS">Đạt</option><option value="ISSUE_FOUND">Có vấn đề</option></select></label>{draft.result === 'ISSUE_FOUND' && <><label className="field-label">Loại vấn đề<select value={draft.issueType} onChange={e => setDrafts(value => ({ ...value, [inspection.id]: { ...draft, issueType: e.target.value } }))}>{issueTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Mô tả vấn đề<textarea rows={2} maxLength={4000} value={draft.issueNote} onChange={e => setDrafts(value => ({ ...value, [inspection.id]: { ...draft, issueNote: e.target.value } }))} /></label></>}<label className="field-label">Ghi chú hiện trạng<textarea rows={2} maxLength={2000} value={draft.conditionNote} onChange={e => setDrafts(value => ({ ...value, [inspection.id]: { ...draft, conditionNote: e.target.value } }))} /></label><button className="button-secondary" disabled={busy === inspection.id} onClick={() => saveInspection(item, inspection.id)}>Lưu kết quả kho</button></div>}{!editable && <><p>{inspection.conditionNote || (inspection.result === 'PENDING' ? 'Chưa kiểm tra.' : 'Không có ghi chú hiện trạng.')}</p>{inspection.issueNote && <p className="staff-notice">{inspection.issueNote}</p>}</>}</div> })}</div>
      {['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(item.status) && item.inspections.every(inspection => inspection.result !== 'PENDING') && <button className="button-primary" disabled={busy === item.id} onClick={() => mutate(item.id, 'finalize')}>Hoàn tất trả kho vật lý</button>}
    </StaffCard>)}</div>}
  </section>
}

export function StaffTransfersPage() {
  return <section><PageHeader eyebrow="Chuyển kho" title="Hoàn tất lệnh chuyển kho" description="Thao tác chuyển kho vật lý chỉ thực hiện sau khi Manager đã duyệt lệnh." />
    <div className="staff-panel"><h2>BE hiện chưa có API tra cứu lệnh chuyển kho</h2><p>Staff hiện chỉ có API <code>POST /api/staff/transfers/:id/complete</code>. Chưa có danh sách lệnh, chi tiết lệnh hoặc API tìm mã lệnh, nên FE chưa thể hiển thị danh sách để chọn an toàn.</p><p>Đề nghị BE bổ sung <code>GET /api/staff/transfers</code> và <code>GET /api/staff/transfers/:id</code>, trả trạng thái, kho nguồn/đích, reservation, hợp đồng và điều kiện có thể hoàn tất.</p></div>
  </section>
}
