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
  const { storageSizes, storageListings, approvedDurations } = useCatalog()
  const navigate = useNavigate()
  const [criteria, setCriteria] = useState<SearchCriteria>({ size: storageSizes.some(size => size.id === initial?.size) ? initial!.size! : 'all', type: initial?.type === 'standard' || initial?.type === 'climate' ? initial.type : 'all', date: bookingDate(initial?.date), duration: initial?.duration === 'flexible' || approvedDurations.includes(Number(initial?.duration)) ? initial!.duration! : String(approvedDurations.includes(3) ? 3 : approvedDurations[0]) })
  const update = (key: keyof SearchCriteria, value: string) => setCriteria(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams({ size: criteria.size, type: criteria.type, duration: criteria.duration })
    if (criteria.date) params.set('date', criteria.date)
    navigate(`/storage?${params}`)
  }

  return <form data-wdp-draft="ignore" onSubmit={submit} className={`finder-grid ${compact ? 'finder-compact' : ''}`} aria-label="Tìm kho nhanh">
    <label className="field-label">Kích thước<select aria-label="Kích thước" value={criteria.size} onChange={event => update('size', event.target.value)}><option value="all">Tất cả kích thước</option>{storageSizes.map(size => <option key={size.id} value={size.id}>{size.name} · {storageGroupSummary(storageListings.filter(product => product.sizeId === size.id), size)}</option>)}</select></label>
    <label className="field-label">Loại kho<select aria-label="Loại kho" value={criteria.type} onChange={event => update('type', event.target.value)}><option value="all">Tất cả loại kho</option><option value="standard">Kho tiêu chuẩn</option><option value="climate">Kho điều hòa</option></select></label>
    <label className="field-label">Ngày bắt đầu<input aria-label="Ngày bắt đầu" type="date" value={criteria.date} min={vietnamCalendarDate()} onChange={event => update('date', event.target.value)} /></label>
    <label className="field-label">Thời gian thuê<select aria-label="Thời gian thuê" value={criteria.duration} onChange={event => update('duration', event.target.value)}>{approvedDurations.map(months => <option key={months} value={months}>{months} tháng</option>)}<option value="flexible">Chưa xác định</option></select></label>
    <button className="button-primary justify-center" type="submit"><Search size={18} /> Xem kho phù hợp</button>
  </form>
}
