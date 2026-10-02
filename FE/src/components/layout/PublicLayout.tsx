import { Outlet } from 'react-router-dom'
import { Footer } from '../public/Footer'
import { Header } from '../public/Header'
import { CatalogProvider } from '../../catalog/CatalogProvider'

export function PublicLayout() { return <div className="min-h-screen bg-canvas text-ink"><Header /><main><CatalogProvider><Outlet /></CatalogProvider></main><Footer /></div> }
