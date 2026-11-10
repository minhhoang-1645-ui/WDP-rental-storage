import { AuthProvider } from '../auth/AuthContext'
import { AppRouter } from './router'
import { ActivityProvider } from '../activity/ActivityProvider'
import { ApplicationErrorBoundary } from '../components/layout/ApplicationErrorBoundary'

export function App() {
  return <ApplicationErrorBoundary><AuthProvider><ActivityProvider><AppRouter /></ActivityProvider></AuthProvider></ApplicationErrorBoundary>
}
