import { Outlet } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'

export function PublicLayout() { return <div className="min-h-screen bg-canvas text-ink"><Header /><main><Outlet /></main><Footer /></div> }
