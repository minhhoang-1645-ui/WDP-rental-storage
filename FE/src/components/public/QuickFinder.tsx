import { bookingDate } from '../../data/booking'
import { vietnamCalendarDate } from '../../utils/business-date'
import { storageGroupSummary } from '../../utils/storage-selection'
import { Box, CalendarDays, MapPin, Search, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { SearchCriteria } from '../../types/storage'

interface QuickFinderProps { compact?: boolean; landing?: boolean; initial?: Partial<SearchCriteria> }

export function QuickFinder({ compact = false, landing = false, initial }: QuickFinderProps) {
  const { facilities, storageSizes, storageListings } = useCatalog()
  const navigate = useNavigate()
  const initialFacility = facilities.find(facility => facility.id === initial?.facilityId)
  const initialSize = storageSizes.find(size => size.id === initial?.size)
  const [criteria, setCriteria] = useState<SearchCriteria>({
    facilityId: initialFacility?.id ?? '',
    size: initialSize?.id ?? 'all',
    type: initial?.type === 'standard' || initial?.type === 'climate' ? initial.type : 'all',
    date: bookingDate(initial?.date),
    duration: initial?.duration === 'flexible' || (/^[1-9]\d*$/.test(initial?.duration ?? '') && Number.isSafeInteger(Number(initial?.duration))) ? initial!.duration! : landing ? 'flexible' : '3',
  })
  const dateNeedsPeriod = landing && Boolean(criteria.date) && criteria.duration === 'flexible'
  const products = storageListings.filter(product => !criteria.facilityId || product.facilityId === criteria.facilityId)
  const sizes = storageSizes.filter(size => products.some(product => product.sizeId === size.id) || size.id === criteria.size)
  const update = (key: keyof SearchCriteria, value: string) => setCriteria(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dateNeedsPeriod) {
      event.currentTarget.querySelector<HTMLInputElement>('input[name="duration"]')?.focus()
      return
    }
    if (criteria.duration !== 'flexible' && (!Number.isSafeInteger(Number(criteria.duration)) || Number(criteria.duration) < 1)) return
    if (landing && criteria.duration !== 'flexible' && (!bookingDate(criteria.date) || criteria.date < vietnamCalendarDate())) return
    const duration = criteria.duration === 'flexible' ? criteria.duration : String(Number(criteria.duration))
    const params = new URLSearchParams({ size: criteria.size, type: criteria.type, duration })
    if (criteria.facilityId) params.set('facilityId', criteria.facilityId)
    if (criteria.date) params.set('date', criteria.date)
    navigate(`/storage?${params}`)
  }

  const dateField = <label className="field-label"><span>{landing && <CalendarDays size={17} aria-hidden="true" />}Ngày bắt đầu</span><input aria-label="Ngày bắt đầu" type="date" required={landing && criteria.duration !== "flexible"} value={criteria.date} min={vietnamCalendarDate()} onChange={event => update('date', event.target.value)} /></label>

  return <form data-wdp-draft="ignore" onSubmit={submit} className={`finder-grid ${compact ? 'finder-compact' : ''}`} aria-label="Tìm kho nhanh">
    <label className="field-label"><span>{landing && <MapPin size={17} aria-hidden="true" />}Cơ sở</span><select aria-label="Cơ sở" value={criteria.facilityId}
      onChange={event => {
        const facilityId = event.target.value
        setCriteria(current => ({ ...current, facilityId, size: 'all', type: 'all' }))
      }}><option value="">Tất cả cơ sở</option>
      {facilities.map(facility => <option key={facility.id} value={facility.id}>{facility.name}{!facility.bookingEnabled ? ' · Tạm dừng đặt kho' : ''}</option>)}
    </select></label>
    <label className="field-label"><span>{landing && <Box size={17} aria-hidden="true" />}Kích thước</span><select aria-label="Kích thước" value={criteria.size} onChange={event => update('size', event.target.value)}><option value="all">Tất cả kích thước</option>{sizes.map(size => <option key={size.id} value={size.id}>{size.name} · {storageGroupSummary(products.filter(product => product.sizeId === size.id), size)}</option>)}</select></label>
    <label className="field-label"><span>{landing && <ShieldCheck size={17} aria-hidden="true" />}Điều kiện bảo quản</span><select aria-label="Điều kiện bảo quản" value={criteria.type} onChange={event => update('type', event.target.value)}><option value="all">Tất cả điều kiện</option><option value="standard">Tiêu chuẩn</option><option value="climate">Có điều hòa</option></select></label>
    {!landing && dateField}
    <label className="field-label"><span>{landing && <CalendarDays size={17} aria-hidden="true" />}Số tháng thuê</span><input type="number" min={1} step={1} name="duration" placeholder="Chưa xác định" aria-describedby={dateNeedsPeriod ? "landing-search-period-hint" : undefined} value={criteria.duration === 'flexible' ? '' : criteria.duration} onChange={event => update('duration', event.target.value || 'flexible')} /></label>
    {landing && dateField}
    <button className="button-primary justify-center" type="submit"><Search size={18} aria-hidden="true" /> {landing ? "Tìm kho" : "Xem kho phù hợp"}</button>
    {dateNeedsPeriod && <p className="landing-search-hint" id="landing-search-period-hint" role="status">Chọn kỳ thuê để kiểm tra kho trống theo ngày bắt đầu.</p>}
  </form>
}
