import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { QuickFinder } from '../../components/public/QuickFinder'
import { StorageListingCard } from '../../components/public/StorageListingCard'
import { Container } from '../../components/ui/Container'
import { storageListings } from '../../data/storage'
import type { StorageCondition, StorageSizeId } from '../../types/storage'

export function StoragePage() {
  const [params] = useSearchParams()
  const size = (params.get('size') ?? 'all') as StorageSizeId | 'all'
  const type = (params.get('type') ?? 'all') as StorageCondition | 'all'
  const filtered = storageListings.filter(unit => (size === 'all' || unit.sizeId === size) && (type === 'all' || unit.condition === type))
  return <>
    <section className="border-b border-border bg-white py-12"><Container><Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><ArrowLeft size={17} /> Trang chủ</Link><div className="mt-7"><p className="eyebrow">Kho đang nhận yêu cầu</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Tìm không gian phù hợp</h1><p className="mt-4 max-w-2xl leading-7 text-slate">Tình trạng và mã kho dưới đây là dữ liệu mẫu để hoàn thiện hành trình. WDP sẽ xác nhận kho thực tế và báo giá sau khi nhận yêu cầu.</p></div><div className="mt-8"><QuickFinder compact initial={{ size, type, date: params.get('date') ?? '', duration: params.get('duration') ?? '3' }} /></div></Container></section>
    <section className="section-space"><Container><div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center"><p className="flex items-center gap-2 text-sm text-slate"><SlidersHorizontal size={17} /> {filtered.length} lựa chọn phù hợp{params.get('date') && ` · bắt đầu ${params.get('date')}`}{params.get('duration') && params.get('duration') !== 'flexible' && ` · ${params.get('duration')} tháng`}</p><Link to="/size-guide" className="text-sm font-bold text-navy hover:underline">So sánh kích thước</Link></div>{filtered.length > 0 ? <div className="grid gap-6 xl:grid-cols-2">{filtered.map(unit => <StorageListingCard key={unit.id} unit={unit} />)}</div> : <div className="border border-border bg-white p-10 text-center"><h2 className="text-2xl font-semibold">Chưa có lựa chọn khớp hoàn toàn</h2><p className="mt-3 text-slate">Hãy thử chọn “Tất cả kích thước” hoặc “Tất cả loại kho”.</p><Link className="button-secondary mt-6" to="/storage?size=all&type=all&duration=3">Xóa bộ lọc</Link></div>}</Container></section>
  </>
}
