import type { StorageListing, StorageSize } from '../types/storage'

export function storageSpecifications(product: StorageListing, group: StorageSize) {
  return { ...group, dimensions: product.dimensions || group.dimensions, floorArea: product.floorArea || group.floorArea, volume: product.volume || group.volume }
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
