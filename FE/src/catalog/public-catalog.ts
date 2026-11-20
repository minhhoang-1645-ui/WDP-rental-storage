import type { Catalog } from './catalog-context'
import type { StorageListing } from '../types/storage'

function fixtureImage(value: string) {
  try { return new URL(value).hostname.endsWith('.test') } catch { return false }
}

/** Match IDs created by this repository's integration suites, never ordinary product names. */
export function isFixtureProduct(product: Pick<StorageListing, 'id' | 'image'>) {
  return /^(?:appointment|billing|settlement|contract|overdue|return|maintenance|manager|renew|test)-product-[0-9a-f]{8}$/i.test(product.id) && fixtureImage(product.image)
}

export function publicCatalog(catalog: Catalog): Catalog {
  const products = catalog.products.filter(product => !isFixtureProduct(product))
  const sizes = catalog.sizes.filter(size => products.some(product => product.sizeId === size.id)).map(size => {
    if (!fixtureImage(size.image)) return size
    const product = products.find(product => product.sizeId === size.id)!
    // The API groups using the first row, which can be a leftover test fixture.
    // Use real product dimensions, without inventing capacity counts.
    return { ...size, image: product.image, dimensions: product.dimensions || size.dimensions, floorArea: product.floorArea || size.floorArea, volume: product.volume || size.volume, kicker: 'Chọn theo kích thước thực tế', roomEquivalent: 'Tham khảo thông số từng loại kho trước khi chọn.', capacity: 'Sức chứa phụ thuộc kích thước đồ và cách sắp xếp.', boxCount: 'Đối chiếu với danh sách đồ cần gửi', suitableItems: [] }
  })
  return { ...catalog, products, sizes }
}
