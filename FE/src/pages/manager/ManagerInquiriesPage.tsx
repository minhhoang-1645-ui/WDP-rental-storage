import { ArrowRight, ClipboardList, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useApiResource } from '../../services/useApiResource'
import type { ManagerInquiry, ManagerRequestStatus } from '../../types/booking'

const statusLabels: Record<ManagerRequestStatus, string> = {
  PENDING_CONTACT: 'Chờ liên hệ',
  CONTACTED: 'Đã liên hệ',
  IN_REVIEW: 'Đang xử lý',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
  PENDING: 'Chờ xử lý',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Đã từ chối',
  EXPIRED: 'Đã hết hạn',
}

type TypeFilter = 'ALL' | 'INQUIRY' | 'RESERVATION'

export function ManagerInquiriesPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeTab, setTypeTab] = useState<TypeFilter>('ALL')
  const [statusTab, setStatusTab] = useState<string>('ALL')

  const limit = 20
  const path = `/manager/inquiries?page=${page}&limit=${limit}`
  const { data, error, loading, refresh } = useApiResource<{
    page: number
    limit: number
    total: number
    items: ManagerInquiry[]
  }>(path, user?.id ?? '')

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit))

  // Step 1: filter by requestType — real values from DB, no assumption
  const byType = useMemo(
    () => {
      const items = data?.items ?? []
      return typeTab === 'ALL' ? items : items.filter((i) => i.requestType === typeTab)
    },
    [data?.items, typeTab],
  )


  // Step 2: derive status pills dynamically from the actual fetched records
  const availableStatuses = useMemo(() => {
    const seen = new Set<string>()
    for (const item of byType) seen.add(item.status)
    return [...seen].sort()
  }, [byType])

  // Step 3: apply status filter
  const byStatus = useMemo(
    () =>
      statusTab === 'ALL' || !availableStatuses.includes(statusTab)
        ? byType
        : byType.filter((i) => i.status === statusTab),
    [byType, statusTab, availableStatuses],
  )

  // Step 4: text search
  const filtered = useMemo(() => {
    if (!search.trim()) return byStatus
    const q = search.trim().toLowerCase()
    return byStatus.filter((item) => {
      const matchRef = item.reference?.toLowerCase().includes(q)
      const matchName = item.customer?.fullName?.toLowerCase().includes(q)
      const matchPhone = item.customer?.phone?.includes(q)
      const matchProd = item.product?.name?.toLowerCase().includes(q)
      return matchRef || matchName || matchPhone || matchProd
    })
  }, [byStatus, search])

  // Reset status pill when switching type tab
  const handleTypeChange = (t: TypeFilter) => {
    setTypeTab(t)
    setStatusTab('ALL')
  }

  return (
    <section>
      <header className="manager-page-header">
        <div>
          <p className="eyebrow">Tư vấn &amp; Chăm sóc khách hàng</p>
          <h1>Yêu cầu tư vấn &amp; Đặt kho</h1>
          <p>
            Tổng hợp Inquiry (tư vấn báo giá) và Reservation (đặt kho) theo thời gian thực từ cơ sở dữ liệu.
          </p>
        </div>
        <button className="button-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      {/* REQUEST TYPE TABS */}
      <div className="manager-filter-pills" style={{ marginBottom: '12px' }}>
        {(['ALL', 'INQUIRY', 'RESERVATION'] as TypeFilter[]).map((t) => {
          const allDbItems = data?.items ?? []
          const count =
            t === 'ALL'
              ? allDbItems.length
              : allDbItems.filter((i) => i.requestType === t).length

          const label =
            t === 'ALL' ? 'Tất cả loại' : t === 'INQUIRY' ? 'Tư vấn (Inquiry)' : 'Đặt kho (Reservation)'
          return (
            <button
              key={t}
              type="button"
              className={`manager-pill ${typeTab === t ? 'is-active' : ''}`}
              onClick={() => handleTypeChange(t)}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* DYNAMIC STATUS PILLS — built from actual DB records, no hardcoded list */}
      <div className="manager-filter-pills">
        <button
          type="button"
          className={`manager-pill ${statusTab === 'ALL' ? 'is-active' : ''}`}
          onClick={() => setStatusTab('ALL')}
        >
          Tất cả trạng thái ({byType.length})
        </button>
        {availableStatuses.map((st) => (
          <button
            key={st}
            type="button"
            className={`manager-pill ${statusTab === st ? 'is-active' : ''}`}
            onClick={() => setStatusTab(statusTab === st ? 'ALL' : st)}
          >
            {statusLabels[st as ManagerRequestStatus] ?? st} ({byType.filter((i) => i.status === st).length})
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '20px', marginTop: '16px' }}>
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
          placeholder="Tìm theo mã yêu cầu, tên khách, số điện thoại…"
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

      {error ? (
        <div className="booking-alert is-error" role="alert">
          {error}
          <button onClick={refresh}>Thử lại</button>
        </div>
      ) : loading ? (
        <p role="status">Đang tải yêu cầu khách hàng…</p>
      ) : filtered.length ? (
        <>
          <div className="manager-table-wrap">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Khách hàng</th>
                  <th>Kho yêu cầu</th>
                  <th>Thời gian mong muốn</th>
                  <th>Trạng thái</th>
                  <th><span className="sr-only">Chi tiết</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.reference}</strong>
                      <small>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: item.requestType === 'INQUIRY' ? '#eff6ff' : '#faf5ff',
                            color: item.requestType === 'INQUIRY' ? '#1d4ed8' : '#6d28d9',
                            marginRight: '4px',
                          }}
                        >
                          {item.requestType === 'INQUIRY' ? 'Tư vấn' : 'Đặt kho'}
                        </span>
                        {new Date(item.createdAt).toLocaleString('vi-VN')}
                      </small>
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
                      <span className={`manager-status is-${item.status.toLowerCase()}`}>
                        {statusLabels[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="manager-open"
                        to={
                          (item.requestType === 'RESERVATION' ? '/manager/reservations/' : '/manager/inquiries/') +
                          item.id
                        }
                        aria-label={`Mở ${item.id}`}
                        title="Xem chi tiết & xử lý"
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="manager-pagination">
            <span>
              Trang {page}/{totalPages} · Tổng cộng {data?.total} yêu cầu
            </span>
            <div>
              <button
                className="button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Trước
              </button>
              <button
                className="button-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Sau
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="manager-empty">
          <ClipboardList size={30} />
          <h2>Không tìm thấy yêu cầu</h2>
          <p>Không có yêu cầu nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      )}
    </section>
  )
}
