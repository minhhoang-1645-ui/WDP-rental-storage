import { CalendarClock, ChevronLeft, CircleHelp, ClipboardList, CreditCard, FileText, LayoutDashboard, LogOut, Menu, Repeat2, UserRound, Warehouse, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { portalDestination } from '../../auth/portal-routing'

const navigation = [
  { to: '/customer', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/customer/reservations', label: 'Yêu cầu đặt kho', icon: ClipboardList },
  { to: '/customer/rentals', label: 'Kho đang thuê', icon: Warehouse },
  { to: '/customer/contracts', label: 'Hợp đồng', icon: FileText },
  { to: '/customer/payments', label: 'Thanh toán', icon: CreditCard },
  { to: '/customer/appointments', label: 'Lịch hẹn', icon: CalendarClock },
  { to: '/customer/renewals', label: 'Gia hạn', icon: Repeat2 },
  { to: '/customer/transfers', label: 'Chuyển đổi kho', icon: ChevronLeft },
  { to: '/customer/support', label: 'Hỗ trợ', icon: CircleHelp },
] as const

export function CustomerLayout() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  if (loading) return <main className="customer-shell-loading" role="status">Đang kiểm tra phiên đăng nhập…</main>
  if (!user) return <Navigate to={`/account/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== 'CUSTOMER') return <Navigate to={portalDestination(user.role)} replace />

  const signOut = () => {
    logout()
    navigate('/account/login', { replace: true })
  }

  return <div className="customer-shell">
    <aside className={menuOpen ? 'customer-sidebar is-open' : 'customer-sidebar'} aria-label="Điều hướng khu vực khách hàng">
      <div className="customer-sidebar-top">
        <NavLink to="/customer" className="customer-brand" aria-label="WDP Storage - Khu vực khách hàng"><span>WDP</span><small>Customer Portal</small></NavLink>
        <button className="customer-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><X size={20} /></button>
      </div>
      <nav className="customer-nav">
        {navigation.map((item) => {
          const Icon = item.icon
          return <NavLink key={item.to} to={item.to} end={'end' in item && item.end} onClick={() => setMenuOpen(false)} className="customer-nav-link"><Icon size={18} />{item.label}</NavLink>
        })}
      </nav>
      <div className="customer-sidebar-bottom">
        <NavLink to="/customer/profile" className="customer-account"><span className="customer-avatar"><UserRound size={18} /></span><span><strong>{user.fullName}</strong><small>{user.email}</small></span></NavLink>
        <button type="button" className="customer-logout" onClick={signOut}><LogOut size={17} /> Đăng xuất</button>
      </div>
    </aside>
    {menuOpen && <button className="customer-overlay" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main className="customer-main">
      <header className="customer-mobile-header"><button className="icon-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu size={20} /></button><span>WDP Storage</span><NavLink to="/customer/profile" aria-label="Hồ sơ"><UserRound size={20} /></NavLink></header>
      <Outlet />
    </main>
  </div>
}
