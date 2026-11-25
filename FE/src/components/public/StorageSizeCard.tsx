import { ArrowRight, Box, Boxes, Package, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorageListing, StorageSize } from '../../types/storage'

const useCases = {
  locker: { icon: Package, description: 'Giấy tờ và vật dụng nhỏ' },
  small: { icon: Box, description: 'Thùng đồ cá nhân và vali' },
  medium: { icon: Boxes, description: 'Đồ gia dụng hoặc hàng kinh doanh' },
  large: { icon: Warehouse, description: 'Nội thất và đồ khi chuyển nhà' },
}

export function StorageSizeCard({ size, products, duration }: { size: StorageSize; products: StorageListing[]; duration: string }) {
  const rates = products.map(product => product.monthlyPrice).filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)
  const price = rates.length ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.min(...rates)) : null
  const areas = [...new Set(products.map(product => product.floorArea).filter(Boolean))]
  const { icon: Icon, description } = useCases[size.id] ?? { icon: Box, description: 'Đồ cá nhân và hàng kinh doanh' }
  const path = `/storage?${new URLSearchParams({ size: size.id, type: 'all', duration })}`
  return <article className="landing-size-card">
    <Link to={path}>
      <div className="landing-size-copy">
        <span className="landing-step-icon"><Icon size={22} aria-hidden="true" /></span>
        <h3>{size.name}</h3>
        {areas.length > 0 && <p className="landing-size-area">{areas.length === 1 ? areas[0] : areas.length <= 3 ? areas.join(' · ') : 'Nhiều diện tích'}</p>}
        <p>{description}</p>
        <p className="landing-size-price">{price ? <>Từ <strong>{price}</strong> / tháng</> : 'Xem giá theo kỳ thuê'}</p>
        <span className="landing-size-cta">Xem kho <ArrowRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  </article>
}
