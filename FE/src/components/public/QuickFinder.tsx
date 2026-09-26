import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { storageSizes } from '../../data/storage'
import type { SearchCriteria } from '../../types/storage'

interface QuickFinderProps { compact?: boolean; initial?: Partial<SearchCriteria> }

export function QuickFinder({ compact = false, initial }: QuickFinderProps) {
  const navigate = useNavigate()
  const [criteria, setCriteria] = useState<SearchCriteria>({ size: initial?.size ?? 'all', type: initial?.type ?? 'all', date: initial?.date ?? '', duration: initial?.duration ?? '3' })
  const update = (key: keyof SearchCriteria, value: string) => setCriteria(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams({ size: criteria.size, type: criteria.type, duration: criteria.duration })
    if (criteria.date) params.set('date', criteria.date)
    navigate(`/storage?${params}`)
  }

  return <form onSubmit={submit} className={`finder-grid ${compact ? 'finder-compact' : ''}`} aria-label="Tìm kho nhanh">
    <label className="field-label">Kích thước<select value={criteria.size} onChange={event => update('size', event.target.value)}><option value="all">Tất cả kích thước</option>{storageSizes.map(size => <option key={size.id} value={size.id}>{size.name} · {size.volume}</option>)}</select></label>
    <label className="field-label">Loại kho<select value={criteria.type} onChange={event => update('type', event.target.value)}><option value="all">Tất cả loại kho</option><option value="standard">Kho tiêu chuẩn</option><option value="climate">Kho điều hòa</option></select></label>
    <label className="field-label">Ngày bắt đầu<input type="date" value={criteria.date} min={new Date().toISOString().slice(0, 10)} onChange={event => update('date', event.target.value)} /></label>
    <label className="field-label">Thời gian thuê<select value={criteria.duration} onChange={event => update('duration', event.target.value)}><option value="1">1 tháng</option><option value="3">3 tháng</option><option value="6">6 tháng</option><option value="12">12 tháng</option><option value="flexible">Chưa xác định</option></select></label>
    <button className="button-primary justify-center" type="submit">Xem kho phù hợp <ArrowRight size={18} /></button>
  </form>
}
