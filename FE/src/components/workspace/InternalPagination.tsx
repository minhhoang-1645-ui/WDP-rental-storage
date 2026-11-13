import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect } from 'react';
export interface InternalPaginationProps { page: number; limit: number; total: number; onChange: (page: number) => void; disabled?: boolean; onLimitChange?: (limit: number) => void; pageSizes?: readonly number[]; showBoundaryControls?: boolean }
export function InternalPagination({ page, limit, total, onChange, disabled = false, onLimitChange, pageSizes = [5, 10], showBoundaryControls = false }: InternalPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  useEffect(() => { if (!disabled && page > pages) onChange(pages); }, [disabled, page, pages, onChange]);
  return <footer className="portal-pagination" aria-label="Phân trang">
    <span aria-live="polite">{total ? `${Math.min((page - 1) * limit + 1, total)}–${Math.min(page * limit, total)} / ${total} bản ghi` : '0 bản ghi'}</span>
    {onLimitChange && <label className="internal-page-size">Số dòng<select aria-label="Số dòng mỗi trang" value={limit} disabled={disabled} onChange={event => onLimitChange(Number(event.target.value))}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    <div>{showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang đầu" disabled={disabled || page <= 1} onClick={() => onChange(1)}><ChevronsLeft size={16} /></button>}<button type="button" className="button-secondary" aria-label="Trang trước" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} />Trang trước</button><span>Trang {page} / {pages}</span><button type="button" className="button-secondary" aria-label="Trang sau" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>Trang sau<ChevronRight size={16} /></button>{showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang cuối" disabled={disabled || page >= pages} onClick={() => onChange(pages)}><ChevronsRight size={16} /></button>}</div>
  </footer>;
}
