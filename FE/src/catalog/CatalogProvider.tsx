import type { PropsWithChildren } from 'react'
import { useApiResource } from '../services/useApiResource'
import { CatalogContext, type Catalog } from './catalog-context'
import { publicCatalog } from './public-catalog'
import { LoadingSkeleton } from '../components/LoadingSkeleton'

export function CatalogProvider({ children }: PropsWithChildren) {
  const { data: rawCatalog, loading, refreshing, error, refresh } = useApiResource<Catalog>('/booking/catalog')
  const catalog = rawCatalog && Array.isArray(rawCatalog.products) && Array.isArray(rawCatalog.sizes) ? publicCatalog(rawCatalog) : rawCatalog
  const valid = Boolean(Array.isArray(catalog?.products) && catalog.products.length && Array.isArray(catalog.sizes) && catalog.sizes.length && Array.isArray(catalog.approvedDurations) && catalog.approvedDurations.length)
  if (loading || (refreshing && !valid)) return <section className="mx-auto max-w-[1560px] px-5 sm:px-8"><LoadingSkeleton layout="catalog" label="Đang tải danh mục kho…" /></section>
  if (error || !catalog || !valid) return <section className="section-space text-center" aria-live="polite">
    <h1 className="text-2xl font-bold">Chưa tải được danh mục kho</h1>
    <p className="mt-4">Vui lòng kiểm tra kết nối rồi thử lại.</p><button className="button-primary mt-6" onClick={refresh}>Thử lại</button>
  </section>
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}
