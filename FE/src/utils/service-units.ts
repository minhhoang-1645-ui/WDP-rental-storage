const purchaseUnits = ['cái', 'thùng', 'cuộn', 'bộ', 'túi', 'hộp', 'kiện', 'tấm', 'đôi', 'gói'];
const rentalUnits = ['cái', 'bộ', 'xe'];
export const serviceUnits = (kind: 'PURCHASE' | 'RENTAL') => kind === 'RENTAL' ? rentalUnits : purchaseUnits;
export function servicePriceBasis(service: { physicalUnit?: string | null; billingUnit: string }) {
  const unit = service.physicalUnit || 'đơn vị chưa thiết lập';
  return service.billingUnit === 'ONE_TIME' ? `/${unit} · mua một lần` : `/${unit}/${service.billingUnit === 'DAY' ? 'ngày' : 'tháng'}`;
}
