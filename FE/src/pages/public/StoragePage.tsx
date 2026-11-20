import { SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageListingCard } from '../../components/public/StorageListingCard'
import { Container } from '../../components/ui/Container'
import { useApiResource } from '../../services/useApiResource'
import type { StorageCondition, StorageSizeId, StorageListing } from '../../types/storage'
import { isFixtureProduct } from '../../catalog/public-catalog'
import { LoadingSkeleton } from '../../components/LoadingSkeleton'

interface SearchResult { items: StorageListing[]; checkedPeriod: boolean; total: number }

export function StoragePage() {
  const [params] = useSearchParams()
  const query = params.toString()
  const size = (params.get('size') ?? 'all') as StorageSizeId | 'all'
  const type = (params.get('type') ?? 'all') as StorageCondition | 'all'
  const { data: current, error, loading: pending, refresh } = useApiResource<SearchResult>('/storage?' + query, '', true)
  const items = current?.items.filter(item => !isFixtureProduct(item)) ?? []
  return <>
    <section className="public-page-intro"><Container>
      <h1>Danh sách kho</h1>
      <div className="landing-finder"><QuickFinder key={query} compact initial={{ size, type, date: params.get('date') ?? '', duration: params.get('duration') ?? '3' }} /></div>
    </Container></section>
    <section className="public-page-content"><Container>
      <div className="storage-results-toolbar">
        <div>
          <p className="flex items-center gap-2"><SlidersHorizontal size={17} aria-hidden="true" />{pending ? 'Đang tìm kho…' : error ? 'Chưa tải được kết quả' : `${items.length} lựa chọn phù hợp`}</p>
          {!pending && !error && <p className="text-slate text-sm">{current?.checkedPeriod ? 'Lịch trống sẽ được kiểm tra lại khi bạn đặt kho.' : 'Chọn ngày thuê để kiểm tra kho trống.'}</p>}
        </div>
        <button type="button" className="button-secondary" onClick={refresh} disabled={pending}>Làm mới</button>
      </div>
      {pending ? <LoadingSkeleton layout="cards" label="Đang kiểm tra danh sách kho…" /> : error ? <div role="alert" className="booking-alert is-error"><p>{error}</p><button type="button" onClick={refresh}>Thử lại</button></div> : <>
        {items.length ? <div className="home-product-grid">{items.map(unit => <StorageListingCard key={unit.id} unit={unit} />)}</div> : <div className="storage-search-empty"><h2>Chưa tìm thấy kho phù hợp</h2><Link className="button-secondary mt-4" to="/storage?size=all&type=all&duration=3">Xóa bộ lọc</Link></div>}
      </>}
    </Container></section>
  </>
}
