import { lazy, Suspense } from 'react'
import { ArrowRight, Box, Boxes, Check, Cuboid, Info, Ruler, ScanLine } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ButtonLink } from '../../components/ui/ButtonLink'
import { Container } from '../../components/ui/Container'
import { useCatalog } from '../../catalog/catalog-context'
import type { StorageSizeId } from '../../types/storage'

const Storage3DViewer = lazy(() => import('../../components/public/StorageArchitecturalViewer'))

const categoryNumbers: Record<StorageSizeId, string> = {
  locker: '01',
  small: '02',
  medium: '03',
  large: '04',
}

function ViewerPlaceholder({ image, name }: { image: string, name: string }) {
  return <div className="viewer-module-placeholder" aria-label={`Đang tải mô phỏng ${name}`}>
    <img src={image} alt="" />
    <div><span />Đang tải mô phỏng 3D...</div>
  </div>
}

export function SizeGuidePage() {
  const { getStorageSize, storageSizes } = useCatalog()
  const [params, setParams] = useSearchParams()
  const selected = getStorageSize(params.get('size')) ?? storageSizes[1]
  const choose = (id: StorageSizeId) => setParams({ size: id }, { replace: true })

  return <>
    <section className="size-guide-intro">
      <Container>
        <div className="max-w-3xl">
          <p className="eyebrow">Hướng dẫn kích thước</p>
          <h1>Tìm kích thước kho phù hợp.</h1>
          <p>So sánh bốn lựa chọn bằng không gian thật và những món đồ quen thuộc. Chọn một kích thước để xem cách sắp xếp, sức chứa ước tính và kho đang phù hợp với nhu cầu của bạn.</p>
        </div>
      </Container>
    </section>

    <section className="size-guide-main">
      <Container>
        <div className="size-guide-workspace">
          <aside className="size-guide-selector" aria-label="Chọn kích thước kho">
            <div className="selector-heading">
              <span>4 lựa chọn</span>
              <h2>Chọn không gian</h2>
              <p>Mỗi mô phỏng dùng đúng kích thước đang hiển thị trên danh sách kho.</p>
            </div>
            <div className="size-guide-tabs" role="tablist" aria-label="Nhóm kích thước kho">
              {storageSizes.map(size => <button
                key={size.id}
                type="button"
                role="tab"
                aria-selected={selected.id === size.id}
                aria-controls="size-visualisation"
                tabIndex={selected.id === size.id ? 0 : -1}
                className={selected.id === size.id ? 'is-active' : ''}
                onClick={() => choose(size.id)}
              >
                <span className="selector-number">{categoryNumbers[size.id]}</span>
                <span className="selector-copy"><strong>{size.name}</strong><small>{size.dimensions}</small></span>
                <span className="selector-measure">{size.floorArea}</span>
              </button>)}
            </div>
            <div className="selector-note"><Info size={17} /><p>Cần lấy đồ thường xuyên? Hãy chừa lối đi và cân nhắc tăng một cỡ.</p></div>
          </aside>

          <div className="size-guide-stage">
            <div className="stage-heading">
              <div>
                <p>{selected.kicker}</p>
                <h2>{selected.name}</h2>
              </div>
              <div className="stage-dimension"><Ruler size={18} /><span>Kích thước phủ bì</span><strong>{selected.dimensions}</strong></div>
            </div>
            <Suspense fallback={<ViewerPlaceholder image={selected.image} name={selected.name} />}>
              <Storage3DViewer key={selected.id} size={selected} />
            </Suspense>
          </div>
        </div>

        <div className="size-guide-details" aria-live="polite">
          <div className="size-metrics">
            <div><Ruler size={21} /><span>Kích thước</span><strong>{selected.dimensions}</strong></div>
            <div><ScanLine size={21} /><span>Diện tích sàn</span><strong>{selected.floorArea}</strong></div>
            <div><Cuboid size={21} /><span>Thể tích</span><strong>{selected.volume}</strong></div>
            <div><Boxes size={21} /><span>Sức chứa thùng</span><strong>{selected.boxCount}</strong></div>
          </div>

          <div className="capacity-layout">
            <div className="capacity-summary">
              <p className="eyebrow">Khả năng lưu trữ</p>
              <h2>{selected.roomEquivalent}</h2>
              <p>{selected.capacity}. Mô phỏng thể hiện một cách sắp xếp tham khảo; sức chứa thực tế phụ thuộc vào hình dáng đồ đạc và khoảng trống bạn dành cho lối đi.</p>
            </div>
            <div className="suitable-items">
              <h3><Box size={20} /> Phù hợp để lưu trữ</h3>
              <ul>{selected.suitableItems.map(item => <li key={item}><Check size={17} />{item}</li>)}</ul>
              <ButtonLink to={`/storage?size=${selected.id}&type=all&duration=3`}>Xem kho phù hợp <ArrowRight size={17} /></ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>

    <section className="size-guide-advice">
      <Container className="advice-layout">
        <div><p className="eyebrow">Trước khi quyết định</p><h2>Đo món đồ lớn nhất, rồi tính chỗ cho lối đi.</h2></div>
        <div className="advice-points">
          <p><strong>Ưu tiên chiều dài.</strong><span>Nệm, sofa và kệ dài thường quyết định kích thước kho trước số lượng thùng.</span></p>
          <p><strong>Đừng xếp kín 100%.</strong><span>Chừa khoảng trống giúp bạn lấy đồ mà không phải dỡ toàn bộ kho.</span></p>
          <p><strong>Thể tích là ước tính.</strong><span>Các số m³ được tính trực tiếp từ ba chiều đã công bố của từng loại kho.</span></p>
        </div>
      </Container>
    </section>
  </>
}

