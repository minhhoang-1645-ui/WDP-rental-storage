import { ArrowRight, ClipboardCheck, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerReservation, Paginated } from '../../types/internal'

export function ManagerReservationsPage() {
  const { user } = useAuth()
  const { data, error, loading, refresh } = useApiResource<Paginated<ManagerReservation>>(
    '/manager/reservations?limit=100',
    user?.id ?? ''
  )

  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'>('ALL')

  const items = data?.items ?? []

  const counts = {
    ALL: items.length,
    PENDING: items.filter((r) => r.status === 'PENDING').length,
    CONFIRMED: items.filter((r) => r.status === 'CONFIRMED').length,
    REJECTED: items.filter((r) => r.status === 'REJECTED').length,
    CANCELLED: items.filter((r) => r.status === 'CANCELLED').length,
  }

  const filtered = items.filter((item) => {
    if (statusTab !== 'ALL' && item.status !== statusTab) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchRef = item.reference?.toLowerCase().includes(q)
      const matchName = item.customer?.fullName?.toLowerCase().includes(q)
      const matchPhone = item.customer?.phone?.includes(q)
      const matchProd = item.product?.name?.toLowerCase().includes(q)
      if (!matchRef && !matchName && !matchPhone && !matchProd) return false
    }
    return true
  })

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Quản lý đặt kho · Phân bổ tồn kho</p>
          <h1>Yêu cầu đặt kho (Reservations)</h1>
          <p>
            Chỉ xác nhận khi backend còn đủ kho vật lý trống cho toàn bộ kỳ thuê. Transaction sẽ tự động cấp kho.
          </p>
        </div>
        <button className="button-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      {/* FILTER PILLS */}
      <div className="manager-filter-pills">
        <button
          type="button"
          className={`manager-pill ${statusTab === 'ALL' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('ALL')}
        >
          Tất cả ({counts.ALL})
        </button>
        <button
          type="button"
          className={`manager-pill ${statusTab === 'PENDING' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('PENDING')}
        >
          Chờ xử lý ({counts.PENDING})
        </button>
        <button
          type="button"
          className={`manager-pill ${statusTab === 'CONFIRMED' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('CONFIRMED')}
        >
          Đã xác nhận ({counts.CONFIRMED})
        </button>
        <button
          type="button"
          className={`manager-pill ${statusTab === 'REJECTED' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('REJECTED')}
        >
          Đã từ chối ({counts.REJECTED})
        </button>
        <button
          type="button"
          className={`manager-pill ${statusTab === 'CANCELLED' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('CANCELLED')}
        >
          Đã hủy ({counts.CANCELLED})
        </button>
      </div>

      {/* SEARCH BOX */}
      <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '20px' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-slate)',
          }}
        />
        <input
          type="search"
          placeholder="Tìm theo mã reservation, tên khách, số điện thoại…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: '36px',
            height: '40px',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
          }}
        />
      </div>

      {loading ? (
        <p role="status">Đang tải danh sách Reservation…</p>
      ) : error ? (
        <div className="booking-alert is-error" role="alert">
          {error}
          <button onClick={refresh}>Thử lại</button>
        </div>
      ) : filtered.length ? (
        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Mã yêu cầu</th>
                <th>Khách hàng</th>
                <th>Sản phẩm kho</th>
                <th>Kỳ thuê</th>
                <th>Kho vật lý gán</th>
                <th>Trạng thái</th>
                <th><span className="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.reference}</strong>
                  </td>
                  <td>
                    <strong>{item.customer.fullName}</strong>
                    <small>{item.customer.phone || item.customer.email}</small>
                  </td>
                  <td>
                    <strong>{item.product.name}</strong>
                    <small>
                      {item.quantity} kho · {item.product.code}
                    </small>
                  </td>
                  <td>
                    <span>{item.startDate}</span>
                    <small>đến {item.endDateExclusive}</small>
                  </td>
                  <td>
                    {item.allocatedUnits.length > 0 ? (
                      item.allocatedUnits.map((unit) => (
                        <span
                          key={unit.unitNumber}
                          style={{
                            display: 'inline-block',
                            marginRight: '6px',
                            background: '#eff6ff',
                            color: '#1e40af',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}
                        >
                          {unit.unitNumber}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--color-slate)' }}>Chưa phân bổ</span>
                    )}
                  </td>
                  <td>
                    <span className={`manager-status is-${item.status.toLowerCase()}`}>{item.status}</span>
                  </td>
                  <td>
                    <Link
                      className="manager-open"
                      to={`/manager/reservations/${item.id}`}
                      aria-label={`Mở ${item.reference}`}
                      title="Mở chi tiết & quyết định"
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
          <ClipboardCheck size={30} />
          <h2>Không có Reservation phù hợp</h2>
          <p>Không tìm thấy bản ghi nào theo bộ lọc hoặc từ khóa tìm kiếm.</p>
        </div>
      )}
    </section>
  )
}
