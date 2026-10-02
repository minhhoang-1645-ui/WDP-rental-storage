import { storageListings, storageSizes } from '../storage/storage.catalog.js';

export type StorageSizeId = 'locker' | 'small' | 'medium' | 'large';
export type StorageCondition = 'standard' | 'climate';

export interface BookingProduct {
  id: string;
  code: string;
  name: string;
  sizeId: StorageSizeId;
  condition: StorageCondition;
  status: 'available' | 'limited';
  dimensions: string;
  floorArea: string;
  volume: string;
}

export const bookingProducts: BookingProduct[] = storageListings.map(product => {
  const size = storageSizes.find(size => size.id === product.sizeId)!;
  return { ...product, dimensions: size.dimensions, floorArea: size.floorArea, volume: size.volume };
});
