import { ArrowUpRight, Check, MapPin, Ruler, Snowflake, Warehouse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { StorageListing } from '../../types/storage'
import { StorageImage } from './StorageImage'
import { useAuth } from '../../auth/auth-context'
import { storageBookingHref } from '../../utils/storage-selection'
import { ComparisonChoice } from './StorageComparison'

export function StorageListingCard({ unit }: { unit: StorageListing }) {
  const { getStorageSize } = useCatalog()
  const location = useLocation()
  const { user } = useAuth()
  const size = getStorageSize(unit.sizeId)
  const path = `/storage/${encodeURIComponent(unit.id)}${location.search}`
  const monthlyPrice = typeof unit.monthlyPrice === 'number' && Number.isFinite(unit.monthlyPrice) && unit.monthlyPrice >= 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(unit.monthlyPrice) : null
  return <article className="storage-listing-card">
    <Link className="storage-card-image" to={path} aria-label={`Xem chi tiết ${unit.name}`}><StorageImage src={unit.image} loading="lazy" alt={`Ảnh minh họa cho ${unit.name}`} /><span className="storage-card-condition">{unit.condition === 'climate' ? <Snowflake size={13} /> : <Warehouse size={13} />}{unit.condition === 'climate' ? 'Điều hòa' : 'Tiêu chuẩn'}</span><span className="storage-card-image-note">Ảnh minh họa</span></Link>
    <div className="storage-card-content"><div className="storage-card-heading"><p>{unit.code}</p><span className={unit.status === 'limited' ? 'status-warning' : 'status-success'}>{unit.status === 'limited' ? 'Số lượng hạn chế' : 'Nhận yêu cầu'}</span></div><h2><Link to={path}>{unit.name}</Link></h2><div className="storage-card-facts"><span><Ruler size={15} /> {unit.floorArea || unit.dimensions || size?.floorArea || size?.dimensions || 'Xem thông số kho'}</span><span><MapPin size={15} /> {unit.floor || 'Cơ sở NestBox'}</span></div><ul className="storage-card-features">{unit.features.slice(0, 3).map(feature => <li key={feature}><Check size={13} />{feature}</li>)}</ul><div className="storage-card-bottom"><div><small>{monthlyPrice ? 'Đơn giá thuê' : 'Chi phí thuê'}</small><p>{monthlyPrice ? <><strong>{monthlyPrice}</strong><span>/tháng</span></> : <strong>Liên hệ báo giá</strong>}</p></div><Link to={path} className="storage-card-link" aria-label={`Chi tiết ${unit.name}`}><ArrowUpRight size={20} /></Link></div><p className="storage-card-price-note">{monthlyPrice ? 'Chưa gồm cọc và dịch vụ. Xem báo giá theo kỳ thuê.' : 'Báo giá được xác nhận theo kỳ thuê.'}</p></div>
    <div className="storage-card-actions"><Link to={path} className="button-secondary">Xem chi tiết</Link>{(!user || user.role === 'CUSTOMER') && <Link to={storageBookingHref(unit, location.search)} className="button-primary" aria-label={`Chọn kho ${unit.name}`}>Chọn kho này</Link>}</div><ComparisonChoice product={unit} />
  </article>
}
