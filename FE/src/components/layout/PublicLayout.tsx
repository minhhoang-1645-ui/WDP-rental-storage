import { Outlet } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'

export function PublicLayout() { return <div className="wdp-public min-h-screen bg-canvas text-ink"><a className="skip-link" href="#public-main">Đến nội dung chính</a><Header /><main id="public-main"><Outlet /></main><Footer /></div> }
