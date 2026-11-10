/** New stock items use standard counting units; existing items keep their recorded unit. */
export const stockUnits = ['thùng', 'kiện', 'cái', 'bộ', 'túi', 'bao', 'cuộn', 'đôi', 'tấm', 'pallet'] as const;
export const stockUnitOptions = stockUnits.map(value => ({ value, label: value[0].toLocaleUpperCase('vi') + value.slice(1) }));
export const stockHandlingNote = 'Khách hàng tự tổ chức vận chuyển, bốc xếp và sắp xếp đồ trong kho, hoặc thuê đơn vị riêng. Nhân viên kho đối chiếu đúng kho, kiểm đếm và ghi nhận nhập/xuất; không phải người vận chuyển. Phí thuê thiết bị không bao gồm xe vận chuyển hoặc nhân công bốc xếp.';
export function storedLocation(item: { storageUnit?: { unitNumber: string; floor: string | null; zone: string | null } | null }) {
  const unit = item.storageUnit;
  if (!unit) return 'Chưa tải được vị trí kho';
  const floor = unit.floor === 'Ground' ? 'Tầng trệt' : unit.floor;
  return [unit.unitNumber, floor, unit.zone ? `Khu ${unit.zone}` : ''].filter(Boolean).join(' · ');
}
