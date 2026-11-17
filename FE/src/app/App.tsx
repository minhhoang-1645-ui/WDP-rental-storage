import { useLayoutEffect } from 'react'
import { AuthProvider } from '../auth/AuthContext'
import { AppRouter } from './router'
import { ActivityProvider } from '../activity/ActivityProvider'
import { ApplicationErrorBoundary } from '../components/layout/ApplicationErrorBoundary'
import { useWorkspaceTheme } from '../hooks/useWorkspaceTheme'

export function App() {
  const { theme } = useWorkspaceTheme(true)
  useLayoutEffect(() => {
    document.documentElement.dataset.workspaceTheme = theme
  }, [theme])

  return <ApplicationErrorBoundary><AuthProvider><ActivityProvider><AppRouter /></ActivityProvider></AuthProvider></ApplicationErrorBoundary>
}
