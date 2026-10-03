import { CalendarDays, Filter, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { CustomerSessionExpired } from '../../components/customer/CustomerSessionExpired'
import { PortalEmpty, PortalError, PortalLoading, PortalPageHeader, ReservationStatus } from '../../components/customer/CustomerPortalUi'
import { formatPortalDate, quoteLabel } from '../../components/customer/CustomerPortalHelpers'
import { useApiResource } from '../../services/useApiResource'
import type { PendingReservation } from '../../types/booking'

export function CustomerReservationsPage() {
  const { user } = useAuth()
  const { data, error, status, loading, refresh } = useApiResource<PendingReservation[]>('/reservations', user?.id ?? '', true)
  const [filter, setFilter] = useState('ALL')
  const reservations = data ?? []
  const visibleItems = filter === 'ALL' ? reservations : reservations.filter((item) => item.status === filter)
  const statuses = Array.from(new Set(reservations.map((item) => item.status)))

  return <section className="customer-page">
    <PortalPageHeader eyebrow="Reservation" title="Yêu cầu đặt kho của tôi" description="Theo dõi các reservation đã gửi. Báo giá và kho thực tế cần được WDP xác nhận." action={<div className="customer-header-actions"><button className="button-secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Làm mới</button><Link className="button-primary" to="/booking"><Plus size={17} /> Đặt kho mới</Link></div>} />
    {status === 401 ? <CustomerSessionExpired /> : loading ? <PortalLoading label="Đang tải reservation…" /> : error ? <PortalError message={error} onRetry={refresh} /> : reservations.length === 0 ? <PortalEmpty title="Bạn chưa có reservation"><span>Hãy bắt đầu từ trang đặt kho. Khi bạn gửi bằng tài khoản này, reservation sẽ được hiển thị ở đây.</span><Link className="button-primary" to="/booking">Đặt kho mới</Link></PortalEmpty> : <>
      <div className="customer-filter-row"><span><Filter size={16} /> Lọc theo trạng thái</span><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Lọc theo trạng thái"><option value="ALL">Tất cả ({reservations.length})</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
      {visibleItems.length === 0 ? <PortalEmpty title="Không có reservation phù hợp"><span>Không có reservation nào khớp với bộ lọc hiện tại.</span><button className="button-secondary" type="button" onClick={() => setFilter('ALL')}>Xóa bộ lọc</button></PortalEmpty> : <><div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Mã reservation</th><th>Kho</th><th>Thời gian thuê</th><th>Ưu tiên</th><th>Báo giá</th><th>Trạng thái</th><th>Tạo lúc</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id}><td><Link className="customer-table-reference" to={`/customer/reservations/${item.id}`}>{item.id}</Link></td><td><strong>{item.product.name}</strong><small>{item.quantity} kho · {item.product.dimensions}</small></td><td><span className="customer-date"><CalendarDays size={15} /> {formatPortalDate(item.startDate)} – {formatPortalDate(item.endDateExclusive)}</span></td><td>{item.adjacencyPreference ? 'Ưu tiên liền kề' : 'Không yêu cầu'}</td><td>{quoteLabel(item.quote.grandTotal)}</td><td><ReservationStatus status={item.status} /></td><td>{formatPortalDate(item.createdAt)}</td></tr>)}</tbody></table></div><div className="customer-reservation-cards">{visibleItems.map((item) => <article key={item.id} className="customer-reservation-card"><div className="customer-card-top"><Link to={`/customer/reservations/${item.id}`}>{item.id}</Link><ReservationStatus status={item.status} /></div><h2>{item.product.name}</h2><p>{item.quantity} kho · {item.product.dimensions}</p><dl><div><dt>Thời gian thuê</dt><dd>{formatPortalDate(item.startDate)} – {formatPortalDate(item.endDateExclusive)}</dd></div><div><dt>Báo giá</dt><dd>{quoteLabel(item.quote.grandTotal)}</dd></div></dl><Link className="button-secondary" to={`/customer/reservations/${item.id}`}>Xem chi tiết</Link></article>)}</div></>}
    </>}
  </section>
}
