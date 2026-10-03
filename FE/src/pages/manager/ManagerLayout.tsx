import { ClipboardList, LogOut } from 'lucide-react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'

export function ManagerLayout() {
  const { user, loading, logout } = useAuth()
  if (loading) return <main className="manager-shell-loading">Đang kiểm tra quyền truy cập…</main>
  if (!user) return <Navigate to="/portal/login" replace />
  if (!['MANAGER', 'ADMIN'].includes(user.role)) return <Navigate to={user.role === 'CUSTOMER' ? '/customer' : '/staff'} replace />
  return <div className="manager-shell">
    <aside className="manager-sidebar">
      <div><span className="manager-brand">WDP</span><small>Manager Portal</small></div>
      <nav><NavLink to="/manager/inquiries"><ClipboardList size={18} /> Yêu cầu liên hệ</NavLink></nav>
      <div className="manager-account"><span>{user.fullName}</span><small>{user.role}</small><button type="button" onClick={logout}><LogOut size={16} /> Đăng xuất</button></div>
    </aside>
    <main className="manager-main"><Outlet /></main>
  </div>
}
