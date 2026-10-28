import { ArrowUpRight, MapPin, Ruler } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorageListing, StorageSize } from '../../types/storage'
import { StorageImage } from './StorageImage'

export function StorageSizeCard({ size, products }: { size: StorageSize; products: StorageListing[] }) {
  const rates = products.map(product => product.monthlyPrice).filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)
  const price = rates.length ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.min(...rates)) : null
  const path = `/storage?size=${size.id}&type=all&duration=3`
  return <article className="storage-listing-card home-group-card">
    <Link className="storage-card-image" to={path} aria-label={`Xem ${size.name}`}><StorageImage src={size.image} alt={`Minh họa sức chứa ${size.name}`} loading="lazy" /><span className="storage-card-condition"><Ruler size={13} />{size.floorArea}</span><span className="storage-card-image-note">Ảnh minh họa</span></Link>
    <div className="storage-card-content"><h3><Link to={path}>{size.name}</Link></h3><div className="storage-card-facts"><span><MapPin size={14} /> Cơ sở NestBox</span><span>{size.volume}</span></div><p className="storage-size-description">{size.roomEquivalent}</p><div className="storage-card-bottom"><div><small>{price ? 'Đơn giá từ' : 'Chi phí thuê'}</small><p>{price ? <><strong>{price}</strong><span>/tháng</span></> : <strong>Liên hệ báo giá</strong>}</p></div><Link to={path} className="storage-card-link" aria-label={`Chọn ${size.name}`}><ArrowUpRight size={20} /></Link></div><p className="storage-card-price-note">Chọn loại kho và kỳ thuê để xem báo giá.</p></div>
  </article>
}
