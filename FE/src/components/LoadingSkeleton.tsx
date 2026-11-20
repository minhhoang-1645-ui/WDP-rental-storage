import type { CSSProperties, ReactNode } from 'react'
import './LoadingSkeleton.css'

export type SkeletonLayout = 'list' | 'detail' | 'catalog' | 'cards' | 'compact'

export function LoadingSkeleton({ label = 'Đang tải dữ liệu…', layout = 'list' }: { label?: string; layout?: SkeletonLayout }) {
  const withImages = layout === 'catalog' || layout === 'cards'
  return <div className={`loading-skeleton loading-skeleton--${layout}`} role="status">
    <span className="sr-only">{label}</span>
    {layout === 'compact' ? <span className="loading-skeleton__bone" aria-hidden="true" /> :
      <div className="loading-skeleton__content" aria-hidden="true">
        {layout === 'catalog' && <div className="loading-skeleton__heading">
          <span className="loading-skeleton__bone" />
          <span className="loading-skeleton__bone" />
        </div>}
        <div className="loading-skeleton__items">
          {(layout === 'detail' ? [0, 1] : [0, 1, 2]).map(index => <div className="loading-skeleton__item" key={index}>
            {withImages && <span className="loading-skeleton__bone loading-skeleton__image" />}
            <div className="loading-skeleton__lines">
              <span className="loading-skeleton__bone" />
              <span className="loading-skeleton__bone" />
              <span className="loading-skeleton__bone" />
            </div>
          </div>)}
        </div>
      </div>}
  </div>
}

export function SkeletonBone({ shape = 'line' }: { shape?: 'line' | 'short' | 'value' | 'square' | 'badge' | 'field' }) {
  return <span className={`loading-skeleton__bone workspace-skeleton__${shape}`} aria-hidden="true" />
}

function WorkspaceSkeleton({ label, children, variant }: { label: string; children: ReactNode; variant: string }) {
  return <div className={`workspace-skeleton workspace-skeleton--${variant}`}>
    <span className="sr-only" role="status">{label}</span>
    <div aria-hidden="true" aria-busy="true">{children}</div>
  </div>
}

export function DashboardSkeleton({ variant, cardClass }: { variant: 'metric' | 'activity' | 'bars' | 'storage' | 'distribution'; cardClass?: string }) {
  if (variant === 'metric') return <div className={`workspace-skeleton workspace-skeleton--metric ${cardClass ?? ''}`} aria-hidden="true">
    <div className="workspace-skeleton__metric-heading"><SkeletonBone /><SkeletonBone shape="square" /></div>
    <SkeletonBone shape="value" /><SkeletonBone shape="short" />
  </div>
  return <WorkspaceSkeleton variant={variant} label={variant === 'activity' ? 'Đang tải công việc…' : 'Đang tải số liệu…'}>
    {variant === 'activity' ? <div className="workspace-skeleton__activity">
      {Array.from({ length: 3 }, (_, i) => <div key={i}><SkeletonBone shape="square" /><div><SkeletonBone /><SkeletonBone shape="short" /></div><SkeletonBone shape="badge" /></div>)}
    </div> : variant === 'bars' ? <div className="workspace-skeleton__bars">
      {[38, 60, 47, 68, 52, 63, 50].map((height, i) => <span key={i} className="loading-skeleton__bone" style={{ height: `${height}%` }} />)}
    </div> : variant === 'distribution' ? <div className="workspace-skeleton__distribution">
      <SkeletonBone shape="short" /><SkeletonBone />
      {Array.from({ length: 4 }, (_, i) => <div key={i}><SkeletonBone shape="square" /><SkeletonBone shape="short" /><SkeletonBone shape="short" /></div>)}
    </div> : <div className="workspace-skeleton__storage">
      {Array.from({ length: 4 }, (_, i) => <div key={i}><SkeletonBone shape="short" /><SkeletonBone shape="value" /></div>)}
    </div>}
  </WorkspaceSkeleton>
}

type SkeletonColumn = string | { key: string; optional?: boolean }
export function TableSkeleton({ columns, rows = 6, pagination = false, toolbar = false }: {
  columns: readonly SkeletonColumn[]; rows?: number; pagination?: boolean; toolbar?: boolean;
}) {
  return <WorkspaceSkeleton variant="table" label="Đang tải danh sách…">
    {toolbar && <div className="workspace-skeleton__toolbar"><SkeletonBone shape="field" /><SkeletonBone shape="badge" /></div>}
    <div className="workspace-skeleton__table" style={{ '--skeleton-columns': columns.length } as CSSProperties}>
      {Array.from({ length: Math.min(8, Math.max(1, rows)) + 1 }, (_, i) =>
        <div className="workspace-skeleton__row" key={i}>{columns.map(column => {
          const key = typeof column === 'string' ? column : column.key;
          return <div key={key} className={typeof column !== 'string' && column.optional ? 'workspace-skeleton__optional' : undefined}>
            <SkeletonBone shape={i === 0 ? 'short' : key === 'status' || key === 'actions' ? 'badge' : 'line'} />
            {i > 0 && column === columns[0] && <SkeletonBone shape="short" />}
          </div>
        })}</div>)}
    </div>
    {pagination && <div className="workspace-skeleton__pagination"><SkeletonBone shape="short" /><SkeletonBone shape="badge" /></div>}
  </WorkspaceSkeleton>
}

export function DetailSkeleton({ form = false, history = false, single = false, heading = true }: {
  form?: boolean; history?: boolean; single?: boolean; heading?: boolean;
}) {
  return <WorkspaceSkeleton variant="detail" label="Đang tải chi tiết hồ sơ…">
    {heading && <div className="workspace-skeleton__detail-heading"><SkeletonBone shape="value" /><SkeletonBone shape="badge" /></div>}
    <div className={`workspace-skeleton__details${single ? ' workspace-skeleton__details--single' : ''}`}>
      <div className="workspace-skeleton__panel">
        <SkeletonBone shape="short" />
        <div className="workspace-skeleton__facts">{Array.from({ length: 6 }, (_, i) => <div key={i}><SkeletonBone shape="short" /><SkeletonBone /></div>)}</div>
        {single && form && <div className="workspace-skeleton__form"><SkeletonBone shape="short" /><SkeletonBone shape="field" /><SkeletonBone shape="field" /></div>}
        {history && <div className="workspace-skeleton__form"><SkeletonBone shape="short" /><SkeletonBone /></div>}
      </div>
      {!single && <div className="workspace-skeleton__panel workspace-skeleton__form"><SkeletonBone shape="short" />
        {form ? <><SkeletonBone shape="field" /><SkeletonBone shape="field" /></> : <><SkeletonBone /><SkeletonBone shape="badge" /></>}
      </div>}
    </div>
  </WorkspaceSkeleton>
}
