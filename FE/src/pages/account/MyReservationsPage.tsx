import { CalendarDays, LogOut, PackageOpen } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { useApiResource } from '../../services/useApiResource'
import type { PendingReservation } from '../../types/booking'

export function MyReservationsPage() {
  const { user, loading, logout } = useAuth()
  const { data, error, loading: fetching, refresh } = useApiResource<PendingReservation[]>(user ? '/reservations' : null, user?.id ?? '', true)
  if (!loading && !user) return <Navigate to={`/account/login?returnTo=${encodeURIComponent('/account/reservations')}`} replace />
  if (!loading && user && ['MANAGER', 'STAFF', 'ADMIN'].includes(user.role)) return <Navigate to="/manager/inquiries" replace />
  const items = data ?? []
  const pending = loading || fetching
  return <section className="section-space"><Container className="max-w-5xl">
    <div className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end"><div><p className="eyebrow">Khu vực khách hàng</p><h1 className="mt-3 text-4xl font-bold text-navy">Yêu cầu đặt kho của tôi</h1><p className="mt-3 text-slate">{user?.fullName}</p></div><div className="flex gap-3"><button className="button-secondary" type="button" disabled={pending} onClick={refresh}>Làm mới</button><button className="button-secondary" type="button" onClick={logout}><LogOut size={17} /> Đăng xuất</button></div></div>
    {pending ? <p className="mt-7" role="status">Đang tải yêu cầu đặt kho…</p> : error ? <div role="alert" className="booking-alert is-error mt-7">{error}<button type="button" onClick={refresh}>Thử lại</button></div> : items.length ? <div className="reservation-list">{items.map(item => <article key={item.id}><StorageIllustration sizeId={item.product.sizeId} /><div><div className="flex flex-wrap items-center gap-3"><span className="status-warning">Chờ xác nhận</span><span className="text-xs font-bold text-slate">{item.id}</span></div><h2>{item.product.name}</h2><p><CalendarDays size={16} /> {item.startDate} · {item.periodMode === 'duration' ? `${item.durationMonths} tháng` : `đến ${item.endDateExclusive}`} · {item.quantity} kho</p><p className="mt-2 text-sm text-slate">Chờ WDP xác nhận kho thực tế và báo giá. Chưa thanh toán, chưa có hợp đồng, chưa phân kho.</p><Link className="mt-3 inline-block font-semibold text-navy" to={'/booking/confirmation/' + item.id}>Xem chi tiết yêu cầu</Link></div></article>)}</div> : <div className="empty-reservations"><PackageOpen size={36} /><h2>Chưa có yêu cầu nào</h2><p>Reservation của bạn sẽ được lưu an toàn để tiếp tục theo dõi sau khi backend khởi động lại.</p><Link className="button-primary mt-6" to="/booking">Bắt đầu đặt kho</Link></div>}
  </Container></section>
}
