import { AuthProvider } from '../auth/AuthContext'
import { AppRouter } from './router'
import { ActivityProvider } from '../activity/ActivityProvider'

export function App() {
  return <AuthProvider><ActivityProvider><AppRouter /></ActivityProvider></AuthProvider>
}
