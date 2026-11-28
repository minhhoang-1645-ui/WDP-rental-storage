import { Outlet, useLocation } from 'react-router-dom'
import { CatalogProvider } from '../../catalog/CatalogProvider'
import { StorageComparisonProvider } from '../public/StorageComparison'

export function CatalogRouteLayout() {
  const { pathname } = useLocation()
  return <CatalogProvider allowEmpty={pathname === '/' || pathname === '/storage' || pathname === '/facilities'}>
    <StorageComparisonProvider><Outlet /></StorageComparisonProvider>
  </CatalogProvider>
}
