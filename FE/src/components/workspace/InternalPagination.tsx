import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect } from 'react';
import { internalPageSizes } from '../../utils/internal-pagination';
export interface InternalPaginationProps { page: number; limit: number; total: number; onChange: (page: number) => void; disabled?: boolean; onLimitChange?: (limit: number) => void; pageSizes?: readonly number[]; showBoundaryControls?: boolean; showPageNumbers?: boolean; recordsLabel?: string }
const defaultPageSizes = [5, ...internalPageSizes];

export function InternalPagination({ page, limit, total, onChange, disabled = false, onLimitChange, pageSizes = defaultPageSizes, showBoundaryControls = false, showPageNumbers = false, recordsLabel = 'bản ghi' }: InternalPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const options = pageSizes.includes(limit) ? pageSizes : [limit, ...pageSizes].sort((a, b) => a - b);
  useEffect(() => { if (!disabled && page > pages) onChange(pages); }, [disabled, page, pages, onChange]);
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  return <footer className="portal-pagination" aria-label="Phân trang">
    <span aria-live="polite">{total ? `${Math.min((page - 1) * limit + 1, total)}–${Math.min(page * limit, total)} / ${total} ${recordsLabel}` : `0 ${recordsLabel}`}</span>
    {onLimitChange && <label className="internal-page-size">Số dòng<select aria-label="Số dòng mỗi trang" value={limit} disabled={disabled} onChange={event => onLimitChange(Number(event.target.value))}>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    <div>{showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang đầu" disabled={disabled || page <= 1} onClick={() => onChange(1)}><ChevronsLeft size={16} /></button>}<button type="button" className="button-secondary" aria-label="Trang trước" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /><span>Trang trước</span></button>{showPageNumbers ? <span className="internal-page-numbers" aria-label={`Trang ${page} / ${pages}`}>
      {pageNumbers.map((value, index) => <span key={value}>
        {index > 0 && pageNumbers[index - 1] + 1 < value && <span aria-hidden="true">…</span>}
        <button type="button" className="button-secondary" aria-label={`Trang ${value}`} aria-current={page === value ? 'page' : undefined}
          disabled={disabled || page === value} onClick={() => onChange(value)}>{value}</button>
      </span>)}
    </span> : <span>Trang {page} / {pages}</span>}<button type="button" className="button-secondary" aria-label="Trang sau" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}><span>Trang sau</span><ChevronRight size={16} /></button>{showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang cuối" disabled={disabled || page >= pages} onClick={() => onChange(pages)}><ChevronsRight size={16} /></button>}</div>
  </footer>;
}
