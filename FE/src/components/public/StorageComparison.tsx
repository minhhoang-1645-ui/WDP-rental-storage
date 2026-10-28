import { useEffect, useState, type PropsWithChildren } from 'react'
import { Columns3, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCatalog } from '../../catalog/catalog-context'
import type { StorageListing } from '../../types/storage'
import { StorageImage } from './StorageImage'
import { StorageComparisonContext as Context, comparisonHref, useStorageComparison } from './comparison-context'

const key = 'nestbox-storage-comparison-v1'
export function StorageComparisonProvider({ children }: PropsWithChildren) {
  const { storageListings } = useCatalog()
  const location = useLocation()
  const [saved, setSaved] = useState<string[]>(() => { try { const query = new URLSearchParams(location.search).get('compare'); const value: unknown = query ? query.split(',') : JSON.parse(sessionStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))].slice(0, 3) : [] } catch { return [] } })
  const ids = saved.filter(id => storageListings.some(product => product.id === id))
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(saved)) } catch { /* Selection remains available in this session. */ } }, [saved])
  return <Context.Provider value={{ ids, toggle: id => setSaved(current => { const valid = current.filter(value => storageListings.some(product => product.id === value)); return valid.includes(id) ? valid.filter(value => value !== id) : valid.length < 3 && storageListings.some(product => product.id === id) ? [...valid, id] : valid }), clear: () => setSaved([]) }}>{children}<ComparisonTray /></Context.Provider>
}
export function ComparisonChoice({ product }: { product: StorageListing }) {
  const selection = useStorageComparison()
  const checked = selection.ids.includes(product.id)
  return <label className="storage-compare-choice"><input type="checkbox" aria-label={`So sánh ${product.name}`} checked={checked} disabled={!checked && selection.ids.length >= 3} onChange={() => selection.toggle(product.id)} /><Columns3 size={14} /><span>{checked ? 'Đã chọn so sánh' : 'Thêm vào so sánh'}</span></label>
}
function ComparisonTray() {
  const selection = useStorageComparison(), { storageListings } = useCatalog(), location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const products = selection.ids.map(id => storageListings.find(product => product.id === id)!)
  if (!products.length || !/^\/(?:storage(?:\/|$)|size-guide$)/.test(location.pathname) || new URLSearchParams(location.search).has('compare')) return null
  return <aside className={`storage-comparison-tray${collapsed ? ' is-collapsed' : ''}`} aria-label="Kho đã chọn so sánh"><div className="comparison-tray-top"><strong>So sánh kho ({products.length}/3)</strong><button type="button" onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Mở rộng' : 'Thu gọn'}</button></div>{!collapsed && <div className="comparison-tray-items">{products.map(product => <div key={product.id}><StorageImage src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.code}</small></span><button type="button" aria-label={`Bỏ so sánh ${product.name}`} onClick={() => selection.toggle(product.id)}><X size={16} /></button></div>)}</div>}<div className="comparison-tray-actions">{products.length >= 2 ? <Link className="button-primary" to={comparisonHref(selection.ids, location.search)}>So sánh ngay</Link> : <button className="button-primary" disabled>Chọn thêm 1 kho để so sánh</button>}<button className="portal-text-button" type="button" onClick={selection.clear}>Bỏ chọn tất cả</button></div></aside>
}
