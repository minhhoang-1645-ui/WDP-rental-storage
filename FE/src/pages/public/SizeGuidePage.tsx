import { ArrowRight, Check, Info } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { StorageSizeVisual } from '../../components/public/StorageSizeVisual'
import { ButtonLink } from '../../components/ui/ButtonLink'
import { Container } from '../../components/ui/Container'
import { useCatalog } from '../../catalog/catalog-context'

export function SizeGuidePage() {
  const { getStorageSize, storageSizes } = useCatalog()
  const [params, setParams] = useSearchParams()
  const selected = getStorageSize(params.get('size')) ?? storageSizes[1]
  const choose = (id: string) => setParams({ size: id }, { replace: true })
  return <>
    <section className="border-b border-border bg-white py-16 sm:py-20"><Container><p className="eyebrow">Hướng dẫn kích thước</p><h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Hình dung kho bằng những món đồ bạn đang có.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate">Chọn một nhóm bên dưới. Hình minh họa, kích thước và sức chứa sẽ cập nhật ngay. Các con số là ước tính; cách xếp đồ thực tế có thể thay đổi.</p></Container></section>
    <section className="section-space"><Container><div className="grid gap-10 lg:grid-cols-[270px_1fr]"><aside><p className="mb-4 text-sm font-bold text-slate">Chọn nhóm kích thước</p><div className="grid grid-cols-2 gap-2 lg:grid-cols-1">{storageSizes.map(size => <button key={size.id} type="button" onClick={() => choose(size.id)} aria-pressed={selected.id === size.id} className={`size-selector ${selected.id === size.id ? 'size-selector-active' : ''}`}><span>{size.name}</span><small>{size.floorArea} · {size.volume}</small></button>)}</div><div className="mt-6 flex gap-3 border-t border-border pt-5 text-sm leading-6 text-slate"><Info className="mt-1 shrink-0" size={18} /><p>Nên chừa một lối nhỏ để lấy đồ và cân nhắc tăng một cỡ nếu có nội thất khó xếp chồng.</p></div></aside><div><StorageSizeVisual size={selected} /><div className="mt-8 grid gap-8 md:grid-cols-[1fr_.9fr]"><div><p className="eyebrow">{selected.kicker}</p><h2 className="mt-3 text-3xl font-bold">{selected.name}</h2><p className="mt-3 text-lg text-slate">{selected.roomEquivalent}</p><dl className="mt-7 grid grid-cols-2 gap-4"><div className="data-block"><dt>Kích thước</dt><dd>{selected.dimensions}</dd></div><div className="data-block"><dt>Thể tích</dt><dd>{selected.volume}</dd></div><div className="data-block"><dt>Sức chứa</dt><dd>{selected.boxCount}</dd></div><div className="data-block"><dt>Ước tính</dt><dd>{selected.capacity}</dd></div></dl></div><div className="border-l border-border pl-0 md:pl-8"><h3 className="font-semibold">Phù hợp để lưu trữ</h3><ul className="mt-4 space-y-3 text-slate">{selected.suitableItems.map(item => <li key={item}><Check size={17} /> {item}</li>)}</ul><ButtonLink className="mt-7" to={`/storage?size=${selected.id}&type=all&duration=3`}>Xem kho {selected.name.toLowerCase()} <ArrowRight size={17} /></ButtonLink></div></div></div></div></Container></section>
    <section className="border-y border-border bg-white py-12"><Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-semibold">Vẫn phân vân giữa hai kích thước?</h2><p className="mt-2 text-slate">Chọn cỡ lớn hơn nếu bạn cần lối đi hoặc dự kiến bổ sung đồ trong thời gian thuê.</p></div><ButtonLink to="/storage" variant="secondary">Xem tất cả kho</ButtonLink></Container></section>
  </>
}
