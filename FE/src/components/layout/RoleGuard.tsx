import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { portalDestination } from '../../auth/portal-routing'
import type { PublicUser } from '../../types/booking'

export function RoleGuard({ allowedRoles }: { allowedRoles: PublicUser['role'][] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="manager-shell-loading" role="status">Đang kiểm tra quyền truy cập…</main>
  if (!user) return <Navigate to="/portal/login" replace state={{ returnTo: location.pathname + location.search }} />
  if (!allowedRoles.includes(user.role)) return <Navigate to={portalDestination(user.role)} replace />
  return <Outlet />
}
