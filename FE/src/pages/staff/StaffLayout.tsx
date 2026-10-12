import { CalendarClock, ClipboardCheck, ClipboardList, HardHat, LogOut, RotateCcw, Warehouse, Wrench } from 'lucide-react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'

const links = [
  { to: '/staff', label: 'Tổng quan', icon: ClipboardList, end: true },
  { to: '/staff/appointments', label: 'Bàn giao', icon: CalendarClock },
  { to: '/staff/rentals', label: 'Kho đang thuê', icon: Warehouse },
  { to: '/staff/support', label: 'Yêu cầu hỗ trợ', icon: ClipboardCheck },
  { to: '/staff/maintenance', label: 'Bảo trì', icon: Wrench },
  { to: '/staff/returns', label: 'Kiểm tra trả kho', icon: RotateCcw },
  { to: '/staff/transfers', label: 'Chuyển kho', icon: HardHat },
]

export function StaffLayout() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  if (loading) return <main className="staff-shell-loading">Đang kiểm tra quyền truy cập…</main>
  if (!user) return <Navigate to={`/portal/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  if (!['STAFF', 'MANAGER', 'ADMIN'].includes(user.role)) return <Navigate to={user.role === 'CUSTOMER' ? '/customer' : '/manager/inquiries'} replace />
  return <div className="staff-shell">
    <aside className="staff-sidebar"><NavLink to="/staff" className="staff-brand"><strong>WDP</strong><small>Staff Portal</small></NavLink>
      <nav aria-label="Điều hướng nhân viên">{links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={18} />{label}</NavLink>)}</nav>
      <div className="staff-account"><span>{user.fullName}</span><small>{user.role === 'STAFF' ? 'Nhân viên' : user.role}</small><button type="button" onClick={() => { logout(); navigate('/portal/login', { replace: true }) }}><LogOut size={16} /> Đăng xuất</button></div>
    </aside>
    <main className="staff-main"><Outlet /></main>
  </div>
}
