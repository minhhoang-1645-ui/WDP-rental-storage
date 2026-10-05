import { Outlet } from 'react-router-dom'
import { CatalogProvider } from '../../catalog/CatalogProvider'

export function CatalogRouteLayout() {
  return <CatalogProvider><Outlet /></CatalogProvider>
}
