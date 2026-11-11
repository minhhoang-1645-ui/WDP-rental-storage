import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
export interface InternalPaginationProps { page: number; limit: number; total: number; onChange: (page: number) => void; disabled?: boolean; onLimitChange?: (limit: number) => void }
export function InternalPagination({ page, limit, total, onChange, disabled = false, onLimitChange }: InternalPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  useEffect(() => { if (!disabled && page > pages) onChange(pages); }, [disabled, page, pages, onChange]);
  return <footer className="portal-pagination" aria-label="Phân trang">
    <span aria-live="polite">{total ? `${Math.min((page - 1) * limit + 1, total)}–${Math.min(page * limit, total)} / ${total} bản ghi` : '0 bản ghi'}</span>
    {onLimitChange && <label className="internal-page-size">Số dòng<select aria-label="Số dòng mỗi trang" value={limit} disabled={disabled} onChange={event => onLimitChange(Number(event.target.value))}>{[5, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    <div><button type="button" className="button-secondary" aria-label="Trang trước" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} />Trang trước</button><span>Trang {page} / {pages}</span><button type="button" className="button-secondary" aria-label="Trang sau" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>Trang sau<ChevronRight size={16} /></button></div>
  </footer>;
}
