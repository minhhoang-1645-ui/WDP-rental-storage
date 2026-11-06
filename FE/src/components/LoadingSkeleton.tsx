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
