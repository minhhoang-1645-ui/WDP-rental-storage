import { ArrowRight, RefreshCw, Search, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerUnit, Paginated } from '../../types/internal'

export function ManagerUnitsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [floor, setFloor] = useState('')

  const queryParams = new URLSearchParams({ limit: '100' })
  if (search.trim()) queryParams.set('search', search.trim())
  if (status) queryParams.set('status', status)
  if (floor.trim()) queryParams.set('floor', floor.trim())

  const path = `/manager/units?${queryParams.toString()}`
  const { data, error, loading, refresh } = useApiResource<Paginated<ManagerUnit>>(path, user?.id ?? '')

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Vận hành</p>
          <h1>Kho vật lý</h1>
          <p>Tình trạng kho và khách đang thuê lấy trực tiếp từ hệ thống.</p>
        </div>
        <button className="button-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate)' }} />
          <input
            type="search"
            placeholder="Tìm mã kho (ví dụ: SM-B12, A-01)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '36px', height: '40px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ height: '40px', padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'white' }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="AVAILABLE">AVAILABLE (Trống)</option>
          <option value="RESERVED">RESERVED (Đã đặt)</option>
          <option value="OCCUPIED">OCCUPIED (Đang thuê)</option>
          <option value="MAINTENANCE">MAINTENANCE (Bảo trì)</option>
        </select>
        <input
          type="text"
          placeholder="Lọc tầng (Tầng 1, Tầng 2)…"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          style={{ height: '40px', padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: '6px', minWidth: '160px' }}
        />
      </div>

      {loading ? (
        <p role="status">Đang tải kho vật lý…</p>
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
                <th>Kho</th>
                <th>Loại</th>
                <th>Vị trí</th>
                <th>Trạng thái</th>
                <th>Khách hiện tại</th>
                <th><span className="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.unitCode}</strong>
                  </td>
                  <td>
                    {item.storageType.name}
                    <small>{item.storageType.code}</small>
                  </td>
                  <td>{[item.floor, item.zone ? `Zone ${item.zone}` : null].filter(Boolean).join(' · ') || 'Chưa cập nhật'}</td>
                  <td>
                    <span className={`manager-status is-${item.status.toLowerCase()}`}>{item.status}</span>
                  </td>
                  <td>
                    {item.allocationSummary.current ? (
                      <>
                        <strong>{item.allocationSummary.current.customer.fullName}</strong>
                        <small>
                          {item.allocationSummary.current.reservationReference} · đến {item.allocationSummary.current.endDate}
                        </small>
                      </>
                    ) : (
                      'Trống'
                    )}
                  </td>
                  <td>
                    <Link
                      className="manager-open"
                      to={`/manager/units/${encodeURIComponent(item.unitCode || item.id)}`}
                      aria-label={`Chi tiết kho ${item.unitCode}`}
                      title="Xem chi tiết phân bổ kho"
                    >
                      <ArrowRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="manager-empty">
          <Warehouse size={30} />
          <h2>Không tìm thấy kho vật lý</h2>
          <p>Không có kho nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      )}
    </section>
  )
}
