import { SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageListingCard } from '../../components/public/StorageListingCard'
import { Container } from '../../components/ui/Container'
import { useApiResource } from '../../services/useApiResource'
import type { StorageCondition, StorageSizeId, StorageListing } from '../../types/storage'
import { isFixtureProduct } from '../../catalog/public-catalog'
import { LoadingSkeleton } from '../../components/LoadingSkeleton'
import { useCatalog } from '../../catalog/catalog-context'

interface SearchResult { items: StorageListing[]; checkedPeriod: boolean; total: number }

export function StoragePage() {
  const [params] = useSearchParams()
  const query = params.toString()
  const { getFacility } = useCatalog()
  const facilityId = params.get('facilityId') ?? ''
  const facility = getFacility(facilityId)
  const size = (params.get('size') ?? 'all') as StorageSizeId | 'all'
  const type = (params.get('type') ?? 'all') as StorageCondition | 'all'
  const { data: current, error, loading: pending, refresh } = useApiResource<SearchResult>('/storage?' + query, '', true)
  const items = current?.items.filter(item => !isFixtureProduct(item)) ?? []
  return <>
    <section className="public-page-intro public-catalog-intro"><Container>
      <h1>Danh sách kho lưu trữ</h1>
      <p>Chọn cơ sở, kích thước và thời gian thuê để xem loại kho phù hợp.</p>
      <div className="landing-finder"><QuickFinder key={query} compact initial={{ facilityId, size, type, date: params.get('date') ?? '', duration: params.get('duration') ?? '3' }} /></div>
    </Container></section>
    <section className="public-page-content"><Container>
      <div className="storage-results-toolbar">
        <div>
          <p className="flex items-center gap-2"><SlidersHorizontal size={17} aria-hidden="true" />{pending ? 'Đang tìm kho…' : error ? 'Chưa tải được kết quả' : `${items.length} loại kho${facility ? ' tại ' + facility.name : ''}`}</p>
          {!pending && !error && <p className="text-slate text-sm">{facility?.bookingEnabled === false ? 'Cơ sở đang tạm dừng nhận đặt kho mới.' : current?.checkedPeriod ? 'Kho trống sẽ được kiểm tra lại khi bạn đặt.' : 'Chọn ngày bắt đầu và thời gian thuê để kiểm tra kho trống.'}</p>}
        </div>
        {params.size > 0 && <Link className="button-secondary" to="/storage">Xóa bộ lọc</Link>}
      </div>
      {pending ? <LoadingSkeleton layout="cards" label="Đang kiểm tra danh sách kho…" /> : error ? <div role="alert" className="booking-alert is-error"><p>{error}</p><button type="button" onClick={refresh}>Thử lại</button></div> : <>
        {items.length ? <div className="home-product-grid">{items.map(unit => <StorageListingCard key={unit.id} unit={unit} />)}</div> : <div className="storage-search-empty"><h2>Chưa tìm thấy loại kho phù hợp</h2><p>Thử đổi cơ sở, kích thước hoặc kỳ thuê.</p></div>}
      </>}
    </Container></section>
  </>
}
