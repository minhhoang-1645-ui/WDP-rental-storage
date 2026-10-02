import type { PropsWithChildren } from 'react'
import { useApiResource } from '../services/useApiResource'
import { CatalogContext, type Catalog } from './catalog-context'

export function CatalogProvider({ children }: PropsWithChildren) {
  const { data: catalog, error, refresh } = useApiResource<Catalog>('/booking/catalog')
  const valid = Boolean(Array.isArray(catalog?.products) && catalog.products.length && Array.isArray(catalog.sizes) && catalog.sizes.length && Array.isArray(catalog.approvedDurations) && catalog.approvedDurations.length)
  if (!catalog || !valid) return <section className="section-space text-center" aria-live="polite">
    <h1 className="text-2xl font-bold">{error || catalog ? 'Chưa tải được danh mục kho' : 'Đang tải danh mục kho…'}</h1>
    {(error || catalog) && <><p className="mt-4">Vui lòng kiểm tra kết nối rồi thử lại.</p><button className="button-primary mt-6" onClick={refresh}>Thử lại</button></>}
  </section>
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}
