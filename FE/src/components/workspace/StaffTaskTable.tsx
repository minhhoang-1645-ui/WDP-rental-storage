import { DetailRow, type RowDetail } from './DetailRow';
import { Ellipsis, SlidersHorizontal } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
export { InternalPagination as StaffTaskPagination } from './InternalPagination';
import { safeSessionStorage } from '../../services/browser-storage';
import { TableSkeleton } from '../LoadingSkeleton';


export function TablePopover({ name, trigger, children, panelClassName = '' }: { name: string; trigger: ReactNode; children: ReactNode; panelClassName?: string }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  return <>
    <button type="button" className="button-secondary staff-table-trigger" aria-label={name} popoverTarget={id}
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect();
        const popup = panel.current;
        if (!popup) return;
        const below = window.innerHeight - box.bottom;
        const above = box.top;
        const openUp = below < 170 && above > below;
        const width = Math.min(190, window.innerWidth - 16);
        popup.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`;
        popup.style.top = openUp ? 'auto' : `${box.bottom + 5}px`;
        popup.style.bottom = openUp ? `${window.innerHeight - box.top + 5}px` : 'auto';
        popup.style.maxHeight = `${Math.max(44, (openUp ? above : below) - 13)}px`;
      }}>{trigger}</button>
    <div ref={panel} id={id} className={`staff-table-popover ${panelClassName}`.trim()} popover="auto">{children}</div>
  </>;
}

export function StaffRowActions({ to, code, onOpen, startLabel, detailLabel = 'Xem chi tiết' }: {
  to: string; code: string; onOpen?: () => void; startLabel?: string; detailLabel?: string;
}) {
  return <div className="staff-table-actions">
    <TablePopover name={`Thao tác ${code}`} trigger={<Ellipsis size={18} aria-hidden="true" />}>
      <Link to={to} onClick={onOpen}>{detailLabel}</Link>
      {startLabel && <Link to={to + '#staff-processing'} onClick={onOpen}>{startLabel}</Link>}
    </TablePopover>
  </div>;
}

export type StaffColumn<T> = {
  key: string; label: string; header?: ReactNode; cell: (row: T) => ReactNode; optional?: boolean; numeric?: boolean;
  sort?: { direction: 'ascending' | 'descending' | 'none'; toggle: () => void };
};

export function StaffTaskTable<T>({ title, columns, items, rowKey, rowDetail, emphasized, selected, toolbar, hideTable = false, loadingRows, preferenceScope = 'staff' }: {
  title: string; columns: StaffColumn<T>[]; items: T[]; rowKey: (row: T) => string; rowDetail?: (row: T) => RowDetail | undefined; emphasized?: (row: T) => boolean; selected?: (row: T) => boolean;
  toolbar?: ReactNode; hideTable?: boolean; loadingRows?: number; preferenceScope?: string;
}) {
  const preference = `nestbox-${preferenceScope}-table-columns:${title}`;
  const [hidden, setHidden] = useState(() => (safeSessionStorage.getItem(preference) ?? '').split(',').filter(Boolean));
  const visible = columns.filter(column => !column.optional || !hidden.includes(column.key));
  const showTable = !hideTable && loadingRows === undefined;
  return <div className="staff-table">
    <div className="staff-table-options">{toolbar}{showTable && columns.some(column => column.optional) && <TablePopover name="Hiển thị cột" trigger={<><SlidersHorizontal size={15} aria-hidden="true" /> Cột</>}>
      {columns.filter(column => column.optional).map(column => <label key={column.key}>
        <input type="checkbox" checked={!hidden.includes(column.key)} onChange={event => {
          const checked = event.target.checked;
          const next = checked ? hidden.filter(key => key !== column.key) : [...hidden, column.key];
          safeSessionStorage.setItem(preference, next.join(','));
          setHidden(next);
        }} />{column.label}
      </label>)}
    </TablePopover>}</div>
    {loadingRows !== undefined && <TableSkeleton columns={visible} rows={loadingRows} pagination />}
    {showTable && <div className="manager-table-wrap staff-table-scroll" tabIndex={0} role="region" aria-label={title}>
      <table className="manager-table" aria-label={title}>
        <thead><tr>{visible.map(column => <th key={column.key} scope="col" className={column.numeric ? 'table-number' : undefined} aria-sort={column.sort?.direction}>
          {column.sort ? <button type="button" className="staff-table-sort" onClick={column.sort.toggle}>{column.label} <span aria-hidden="true">{column.sort.direction === 'ascending' ? '↑' : column.sort.direction === 'descending' ? '↓' : '↕'}</span></button> : column.header ?? column.label}
        </th>)}</tr></thead>
        <tbody>{items.map(row => <DetailRow key={rowKey(row)} detail={rowDetail?.(row)} data-selected={selected?.(row) || undefined} className={emphasized?.(row) ? 'is-priority' : undefined}>
          {visible.map(column => <td key={column.key} className={column.numeric ? 'table-number' : undefined}>{column.cell(row)}</td>)}
        </DetailRow>)}</tbody>
      </table>
    </div>}
  </div>;
}
