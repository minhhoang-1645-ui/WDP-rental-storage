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

const measurements: Record<StorageSizeId, Pick<BookingProduct, 'dimensions' | 'floorArea' | 'volume'>> = {
  locker: { dimensions: '1,0 × 1,0 × 1,2 m', floorArea: '1 m²', volume: 'Khoảng 1,2 m³' },
  small: { dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³' },
  medium: { dimensions: '2,0 × 3,0 × 2,4 m', floorArea: '6 m²', volume: 'Khoảng 14,4 m³' },
  large: { dimensions: '3,0 × 4,0 × 2,4 m', floorArea: '12 m²', volume: 'Khoảng 28,8 m³' },
};

export const bookingProducts: BookingProduct[] = [
  { id: 'lk-a01', code: 'LK-A01', name: 'Tủ lưu trữ A01', sizeId: 'locker', condition: 'standard', status: 'available', ...measurements.locker },
  { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', status: 'available', ...measurements.small },
  { id: 'sm-c08', code: 'SM-C08', name: 'Kho nhỏ C08', sizeId: 'small', condition: 'climate', status: 'limited', ...measurements.small },
  { id: 'md-d04', code: 'MD-D04', name: 'Kho vừa D04', sizeId: 'medium', condition: 'standard', status: 'available', ...measurements.medium },
  { id: 'md-e06', code: 'MD-E06', name: 'Kho vừa E06', sizeId: 'medium', condition: 'climate', status: 'available', ...measurements.medium },
  { id: 'lg-f02', code: 'LG-F02', name: 'Kho lớn F02', sizeId: 'large', condition: 'standard', status: 'limited', ...measurements.large },
];
