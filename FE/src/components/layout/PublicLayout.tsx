import { Outlet } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'
import { usePublicNavigation } from '../../hooks/usePublicNavigation'
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme'
import '../../styles/workspace-theme.css'
import '../../styles/landing.css'
import '../../styles/public-booking.css'

export function PublicLayout() {
  usePublicNavigation()
  const { theme, toggleTheme } = useWorkspaceTheme(true)

  return <div className="wdp-public public-themed workspace-themed min-h-screen" data-workspace-theme={theme}>
    <a className="skip-link" href="#public-main">Đến nội dung chính</a>
    <Header appearance={{ theme, toggleTheme }} />
    <main id="public-main" tabIndex={-1}><Outlet /></main>
    <Footer />
  </div>
}
