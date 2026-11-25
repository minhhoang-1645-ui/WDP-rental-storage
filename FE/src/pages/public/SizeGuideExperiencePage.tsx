import { useEffect, useRef } from 'react'
import { ArrowRight, Columns3, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import { ComparisonChoice } from '../../components/public/StorageComparison'
import { comparisonHref, useStorageComparison } from '../../components/public/comparison-context'
import { StorageImage } from '../../components/public/StorageImage'
import { Container } from '../../components/ui/Container'
import { storageBookingHref, storageMonthlyPrice, storageSpecifications } from '../../utils/storage-selection'
import type { StorageListing } from '../../types/storage'

export function SizeGuidePage() {
  const { storageSizes, storageListings, getFacility, getStorageSize } = useCatalog()
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
    ['Rộng × dài × cao', product => specs(product).dimensions],
    ['Thể tích', product => specs(product).volume],
    ['Bảo quản', product => product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'],
    ['Cơ sở', product => getFacility(product.facilityId)?.name || 'Chưa công bố'],
    ['Lối tiếp cận', product => product.access || 'Chưa công bố'],
    ['Tiện ích', product => product.features.join(' · ') || 'Chưa công bố'],
    ['Giá thuê cơ bản', product => storageMonthlyPrice(product.monthlyPrice) + (product.monthlyPrice !== null ? ' / tháng / kho' : '')],
    ['Tiền đặt cọc', product => typeof product.depositMonths === 'number' ? `${product.depositMonths} tháng tiền thuê` : 'Xem báo giá theo kỳ thuê'],
    ['Thuê ngắn ngày', product => product.allowDailyRental ? `Có, tối thiểu ${product.minRentalDays ?? 1} ngày` : 'Thuê theo tháng'],
  ]
  return <div className="storage-comparison-page">
    <header className="public-page-intro public-catalog-intro"><Container>
      <h1>So sánh kho</h1>
      <p>Đối chiếu kích thước, điều kiện bảo quản, giá thuê và tiền cọc.</p>
    </Container></header>
    <section className="public-page-content"><Container>
      {comparing ? <>
        <div className="catalog-comparison-heading">
          <div>
            <h2 ref={comparisonHeading} tabIndex={-1} className="comparison-result-heading">So sánh {compared.length} loại kho đã chọn</h2>
            <p>Giá thuê chưa gồm tiền cọc và dịch vụ.</p>
          </div>
          <button type="button" className="button-secondary" onClick={edit}>Đổi lựa chọn</button>
        </div>
        <p className="comparison-swipe-hint">Vuốt ngang để xem thêm.</p>
        <div className="storage-side-comparison" tabIndex={0} role="region" aria-label="Bảng so sánh kho đã chọn">
          <table style={{ minWidth: 170 + compared.length * 245 }}>
            <thead><tr>
              <th scope="col">Thông tin</th>
              {compared.map(product => <th scope="col" key={product.id} data-product-id={product.id}>
                <button className="comparison-remove" type="button" aria-label={`Bỏ so sánh ${product.name}`} onClick={() => remove(product.id)}><X size={17} /></button>
                <StorageImage src={product.image} alt="" />
                <small>{product.code}</small>
                <h3>{product.name}</h3>
                <Link className="comparison-detail" to={`/storage/${encodeURIComponent(product.id)}`}>Xem chi tiết</Link>
              </th>)}
            </tr></thead>
            <tbody>
              {facts.map(([title, value]) => <tr key={title} className={new Set(compared.map(value)).size > 1 ? 'is-different' : ''}>
                <th scope="row">{title}</th>
                {compared.map(product => <td key={product.id}>{value(product)}</td>)}
              </tr>)}
              <tr><th scope="row">Đặt kho</th>{compared.map(product => <td key={product.id}>
                <Link className="button-primary" to={storageBookingHref(product, params.toString())} aria-label={`Chọn kho ${product.name}`}>Chọn kho này <ArrowRight size={15} /></Link>
              </td>)}</tr>
            </tbody>
          </table>
        </div>
      </> : <>
        {params.has('compare') && <p className="booking-alert" role="status">Chọn ít nhất 2 loại kho đang được cung cấp.</p>}
        {selection.ids.length === 0 && <div className="comparison-selection-empty">
          <span className="landing-step-icon"><Columns3 size={22} aria-hidden="true" /></span>
          <div><h2>Chưa chọn kho để so sánh</h2><p>Chọn 2–3 loại kho bên dưới để xem thông tin cạnh nhau.</p></div>
        </div>}
        <div className="comparison-toolbar">
          <div className="catalog-size-filters" role="group" aria-label="Lọc theo kích thước">
            <button type="button" aria-pressed={selected === 'all'} onClick={() => choose('all')}>Tất cả loại kho</button>
            {storageSizes.map(size => <button key={size.id} type="button" aria-pressed={selected === size.id} onClick={() => choose(size.id)}>{size.name}</button>)}
          </div>
          <div className="comparison-submit">
            <span aria-live="polite">Đã chọn {selection.ids.length}/3</span>
            {selection.ids.length >= 2
              ? <Link className="button-primary" to={comparisonHref(selection.ids, params.toString())}>So sánh</Link>
              : <button type="button" className="button-primary" disabled>So sánh</button>}
          </div>
        </div>
        <div className="comparison-candidates">
          {products.map(product => <article className={`comparison-candidate${selection.ids.includes(product.id) ? ' is-selected' : ''}`} key={product.id} data-candidate-id={product.id}>
            <StorageImage src={product.image} alt="" loading="lazy" />
            <div>
              <small>{product.code}</small>
              <h2>{product.name}</h2>
              <p>{specs(product).floorArea} · {product.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</p>
              {getFacility(product.facilityId)?.name && <p>Cơ sở: {getFacility(product.facilityId)?.name}</p>}
              <strong>{storageMonthlyPrice(product.monthlyPrice)}{product.monthlyPrice !== null && ' / tháng'}</strong>
              <div className="comparison-card-actions">
                <ComparisonChoice product={product} />
                <Link className="comparison-detail" to={`/storage/${encodeURIComponent(product.id)}`}>Xem chi tiết</Link>
              </div>
            </div>
          </article>)}
        </div>
      </>}
      <p className="comparison-note">Số kho trống phụ thuộc vào thời gian thuê.</p>
    </Container></section>
  </div>
}
