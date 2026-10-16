import { Outlet } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'
import { usePublicNavigation } from '../../hooks/usePublicNavigation'

export function PublicLayout() { usePublicNavigation(); return <div className="wdp-public min-h-screen bg-canvas text-ink"><a className="skip-link" href="#public-main">Đến nội dung chính</a><Header /><main id="public-main" tabIndex={-1}><Outlet /></main><Footer /></div> }
