import { ArrowRight, Check, Snowflake, Warehouse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { StorageListing } from '../../types/storage'

export function StorageListingCard({ unit }: { unit: StorageListing }) {
  const { getStorageSize } = useCatalog()
  const location = useLocation()
  const size = getStorageSize(unit.sizeId)!
  return <article className="storage-listing-card">
    <div className="relative min-h-64 overflow-hidden"><img src={unit.image} alt={`Ảnh minh họa cho ${unit.name}`} className="absolute inset-0 h-full w-full object-cover" /><span className="illustration-label">Ảnh minh họa</span></div>
    <div className="p-6 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{unit.code}</p><h2 className="mt-2 text-2xl font-semibold">{unit.name}</h2><p className="mt-2 text-sm text-slate">{size.dimensions} · {size.volume}</p></div><span className={unit.status === 'limited' ? 'status-warning' : 'status-success'}>{unit.status === 'limited' ? 'Sắp hết' : 'Đang nhận yêu cầu'}</span></div><div className="mt-6 grid grid-cols-2 gap-3 text-sm"><p><Warehouse size={17} /> {unit.floor}</p><p>{unit.condition === 'climate' ? <Snowflake size={17} /> : <Warehouse size={17} />} {unit.condition === 'climate' ? 'Có điều hòa' : 'Tiêu chuẩn'}</p></div><ul className="mt-5 space-y-2 text-sm text-slate">{unit.features.map(feature => <li key={feature}><Check size={15} /> {feature}</li>)}</ul><div className="mt-6 flex items-end justify-between gap-4 border-t border-border pt-5"><div><span className="text-xs font-bold uppercase tracking-wide text-slate">Chi phí thuê</span><p className="font-semibold text-ink">Liên hệ để nhận báo giá</p></div><Link className="button-primary shrink-0" to={`/storage/${unit.id}${location.search}`}>Xem chi tiết <ArrowRight size={17} /></Link></div></div>
  </article>
}
