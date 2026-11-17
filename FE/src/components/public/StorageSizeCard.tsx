import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorageListing, StorageSize } from '../../types/storage'
import { StorageIllustration } from '../booking/StorageIllustration'
import { StorageImage } from './StorageImage'

export function StorageSizeCard({ size, products, duration }: { size: StorageSize; products: StorageListing[]; duration: string }) {
  const rates = products.map(product => product.monthlyPrice).filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)
  const price = rates.length ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.min(...rates)) : null
  const path = `/storage?${new URLSearchParams({ size: size.id, type: 'all', duration })}`
  return <article className="landing-size-card">
    <Link to={path}>
      <div className="landing-size-image">
        {size.image?.endsWith('/storage-size-atlas.jpg') ? <StorageIllustration sizeId={size.id} /> : <StorageImage src={size.image} loading="lazy" alt="" />}
        <span>Ảnh minh họa</span>
      </div>
      <div className="landing-size-copy">
        <div><h3>{size.name}</h3><p>{size.floorArea}</p></div>
        <ArrowUpRight size={19} aria-hidden="true" />
        <p className="landing-size-price">{price ? <>Từ <strong>{price}</strong>/tháng</> : 'Liên hệ báo giá'}</p>
      </div>
    </Link>
  </article>
}
