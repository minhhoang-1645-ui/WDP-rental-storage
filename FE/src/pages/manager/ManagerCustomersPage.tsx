import { ArrowRight, RefreshCw, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerCustomer, Paginated } from '../../types/internal'

export function ManagerCustomersPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')

  const queryParams = new URLSearchParams({ limit: '100' })
  if (search.trim()) queryParams.set('search', search.trim())

  const path = `/manager/customers?${queryParams.toString()}`
  const { data, error, loading, refresh } = useApiResource<Paginated<ManagerCustomer>>(path, user?.id ?? '')

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Khách hàng</p>
          <h1>Danh bạ khách hàng</h1>
          <p>Chỉ hiển thị tài khoản CUSTOMER từ API vận hành.</p>
        </div>
        <button className="button-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      {/* Search box */}
      <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate)' }} />
        <input
          type="search"
          placeholder="Tìm theo tên, email hoặc số điện thoại…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: '36px', height: '40px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
        />
      </div>

      {loading ? (
        <p role="status">Đang tải khách hàng…</p>
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
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th>Reservation</th>
                <th>Gần nhất</th>
                <th><span className="sr-only">Chi tiết</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.fullName}</strong>
                    <small>{item.accountStatus}</small>
                  </td>
                  <td>
                    {item.email}
                    <small>{item.phone || 'Chưa có số điện thoại'}</small>
                  </td>
                  <td>{item.reservationCount}</td>
                  <td>
                    {item.latestReservation ? (
                      <>
                        <strong>{item.latestReservation.reference}</strong>
                        <small>
                          {item.latestReservation.storageType.name} · {item.latestReservation.status}
                        </small>
                      </>
                    ) : (
                      'Chưa có'
                    )}
                  </td>
                  <td>
                    <Link
                      className="manager-open"
                      to={`/manager/customers/${encodeURIComponent(item.id)}`}
                      aria-label={`Chi tiết khách hàng ${item.fullName}`}
                      title="Xem chi tiết khách hàng"
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
          <Users size={30} />
          <h2>Không tìm thấy khách hàng</h2>
          <p>Không có tài khoản nào phù hợp với từ khóa tìm kiếm.</p>
        </div>
      )}
    </section>
  )
}
