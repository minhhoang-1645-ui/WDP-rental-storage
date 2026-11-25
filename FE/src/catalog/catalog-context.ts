import { createContext, useContext } from 'react'
import type { StorageListing, StorageSize } from '../types/storage'
import type { AdditionalService } from '../types/additional-service'

export interface PublicFacility {
  id: string
  name: string
  address: string
  bookingEnabled: boolean
  officeHours?: string
  accessHours?: string
}

export interface Catalog {
  products: StorageListing[]
  sizes: StorageSize[]
  approvedDurations: number[]
  addons: AdditionalService[]
  facilities?: PublicFacility[]
}

export const CatalogContext = createContext<Catalog | null>(null)

export function useCatalog() {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('CatalogProvider is required')
  return {
    ...catalog,
    storageListings: catalog.products,
    storageSizes: catalog.sizes,
    facilities: catalog.facilities ?? [],
    getFacility: (id?: string) => catalog.facilities?.find(facility => facility.id === id),
    approvedAddons: catalog.addons,
    bookingSizes: catalog.sizes.map(size => ({ ...size, products: catalog.products.filter(product => product.sizeId === size.id) })).filter(size => size.products.length > 0),
    getStorageListing: (id: string | null | undefined) => catalog.products.find(item => item.id === id),
    getStorageSize: (id: string | null | undefined) => catalog.sizes.find(item => item.id === id),
  }
}
