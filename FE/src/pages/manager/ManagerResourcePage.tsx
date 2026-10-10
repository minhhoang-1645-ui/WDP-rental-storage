import { ArrowRight, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { managerOpsApi } from '../../services/manager'
import { useApiResource } from '../../services/useApiResource'

type Item = Record<string, unknown>
type Page = { page: number; limit: number; total: number; items: Item[] }

type ManagerResource =
  | 'appointments'
  | 'renewals'
  | 'invoices'
  | 'payments'
  | 'contracts'
  | 'rentals'
  | 'returns'
  | 'transfers'
  | 'maintenance'
  | 'support-requests'
  | 'deposit-settlements'

const managerResources: Record<ManagerResource, { title: string; eyebrow: string; description: string }> = {
  appointments: { title: 'Lịch bàn giao', eyebrow: 'Appointments', description: 'Lịch bàn giao do khách tạo và xác nhận bàn giao.' },
  renewals: { title: 'Gia hạn kho', eyebrow: 'Renewals', description: 'Yêu cầu gia hạn, phê duyệt và hóa đơn liên quan.' },
  invoices: { title: 'Hóa đơn', eyebrow: 'Billing', description: 'Các khoản cần thu, tiền thuê, tiền cọc và ghi nhận thanh toán.' },
  payments: { title: 'Lịch sử thanh toán', eyebrow: 'Billing', description: 'Các giao dịch thanh toán append-only đã ghi nhận.' },
  contracts: { title: 'Hợp đồng thuê', eyebrow: 'Contracts', description: 'Hợp đồng theo unit và reservation tương ứng.' },
  rentals: { title: 'Kho đang thuê', eyebrow: 'Active rentals', description: 'Trạng thái thuê, theo dõi quá hạn và rủi ro tồn kho.' },
  returns: { title: 'Trả kho', eyebrow: 'Returns', description: 'Yêu cầu trả kho và kết quả kiểm tra thực tế.' },
  transfers: { title: 'Chuyển kho', eyebrow: 'Transfers', description: 'Yêu cầu chuyển unit trong thời gian thuê.' },
  maintenance: { title: 'Bảo trì', eyebrow: 'Maintenance', description: 'Case bảo trì, phân công staff và nghiệm thu unit.' },
  'support-requests': { title: 'Hỗ trợ vận hành', eyebrow: 'Support', description: 'Yêu cầu hỗ trợ, mức độ ưu tiên và giải quyết ticket.' },
  'deposit-settlements': { title: 'Quyết toán tiền cọc', eyebrow: 'Deposit settlements', description: 'Quyết toán cọc, duyệt khấu trừ và hoàn tiền.' },
}

const resourceStatusOptions: Record<string, string[]> = {
  appointments: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  renewals: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED'],
  invoices: ['OPEN', 'PARTIALLY_PAID', 'PAID'],
  contracts: ['PENDING_PAYMENT', 'READY_FOR_HANDOVER', 'ACTIVE', 'COMPLETED'],
  rentals: ['ACTIVE', 'OVERDUE'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'PENDING_SETTLEMENT', 'COMPLETED'],
  'deposit-settlements': ['PENDING_REVIEW', 'APPROVED', 'AWAITING_OUTSTANDING_PAYMENT', 'SETTLED'],
  maintenance: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'],
  transfers: ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'],
  'support-requests': ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
}


function identifier(item: Item): string {
  const keys = [
    'appointmentCode',
    'renewalCode',
    'invoiceCode',
    'paymentCode',
    'contractCode',
    'returnCode',
    'transferCode',
    'maintenanceCode',
    'supportCode',
    'settlementCode',
    'reservationReference',
    'reference',
    'id',
  ]
  for (const k of keys) {
    if (typeof item[k] === 'string' && item[k]) return item[k] as string
  }
  return ''
}

function formatStatus(item: Item): string {
  const val = item.status || item.rentalState || item.accountStatus
  return typeof val === 'string' ? val : '—'
}

function formatVnd(val: unknown): string {
  if (typeof val === 'number') {
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ'
  }
  return ''
}

export function ManagerResourcePage() {
  const { resource = '' } = useParams()
  const config = managerResources[resource as ManagerResource]
  const { user } = useAuth()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modals for creation
  const [showMntModal, setShowMntModal] = useState(false)
  const [mntUnitId, setMntUnitId] = useState('')
  const [mntCategory, setMntCategory] = useState('UNIT_DAMAGE')
  const [mntPriority, setMntPriority] = useState('MEDIUM')
  const [mntDesc, setMntDesc] = useState('')
  const [mntSubmitting, setMntSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  const [showTrfModal, setShowTrfModal] = useState(false)
  const [trfContractId, setTrfContractId] = useState('')
  const [trfReason, setTrfReason] = useState('UNIT_ISSUE')
  const [trfSupportId, setTrfSupportId] = useState('')
  const [trfSubmitting, setTrfSubmitting] = useState(false)

  const queryParams = new URLSearchParams({ page: '1', limit: '100' })
  if (search.trim()) queryParams.set('search', search.trim())
  if (statusFilter) queryParams.set('status', statusFilter)

  const endpoint = config ? `/manager/${resource}?${queryParams.toString()}` : null
  const { data, error, loading, refresh } = useApiResource<Page>(endpoint, user?.id ?? '')

  if (!config) {
    return <div className="booking-alert is-error" role="alert">Không tìm thấy phân hệ Manager.</div>
  }

  const handleCreateMaintenance = async (e: FormEvent) => {
    e.preventDefault()
    setModalError('')
    setMntSubmitting(true)
    try {
      await managerOpsApi.createMaintenance({
        storageUnitId: mntUnitId.trim(),
        category: mntCategory,
        priority: mntPriority,
        description: mntDesc.trim(),
      })
      setShowMntModal(false)
      setMntUnitId('')
      setMntDesc('')
      refresh()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Không thể tạo yêu cầu bảo trì.')
    } finally {
      setMntSubmitting(false)
    }
  }

  const handleCreateTransfer = async (e: FormEvent) => {
    e.preventDefault()
    setModalError('')
    setTrfSubmitting(true)
    try {
      await managerOpsApi.createTransfer({
        rentalContractId: trfContractId.trim(),
        reason: trfReason,
        supportRequestId: trfSupportId.trim() || undefined,
      })
      setShowTrfModal(false)
      setTrfContractId('')
      setTrfSupportId('')
      refresh()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Không thể tạo yêu cầu chuyển kho.')
    } finally {
      setTrfSubmitting(false)
    }
  }

  return (
    <section>
      <Link className="booking-back" to="/manager">
        ← Tổng quan
      </Link>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {resource === 'maintenance' && (
            <button className="button-primary" onClick={() => { setModalError(''); setShowMntModal(true) }}>
              <Plus size={16} /> Tạo bảo trì
            </button>
          )}
          {resource === 'transfers' && (
            <button className="button-primary" onClick={() => { setModalError(''); setShowTrfModal(true) }}>
              <Plus size={16} /> Yêu cầu chuyển kho
            </button>
          )}
          <button className="button-secondary" onClick={refresh} disabled={loading}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
      </header>

      {/* Status filter pills */}
      {resourceStatusOptions[resource] && (
        <div className="manager-filter-pills">
          <button
            type="button"
            className={`manager-pill ${statusFilter === '' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('')}
          >
            Tất cả
          </button>
          {resourceStatusOptions[resource].map((st) => (
            <button
              key={st}
              type="button"
              className={`manager-pill ${statusFilter === st ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
            >
              {st}
            </button>
          ))}
        </div>
      )}

      {/* Filter toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate)' }} />
          <input
            type="search"
            placeholder="Tìm theo mã hoặc từ khóa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '36px', height: '40px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
          />
        </div>
      </div>

      {loading ? (
        <p role="status">Đang tải dữ liệu…</p>
      ) : error ? (
        <div className="booking-alert is-error" role="alert">
          {error}
          <button onClick={refresh}>Thử lại</button>
        </div>
      ) : data?.items.length ? (
        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Thông tin chính</th>
                {resource === 'invoices' && <th>Tổng / Còn nợ</th>}
                {resource === 'payments' && <th>Số tiền</th>}
                {resource === 'deposit-settlements' && <th>Cọc / Khấu trừ / Hoàn lại</th>}
                <th>Trạng thái</th>
                <th><span className="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => {
                const idCode = identifier(item) || String(index)
                const customer = (item.customer as any) || (item.reservation as any)?.customer
                const st = formatStatus(item)
                return (
                  <tr key={idCode}>
                    <td>
                      <strong>{idCode || '—'}</strong>
                      {Boolean(item.createdAt || item.scheduledAt || item.dueAt) && (
                        <small>
                          {new Date(String(item.createdAt || item.scheduledAt || item.dueAt)).toLocaleDateString('vi-VN')}
                        </small>
                      )}
                    </td>
                    <td>
                      {customer?.fullName && <strong>{customer.fullName}</strong>}
                      <small>
                        {[
                          customer?.phone,
                          (item.storageType as any)?.name,
                          (item.reservation as any)?.reference,
                          (item.storageUnit as any)?.unitNumber,
                          item.subject,
                          item.reason,
                          item.type,
                          item.category,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Không có mô tả thêm'}
                      </small>
                    </td>

                    {/* Specific columns */}
                    {resource === 'invoices' && (
                      <td>
                        <strong>{formatVnd(item.totalAmount)}</strong>
                        <small style={{ color: Number(item.balanceDue) > 0 ? '#dc2626' : '#166534' }}>
                          Nợ: {formatVnd(item.balanceDue)}
                        </small>
                      </td>
                    )}
                    {resource === 'payments' && (
                      <td>
                        <strong style={{ color: '#166534' }}>{formatVnd(item.amount)}</strong>
                        <small>{String(item.method || '')}</small>
                      </td>
                    )}
                    {resource === 'deposit-settlements' && (
                      <td>
                        <small>Cọc: {formatVnd(item.initialDepositAmount)}</small>
                        <small style={{ color: '#dc2626' }}>Trừ: {formatVnd(item.totalCharges)}</small>
                        <strong style={{ color: '#166534' }}>Hoàn: {formatVnd(item.refundAmount)}</strong>
                      </td>
                    )}

                    <td>
                      <span className={`manager-status is-${st.toLowerCase()}`}>{st}</span>
                    </td>
                    <td>
                      <Link
                        className="manager-open"
                        to={`/manager/operations/${resource}/${encodeURIComponent(idCode)}`}
                        aria-label={`Mở ${idCode}`}
                        title="Xem chi tiết & thao tác"
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="manager-empty">
          <h2>Chưa có dữ liệu</h2>
          <p>Không có bản ghi nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      )}

      {/* MODAL: TẠO CASE BẢO TRÌ */}
      {showMntModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Tạo yêu cầu bảo trì kho</h2>
              <button onClick={() => setShowMntModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            {modalError && <div className="booking-alert is-error" style={{ marginBottom: '12px' }}>{modalError}</div>}
            <form onSubmit={handleCreateMaintenance}>
              <label className="field-label">
                Mã hoặc Database ID của StorageUnit (AVAILABLE)
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: unit id hoặc mã kho trống…"
                  value={mntUnitId}
                  onChange={(e) => setMntUnitId(e.target.value)}
                />
              </label>
              <label className="field-label" style={{ marginTop: '10px' }}>
                Hạng mục sự cố
                <select value={mntCategory} onChange={(e) => setMntCategory(e.target.value)}>
                  <option value="UNIT_DAMAGE">Hư hỏng kho (UNIT_DAMAGE)</option>
                  <option value="CLEANING">Vệ sinh kho (CLEANING)</option>
                  <option value="LOCK_OR_ACCESS">Khóa / Cửa / Truy cập (LOCK_OR_ACCESS)</option>
                  <option value="FACILITY_EQUIPMENT">Thiết bị cơ sở (FACILITY_EQUIPMENT)</option>
                  <option value="OTHER">Khác (OTHER)</option>
                </select>
              </label>
              <label className="field-label" style={{ marginTop: '10px' }}>
                Mức độ ưu tiên
                <select value={mntPriority} onChange={(e) => setMntPriority(e.target.value)}>
                  <option value="LOW">LOW (Thấp)</option>
                  <option value="MEDIUM">MEDIUM (Trung bình)</option>
                  <option value="HIGH">HIGH (Khẩn cấp)</option>
                </select>
              </label>
              <label className="field-label" style={{ marginTop: '10px' }}>
                Mô tả chi tiết sự cố
                <textarea
                  rows={3}
                  required
                  placeholder="Mô tả hiện trạng hư hỏng cần bảo trì…"
                  value={mntDesc}
                  onChange={(e) => setMntDesc(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" className="button-secondary" onClick={() => setShowMntModal(false)}>Hủy</button>
                <button type="submit" className="button-primary" disabled={mntSubmitting || !mntUnitId.trim() || !mntDesc.trim()}>
                  {mntSubmitting ? 'Đang tạo…' : 'Xác nhận tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TẠO YÊU CẦU CHUYỂN KHO */}
      {showTrfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Yêu cầu chuyển kho (Transfer)</h2>
              <button onClick={() => setShowTrfModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            {modalError && <div className="booking-alert is-error" style={{ marginBottom: '12px' }}>{modalError}</div>}
            <form onSubmit={handleCreateTransfer}>
              <label className="field-label">
                Mã hoặc ID của Hợp đồng đang thuê (RentalContract ACTIVE)
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: WDP-2026-AB12CD34-C01…"
                  value={trfContractId}
                  onChange={(e) => setTrfContractId(e.target.value)}
                />
              </label>
              <label className="field-label" style={{ marginTop: '10px' }}>
                Lý do chuyển kho
                <select value={trfReason} onChange={(e) => setTrfReason(e.target.value)}>
                  <option value="UNIT_ISSUE">Sự cố kho hiện tại (UNIT_ISSUE)</option>
                  <option value="FACILITY_EQUIPMENT_FAILURE">Thiết bị cơ sở lỗi (FACILITY_EQUIPMENT_FAILURE)</option>
                  <option value="OPERATIONAL_RELOCATION">Tái bố trí vận hành (OPERATIONAL_RELOCATION)</option>
                  <option value="OTHER">Lý do khác (OTHER)</option>
                </select>
              </label>
              <label className="field-label" style={{ marginTop: '10px' }}>
                ID yêu cầu hỗ trợ (SupportRequest ID - tùy chọn)
                <input
                  type="text"
                  placeholder="Nếu chuyển do ticket hỗ trợ…"
                  value={trfSupportId}
                  onChange={(e) => setTrfSupportId(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" className="button-secondary" onClick={() => setShowTrfModal(false)}>Hủy</button>
                <button type="submit" className="button-primary" disabled={trfSubmitting || !trfContractId.trim()}>
                  {trfSubmitting ? 'Đang tạo…' : 'Gửi yêu cầu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
