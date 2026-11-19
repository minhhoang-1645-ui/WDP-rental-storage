import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect } from 'react';
import { PAGE_SIZE_OPTIONS } from '../../utils/internal-pagination';

interface InternalPaginationProps {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  onLimitChange?: (limit: number) => void;
  showBoundaryControls?: boolean;
  recordsLabel?: string;
}

export function InternalPagination({ page, limit, total, onChange, disabled = false, onLimitChange, showBoundaryControls = false, recordsLabel = 'bản ghi' }: InternalPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, pages);
  useEffect(() => { if (!disabled && page > pages) onChange(pages); }, [disabled, page, pages, onChange]);
  return <footer className="portal-pagination" aria-label="Phân trang">
    <span aria-live="polite">{total ? `${(currentPage - 1) * limit + 1}–${Math.min(currentPage * limit, total)} / ${total} ${recordsLabel}` : `0 ${recordsLabel}`}</span>
    {onLimitChange && <label className="internal-page-size">Số dòng
      <select aria-label="Số dòng mỗi trang" value={limit} disabled={disabled} onChange={event => onLimitChange(Number(event.target.value))}>
        {PAGE_SIZE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>}
    <div>
      {showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang đầu" disabled={disabled || currentPage <= 1} onClick={() => onChange(1)}><ChevronsLeft size={16} /></button>}
      <button type="button" className="button-secondary" aria-label="Trang trước" disabled={disabled || currentPage <= 1} onClick={() => onChange(currentPage - 1)}><ChevronLeft size={16} /><span>Trang trước</span></button>
      <span>Trang {currentPage} / {pages}</span>
      <button type="button" className="button-secondary" aria-label="Trang sau" disabled={disabled || currentPage >= pages} onClick={() => onChange(currentPage + 1)}><span>Trang sau</span><ChevronRight size={16} /></button>
      {showBoundaryControls && <button type="button" className="button-secondary" aria-label="Trang cuối" disabled={disabled || currentPage >= pages} onClick={() => onChange(pages)}><ChevronsRight size={16} /></button>}
    </div>
  </footer>;
}
