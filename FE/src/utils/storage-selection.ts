import type { StorageListing, StorageSize } from '../types/storage'

export function storageSpecifications(product: StorageListing, group: StorageSize) {
  const customGeometry = Boolean(product.dimensions && product.dimensions !== group.dimensions)
  return { ...group, dimensions: product.dimensions || group.dimensions, floorArea: product.floorArea || group.floorArea, volume: product.volume || group.volume,
    ...(customGeometry ? { roomEquivalent: 'Đối chiếu kích thước riêng của loại kho này', capacity: 'Sức chứa phụ thuộc đồ cần lưu và lối đi', boxCount: 'Đối chiếu theo đồ thực tế', suitableItems: [] } : {}) }
}
export function storageGroupSummary(products: StorageListing[], group: StorageSize) {
  const dimensions = [...new Set(products.map(product => product.dimensions || group.dimensions))]
  return dimensions.length > 1 ? `${products.length} loại kho · Nhiều kích thước trong nhóm` : `${products[0]?.floorArea || group.floorArea} · ${dimensions[0] || group.dimensions}`
}
export function storageBookingHref(product: StorageListing, search = '') {
  const params = new URLSearchParams(search)
  params.set('product', product.id)
  params.set('size', product.sizeId)
  params.set('type', product.condition)
  params.set('step', '1')
  return `/booking?${params}`
}
export function storageMonthlyPrice(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
    : 'Xem báo giá theo kỳ thuê'
}
