import { MapPin, Ruler, Snowflake, Warehouse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { StorageListing } from '../../types/storage'
import { StorageImage } from './StorageImage'
import { useAuth } from '../../auth/auth-context'
import { storageBookingHref } from '../../utils/storage-selection'
import { ComparisonChoice } from './StorageComparison'

export function StorageListingCard({ unit }: { unit: StorageListing }) {
  const { getFacility, getStorageSize } = useCatalog()
  const location = useLocation()
  const { user } = useAuth()
  const size = getStorageSize(unit.sizeId)
  const facility = getFacility(unit.facilityId)
  const path = `/storage/${encodeURIComponent(unit.id)}${location.search}`
  const monthlyPrice = typeof unit.monthlyPrice === 'number' && Number.isFinite(unit.monthlyPrice) && unit.monthlyPrice >= 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(unit.monthlyPrice) : null
  return <article className="storage-listing-card">
    <Link className="storage-card-image" to={path} aria-label={`Xem chi tiết ${unit.name}`}><StorageImage src={unit.image} loading="lazy" alt="" /><span className="storage-card-condition">{unit.condition === 'climate' ? <Snowflake size={14} aria-hidden="true" /> : <Warehouse size={14} aria-hidden="true" />}{unit.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</span></Link>
    <div className="storage-card-content">
      <div className="storage-card-heading">
        <p>{unit.code}</p>
      </div>
      <h2><Link to={path}>{unit.name}</Link></h2>
      <div className="storage-card-facts">
        <span><Ruler size={15} aria-hidden="true" /> {[unit.floorArea || size?.floorArea, unit.dimensions || size?.dimensions].filter(Boolean).join(' · ') || 'Xem thông số kho'}</span>
        {facility && <span><MapPin size={15} aria-hidden="true" /> Cơ sở: {facility.name}</span>}
      </div>
      <div className="storage-card-bottom">
        <p>{monthlyPrice ? <><strong>{monthlyPrice}</strong><span>/tháng</span></> : <strong>Xem báo giá</strong>}</p>
      </div>
      {monthlyPrice && <p className="storage-card-price-note">Chưa gồm cọc và dịch vụ.</p>}
    </div>
    <div className="storage-card-actions"><Link to={path} className="button-secondary">Xem chi tiết</Link>{(!user || user.role === 'STORAGE_CUSTOMER') && <Link to={storageBookingHref(unit, location.search)} className="button-primary" aria-label={`Chọn kho ${unit.name}`}>Chọn loại kho này</Link>}</div><ComparisonChoice product={unit} />
  </article>
}
