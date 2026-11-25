import { bookingDate } from '../../data/booking'
import { vietnamCalendarDate } from '../../utils/business-date'
import { storageGroupSummary } from '../../utils/storage-selection'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { SearchCriteria } from '../../types/storage'

interface QuickFinderProps { compact?: boolean; initial?: Partial<SearchCriteria> }

export function QuickFinder({ compact = false, initial }: QuickFinderProps) {
  const { facilities, storageSizes, storageListings, approvedDurations } = useCatalog()
  const navigate = useNavigate()
  const initialFacility = facilities.find(facility => facility.id === initial?.facilityId)
  const initialSize = storageSizes.find(size => size.id === initial?.size)
  const [criteria, setCriteria] = useState<SearchCriteria>({
    facilityId: initialFacility?.id ?? '',
    size: initialSize?.id ?? 'all',
    type: initial?.type === 'standard' || initial?.type === 'climate' ? initial.type : 'all',
    date: bookingDate(initial?.date),
    duration: initial?.duration === 'flexible' || approvedDurations.includes(Number(initial?.duration)) ? initial!.duration! : String(approvedDurations.includes(3) ? 3 : approvedDurations[0]),
  })
  const products = storageListings.filter(product => !criteria.facilityId || product.facilityId === criteria.facilityId)
  const sizes = storageSizes.filter(size => products.some(product => product.sizeId === size.id) || size.id === criteria.size)
  const update = (key: keyof SearchCriteria, value: string) => setCriteria(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams({ size: criteria.size, type: criteria.type, duration: criteria.duration })
    if (criteria.facilityId) params.set('facilityId', criteria.facilityId)
    if (criteria.date) params.set('date', criteria.date)
    navigate(`/storage?${params}`)
  }

  return <form data-wdp-draft="ignore" onSubmit={submit} className={`finder-grid ${compact ? 'finder-compact' : ''}`} aria-label="Tìm kho nhanh">
    <label className="field-label">Cơ sở<select aria-label="Cơ sở" value={criteria.facilityId}
      onChange={event => {
        const facilityId = event.target.value
        setCriteria(current => ({ ...current, facilityId, size: 'all', type: 'all' }))
      }}><option value="">Tất cả cơ sở</option>
      {facilities.map(facility => <option key={facility.id} value={facility.id}>{facility.name}{!facility.bookingEnabled ? ' · Tạm dừng đặt kho' : ''}</option>)}
    </select></label>
    <label className="field-label">Kích thước<select aria-label="Kích thước" value={criteria.size} onChange={event => update('size', event.target.value)}><option value="all">Tất cả kích thước</option>{sizes.map(size => <option key={size.id} value={size.id}>{size.name} · {storageGroupSummary(products.filter(product => product.sizeId === size.id), size)}</option>)}</select></label>
    <label className="field-label">Điều kiện bảo quản<select aria-label="Điều kiện bảo quản" value={criteria.type} onChange={event => update('type', event.target.value)}><option value="all">Tất cả điều kiện</option><option value="standard">Tiêu chuẩn</option><option value="climate">Có điều hòa</option></select></label>
    <label className="field-label">Ngày bắt đầu<input aria-label="Ngày bắt đầu" type="date" value={criteria.date} min={vietnamCalendarDate()} onChange={event => update('date', event.target.value)} /></label>
    <label className="field-label">Thời gian thuê<select aria-label="Thời gian thuê" value={criteria.duration} onChange={event => update('duration', event.target.value)}>{approvedDurations.map(months => <option key={months} value={months}>{months} tháng</option>)}<option value="flexible">Chưa xác định</option></select></label>
    <button className="button-primary justify-center" type="submit"><Search size={18} /> Xem kho phù hợp</button>
  </form>
}
