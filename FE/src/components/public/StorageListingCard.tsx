import { MapPin, Ruler, Snowflake, Warehouse } from 'lucide-react'
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
    <div className="storage-card-content">
      <div className="storage-card-heading">
        <p>{unit.code}</p>
        <span className={unit.status === 'limited' ? 'status-warning' : 'status-success'}>{unit.status === 'limited' ? 'Số lượng hạn chế' : 'Nhận yêu cầu'}</span>
      </div>
      <h2><Link to={path}>{unit.name}</Link></h2>
      <div className="storage-card-facts">
        <span><Ruler size={15} aria-hidden="true" /> {unit.floorArea || unit.dimensions || size?.floorArea || size?.dimensions || 'Xem thông số kho'}</span>
        <span><MapPin size={15} aria-hidden="true" /> {unit.floor || 'Cơ sở NestBox'}</span>
      </div>
      <div className="storage-card-bottom">
        <p>{monthlyPrice ? <><strong>{monthlyPrice}</strong><span>/tháng</span></> : <strong>Xem báo giá</strong>}</p>
      </div>
      {monthlyPrice && <p className="storage-card-price-note">Chưa gồm cọc và dịch vụ.</p>}
    </div>
    <div className="storage-card-actions"><Link to={path} className="button-secondary">Xem chi tiết</Link>{(!user || user.role === 'CUSTOMER') && <Link to={storageBookingHref(unit, location.search)} className="button-primary" aria-label={`Chọn kho ${unit.name}`}>Chọn kho này</Link>}</div><ComparisonChoice product={unit} />
  </article>
}
