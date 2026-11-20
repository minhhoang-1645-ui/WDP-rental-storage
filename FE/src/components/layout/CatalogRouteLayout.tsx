import { Outlet } from 'react-router-dom'
import { CatalogProvider } from '../../catalog/CatalogProvider'
import { StorageComparisonProvider } from '../public/StorageComparison'

export function CatalogRouteLayout() {
  return <CatalogProvider><StorageComparisonProvider><Outlet /></StorageComparisonProvider></CatalogProvider>
}
