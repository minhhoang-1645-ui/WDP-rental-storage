import { CalendarDays, LogOut, PackageOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { StorageIllustration } from '../../components/booking/StorageIllustration'
import { Container } from '../../components/ui/Container'
import { bookingApi } from '../../services/booking'
import type { PendingReservation } from '../../types/booking'

export function MyReservationsPage() {
  const { user, loading, logout } = useAuth()
  const [items, setItems] = useState<PendingReservation[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (user) bookingApi.list().then(setItems).catch((caught) => setError(caught instanceof Error ? caught.message : 'Không thể tải yêu cầu.'))
  }, [user])
  if (!loading && !user) return <Navigate to={`/account/login?returnTo=${encodeURIComponent('/account/reservations')}`} replace />

  return <section className="section-space"><Container className="max-w-5xl">
    <div className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end"><div><p className="eyebrow">Khu vực khách hàng</p><h1 className="mt-3 text-4xl font-bold text-navy">Yêu cầu đặt kho của tôi</h1><p className="mt-3 text-slate">{user?.fullName}</p></div><button className="button-secondary" type="button" onClick={logout}><LogOut size={17} /> Đăng xuất</button></div>
    {error && <div className="booking-alert is-error mt-7">{error}</div>}
    {items.length ? <div className="reservation-list">{items.map((item) => <article key={item.id}><StorageIllustration sizeId={item.product.sizeId} /><div><div className="flex flex-wrap items-center gap-3"><span className="status-warning">PENDING</span><span className="text-xs font-bold text-slate">{item.id}</span></div><h2>{item.product.name}</h2><p><CalendarDays size={16} /> {item.startDate} · {item.durationMonths} tháng · {item.quantity} kho</p><p className="mt-2 text-sm text-slate">Chờ WDP xác nhận kho thực tế và báo giá. Chưa thanh toán, chưa có hợp đồng, chưa phân kho.</p></div></article>)}</div> : !error && <div className="empty-reservations"><PackageOpen size={36} /><h2>Chưa có yêu cầu nào trong phiên này</h2><p>Các yêu cầu demo sẽ mất khi backend khởi động lại.</p><Link className="button-primary mt-6" to="/booking">Bắt đầu đặt kho</Link></div>}
  </Container></section>
}

