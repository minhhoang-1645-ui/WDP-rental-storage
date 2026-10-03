import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'

export function CustomerSessionExpired() {
  const { logout } = useAuth()
  const location = useLocation()
  useEffect(() => logout(), [logout])
  return <Navigate to={`/account/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />
}
