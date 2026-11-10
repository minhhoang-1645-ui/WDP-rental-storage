export const serviceUnits = ['cái', 'thùng', 'cuộn', 'bộ', 'xe', 'túi', 'hộp', 'kiện', 'tấm', 'đôi', 'gói'] as const;
export function servicePriceBasis(service: { physicalUnit?: string | null; billingUnit: string }) {
  const unit = service.physicalUnit || 'đơn vị chưa thiết lập';
  return service.billingUnit === 'ONE_TIME' ? `/${unit} · mua một lần` : `/${unit}/${service.billingUnit === 'DAY' ? 'ngày' : 'tháng'}`;
}
