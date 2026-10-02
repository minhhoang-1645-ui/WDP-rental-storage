import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageListingCard } from '../../components/public/StorageListingCard'
import { Container } from '../../components/ui/Container'
import { useApiResource } from '../../services/useApiResource'
import type { StorageCondition, StorageSizeId, StorageListing } from '../../types/storage'

interface SearchResult { items: StorageListing[]; checkedPeriod: boolean; total: number }

export function StoragePage() {
  const [params] = useSearchParams()
  const query = params.toString()
  const size = (params.get('size') ?? 'all') as StorageSizeId | 'all'
  const type = (params.get('type') ?? 'all') as StorageCondition | 'all'
  const { data: current, error, loading: pending, refresh } = useApiResource<SearchResult>('/storage?' + query, '', true)
  return <>
    <section className="border-b border-border bg-white py-12"><Container>
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><ArrowLeft size={17} /> Trang chủ</Link>
      <div className="mt-7"><p className="eyebrow">Kho đang nhận yêu cầu</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Tìm không gian phù hợp</h1><p className="mt-4 max-w-2xl leading-7 text-slate">Chọn ngày bắt đầu và thời hạn để xem kho còn phù hợp trong khoảng thuê. WDP sẽ xác nhận kho thực tế và báo giá sau khi nhận yêu cầu.</p></div>
      <div className="mt-8"><QuickFinder key={query} compact initial={{ size, type, date: params.get('date') ?? '', duration: params.get('duration') ?? '3' }} /></div>
    </Container></section>
    <section className="section-space"><Container>
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
        <p className="flex items-center gap-2 text-sm text-slate"><SlidersHorizontal size={17} />{pending ? 'Đang tìm kho…' : error ? 'Chưa tải được kết quả' : `${current?.total ?? 0} lựa chọn phù hợp`}</p>
        <button type="button" className="button-secondary" onClick={refresh} disabled={pending}>Làm mới</button>
      </div>
      {pending ? <p role="status">Đang kiểm tra danh sách kho…</p> : error ? <div role="alert" className="booking-alert is-error"><p>{error}</p><button type="button" onClick={refresh}>Thử lại</button></div> : <>
        <p className="mb-6 text-sm text-slate">{current?.checkedPeriod ? 'Đã kiểm tra khoảng thuê trong dữ liệu hiện tại. Tình trạng sẽ được kiểm tra lại khi gửi yêu cầu.' : 'Chưa kiểm tra lịch trống. Hãy chọn ngày và thời hạn thuê cụ thể.'}</p>
        {current?.items.length ? <div className="grid gap-6 xl:grid-cols-2">{current.items.map(unit => <StorageListingCard key={unit.id} unit={unit} />)}</div> : <div className="border border-border bg-white p-10 text-center"><h2 className="text-2xl font-semibold">Chưa có lựa chọn khớp hoàn toàn</h2><p className="mt-3 text-slate">Hãy thử đổi thời gian, kích thước hoặc loại kho.</p><Link className="button-secondary mt-6" to="/storage?size=all&type=all&duration=3">Xóa bộ lọc</Link></div>}
      </>}
    </Container></section>
  </>
}
