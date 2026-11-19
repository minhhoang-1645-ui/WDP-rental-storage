import type { RowDetail } from '../workspace/DetailRow';
import { useInternalListReturn } from '../workspace/internal-list-memory';
import { Link, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { StaffTaskTable, type StaffColumn } from '../workspace/StaffTaskTable';
import { InternalPagination } from '../workspace/InternalPagination';
import { managerReviewReturn } from './manager-table-params';
import { Empty, LoadState, RefreshStatus } from './PortalUi';

export function ManagerTableBack({ fallback }: { fallback: string }) {
  const [params] = useSearchParams();
  const reviews = managerReviewReturn(params);
  const back = useInternalListReturn(reviews ?? fallback);
  return <Link className="button-secondary manager-back-to-list" to={back}>
    <ArrowLeft size={16} aria-hidden="true" /> {reviews ? 'Về hồ sơ cần xử lý' : 'Về danh sách'}
  </Link>;
}

export function ManagerTaskTable<T>({ title, columns, items, rowKey, rowDetail, emphasized, loading = false, refreshing = false, error = '', retry,
  page, limit, total, update, toolbar, emptyTitle, emptyDescription, workspace = 'manager' }: {
  title: string; columns: StaffColumn<T>[]; items: T[]; rowKey: (item: T) => string; rowDetail?: (item: T) => RowDetail | undefined;
  emphasized?: (item: T) => boolean; loading?: boolean; refreshing?: boolean; error?: string; retry: () => void;
  page: number; limit: number; total: number; update: (key: string, value: string) => void;
  toolbar?: ReactNode; emptyTitle?: string; emptyDescription?: string;
  workspace?: 'manager' | 'staff';
}) {
  return <div className="manager-task-list">
    {workspace === 'staff' && <><div className="portal-toolbar staff-table-toolbar">{toolbar}</div><RefreshStatus active={refreshing} /></>}
    <StaffTaskTable key={title} title={title} columns={columns} items={items} rowKey={rowKey} rowDetail={rowDetail}
      emphasized={emphasized} toolbar={workspace === 'manager' ? <>{toolbar}<RefreshStatus active={refreshing} /></> : undefined} hideTable={!!error || !items.length}
      loadingRows={loading ? Math.min(limit, 6) : undefined} preferenceScope={workspace} />
    <LoadState loading={false} error={error} retry={retry} />
    {!loading && !error && <>
      {!items.length && <Empty title={emptyTitle} description={emptyDescription} />}
      <InternalPagination page={page} limit={limit} total={total} showBoundaryControls={workspace === 'manager'}
        onChange={value => update('page', String(value))} onLimitChange={value => update('limit', String(value))} />
    </>}
  </div>;
}

export function ManagerTableSearch({ value, onChange, placeholder }: {
  value: string; onChange: (value: string) => void; placeholder: string;
}) {
  return <label className="field-label portal-search">Tìm kiếm
    <input type="search" value={value} maxLength={100} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
  </label>;
}

export function ManagerTableFilter({ label, value, options, onChange }: {
  label: string; value: string; options: [value: string, label: string][]; onChange: (value: string) => void;
}) {
  return <label className="field-label">{label}<select value={value} onChange={event => onChange(event.target.value)}>
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}
