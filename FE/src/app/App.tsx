import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { AppRouter } from './router'
import { NotificationProvider } from '../activity/NotificationProvider'
import { ActivityProvider } from '../activity/ActivityProvider'
import { ApplicationErrorBoundary } from '../components/layout/ApplicationErrorBoundary'
import { useWorkspaceTheme } from '../hooks/useWorkspaceTheme'

export function App() {
  const { theme } = useWorkspaceTheme(true)
  const { pathname } = useLocation()
  const brandedWeb = !/^\/customer(?:\/|$)/i.test(pathname)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.workspaceTheme = theme
    // The legacy Customer portal also renders overlays outside its own layout.
    root.toggleAttribute('data-web-brand', brandedWeb)
  }, [brandedWeb, theme])

  return <ApplicationErrorBoundary><AuthProvider><ActivityProvider><NotificationProvider><AppRouter /></NotificationProvider></ActivityProvider></AuthProvider></ApplicationErrorBoundary>
}
