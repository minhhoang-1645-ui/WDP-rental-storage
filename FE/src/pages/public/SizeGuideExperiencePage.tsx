import { useEffect, useRef } from 'react'
import { ArrowRight, Info, Ruler, Warehouse, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { ComparisonChoice } from '../../components/public/StorageComparison'
import { comparisonHref, useStorageComparison } from '../../components/public/comparison-context'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { storageBookingHref, storageMonthlyPrice, storageSpecifications } from '../../utils/storage-selection'
import type { StorageListing } from '../../types/storage'

export function SizeGuidePage() {
  const { storageSizes, storageListings, getStorageSize } = useCatalog()
  const selection = useStorageComparison()
  const [params, setParams] = useSearchParams()
  const requested = params.get('size') || 'all'
  const selected = storageSizes.some(size => size.id === requested) ? requested : 'all'
  const products = storageListings.filter(product => selected === 'all' || product.sizeId === selected)
  const compareIds = [...new Set((params.get('compare') ?? '').split(','))].filter(id => storageListings.some(product => product.id === id)).slice(0, 3)
  const comparing = params.has('compare') && compareIds.length >= 2
  const compared = compareIds.map(id => storageListings.find(product => product.id === id)!)
  const comparisonHeading = useRef<HTMLHeadingElement>(null)
  const comparisonKey = compareIds.join(',')
  useEffect(() => {
    if (comparing) {
      comparisonHeading.current?.scrollIntoView({ block: 'start' })
      comparisonHeading.current?.focus({ preventScroll: true })
    }
  }, [comparing, comparisonKey])
  const choose = (size: string) => setParams(current => { const next = new URLSearchParams(current); next.set('size', size); next.delete('product'); next.delete('compare'); return next }, { replace: true })
  const edit = () => setParams(current => { const next = new URLSearchParams(current); next.delete('compare'); return next })
  const remove = (id: string) => { if (selection.ids.includes(id)) selection.toggle(id); setParams(current => { const next = new URLSearchParams(current); const ids = compareIds.filter(value => value !== id); if (ids.length >= 2) next.set('compare', ids.join(',')); else next.delete('compare'); return next }) }
  const specs = (product: StorageListing) => storageSpecifications(product, getStorageSize(product.sizeId)!)
  const facts: Array<[string, (product: StorageListing) => string]> = [
    ['Diện tích sàn', product => specs(product).floorArea],
    ['Kích thước (dài × rộng × cao)', product => specs(product).dimensions],
    ['Thể tích', product => specs(product).volume],
    ['Điều kiện bảo quản', product => product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'],
    ['Vị trí', product => product.floor || 'Xem khi xác nhận'],
    ['Truy cập kho', product => product.access || 'Theo thỏa thuận khi bàn giao'],
    ['Tiện ích', product => product.features.join(' · ') || 'Chưa công bố'],
    ['Giá thuê cơ bản', product => storageMonthlyPrice(product.monthlyPrice) + (product.monthlyPrice !== null ? ' / tháng / kho' : '')],
    ['Tiền đặt cọc', product => typeof product.depositMonths === 'number' ? `${product.depositMonths} tháng tiền thuê` : 'Xem báo giá theo kỳ thuê'],
    ['Thuê ngắn ngày', product => product.allowDailyRental ? `Có, tối thiểu ${product.minRentalDays ?? 1} ngày` : 'Thuê theo tháng'],
    ['Tình trạng danh mục', product => product.status === 'limited' ? 'Số lượng hạn chế' : 'Đang nhận yêu cầu'],
  ]
  return <>
    <section className="storage-search-header border-b border-border bg-white py-12"><Container><p className="eyebrow">Hướng dẫn chọn kho</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">So sánh kho trước khi chọn.</h1><p className="mt-4 max-w-3xl leading-7 text-slate">Chọn từ 2 đến 3 loại kho rồi bấm So sánh. Đối chiếu ảnh, kích thước, điều kiện bảo quản và chi phí cạnh nhau trước khi quyết định.</p></Container></section>
    <section className="section-space"><Container>
      {comparing ? <>
        <div className="catalog-comparison-heading"><div><h2 ref={comparisonHeading} tabIndex={-1} className="comparison-result-heading">So sánh {compared.length} loại kho</h2><p>Các hàng có nền nhạt chỉ ra thông tin khác nhau. Giá cơ bản chưa gồm cọc và dịch vụ; kiểm tra báo giá theo ngày thuê.</p><p className="comparison-swipe-hint">Vuốt ngang trong bảng để xem các kho cạnh nhau trên màn hình nhỏ.</p></div><button className="button-secondary" onClick={edit}>Thay đổi kho so sánh</button></div>
        <div className="storage-side-comparison" tabIndex={0} role="region" aria-label="Bảng so sánh kho đã chọn"><table style={{ minWidth: 170 + compared.length * 245 }}><thead><tr><th scope="col">Thông tin so sánh</th>{compared.map(product => <th scope="col" key={product.id} data-product-id={product.id}><button className="comparison-remove" type="button" aria-label={`Bỏ so sánh ${product.name}`} onClick={() => remove(product.id)}><X size={17} /></button><StorageImage src={product.image} alt={`Ảnh tham khảo cho ${product.name}`} /><small>{product.code}</small><h3>{product.name}</h3><strong>{storageMonthlyPrice(product.monthlyPrice)}{product.monthlyPrice !== null && ' / tháng'}</strong><Link className="comparison-detail" to={`/storage/${encodeURIComponent(product.id)}`}>Xem chi tiết</Link></th>)}</tr></thead><tbody>{facts.map(([title, value]) => <tr key={title} className={new Set(compared.map(value)).size > 1 ? 'is-different' : ''}><th scope="row">{title}</th>{compared.map(product => <td key={product.id}>{value(product)}</td>)}</tr>)}<tr><th scope="row">Tiếp tục</th>{compared.map(product => <td key={product.id}><Link className="button-primary" to={storageBookingHref(product, params.toString())} aria-label={`Chọn kho ${product.name}`}>Chọn kho này <ArrowRight size={15} /></Link></td>)}</tr></tbody></table></div><p className="comparison-mobile-hint">Trên màn hình nhỏ, vuốt ngang trong bảng để xem các kho cạnh nhau.</p>
      </> : <>
        {params.has('compare') && <p className="booking-alert" role="status">Hãy chọn ít nhất 2 loại kho đang được cung cấp để so sánh.</p>}
        <div className="catalog-size-filters" aria-label="Lọc nhóm kích thước"><button type="button" aria-pressed={selected === 'all'} className={selected === 'all' ? 'is-selected' : ''} onClick={() => choose('all')}><Warehouse size={20} /><strong>Tất cả loại kho</strong><span>{storageListings.length} lựa chọn</span></button>{storageSizes.map(size => <button key={size.id} type="button" aria-pressed={selected === size.id} className={selected === size.id ? 'is-selected' : ''} onClick={() => choose(size.id)}><Ruler size={20} /><strong>{size.name}</strong><span>{size.floorArea} · {size.dimensions}</span></button>)}</div>
        <div className="catalog-comparison-heading"><div><h2>Chọn kho để so sánh</h2><p>Đã chọn {selection.ids.length}/3. Bạn có thể chọn kho ở nhiều nhóm kích thước khác nhau.</p></div>{selection.ids.length >= 2 ? <Link className="button-primary" to={comparisonHref(selection.ids, params.toString())}>So sánh các kho đã chọn</Link> : <button className="button-primary" disabled>Chọn ít nhất 2 kho</button>}</div>
        <div className="comparison-candidates">{products.map(product => <article className="comparison-candidate" key={product.id} data-candidate-id={product.id}><StorageImage src={product.image} alt={`Ảnh tham khảo cho ${product.name}`} loading="lazy" /><div><small>{product.code}</small><h3>{product.name}</h3><p>{specs(product).floorArea} · {product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</p><strong>{storageMonthlyPrice(product.monthlyPrice)}{product.monthlyPrice !== null && ' / tháng'}</strong><ComparisonChoice product={product} /><Link className="comparison-detail" to={`/storage/${encodeURIComponent(product.id)}`}>Xem chi tiết</Link></div></article>)}</div>
      </>}
      <div className="catalog-choice-note"><Info size={20} /><p>Bạn chọn loại và số lượng kho. Mã kho vật lý và vị trí được hiển thị sau khi xác nhận. Ảnh là ảnh tham khảo; cần kiểm tra lịch trống cho toàn kỳ thuê trước khi gửi yêu cầu. Sức chứa phụ thuộc kích thước đồ, cách đóng gói và lối đi cần chừa.</p></div>
    </Container></section>
  </>
}
