import { Outlet, useLocation } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'
import { usePublicNavigation } from '../../hooks/usePublicNavigation'
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme'

export function PublicLayout() {
  usePublicNavigation()
  const landing = useLocation().pathname === '/'
  const { theme, toggleTheme } = useWorkspaceTheme(landing)

  return <div className={`wdp-public min-h-screen bg-canvas text-ink${landing ? ' landing-public workspace-themed' : ''}`}
    data-workspace-theme={landing ? theme : undefined}>
    <a className="skip-link" href="#public-main">Đến nội dung chính</a>
    <Header landingTheme={landing ? { theme, toggleTheme } : undefined} />
    <main id="public-main" tabIndex={-1}><Outlet /></main>
    <Footer compact={landing} />
  </div>
}
