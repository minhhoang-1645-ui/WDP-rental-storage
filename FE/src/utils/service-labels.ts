// Translate only known seeded labels; keep names deliberately edited by the operator.
const serviceNames: Record<string, [string, string]> = {
  PADLOCK_DISC: ['Disc Padlock', 'Khóa đĩa'], PADLOCK_COMBINATION: ['Combination Padlock', 'Khóa mật mã'],
  BOX_SMALL: ['Small Moving Box', 'Thùng carton nhỏ'], BOX_MEDIUM: ['Medium Moving Box', 'Thùng carton vừa'], BOX_LARGE: ['Large Moving Box', 'Thùng carton lớn'],
  PACKING_TAPE: ['Packing Tape', 'Băng keo đóng thùng'], BUBBLE_WRAP: ['Bubble Wrap', 'Màng xốp bọc hàng'], STRETCH_WRAP: ['Stretch Wrap', 'Màng quấn hàng'],
  PACKING_PAPER: ['Packing Paper', 'Giấy đóng gói'], MOVING_ROPE: ['Moving Rope / Tie Down', 'Dây cố định hàng'], WORK_GLOVES: ['Moving Gloves', 'Găng tay vận chuyển'],
  UTILITY_DOLLY: ['Utility Dolly / Hand Truck', 'Xe đẩy hàng'], FURNITURE_DOLLY: ['Furniture Dolly', 'Xe đẩy nội thất'], APPLIANCE_DOLLY: ['Appliance Dolly', 'Xe đẩy thiết bị'],
  FURNITURE_PAD: ['Furniture Pad / Moving Blanket', 'Chăn bọc bảo vệ nội thất'], SHELF_STANDARD: ['Storage Shelf', 'Kệ lưu trữ'], DEHUMIDIFIER: ['Dehumidifier', 'Máy hút ẩm'],
};
export function serviceDisplayName(code: string, name: string) {
  const known = serviceNames[code.replace(/^service-/, '')] ?? (!code ? Object.values(serviceNames).find(([original]) => original.toLowerCase() === name.trim().toLowerCase()) : undefined);
  return known && name.trim().toLowerCase() === known[0].toLowerCase() ? known[1] : name;
}
/** Rate is per purchased item/device AND per billing period, never transport labour. */
export function serviceRateUnit(service: { kind: string; billingUnit: string }) {
  return service.kind === 'PURCHASE' ? 'sản phẩm · mua một lần' : service.billingUnit === 'DAY' ? 'thiết bị / ngày' : service.billingUnit === 'MONTH' ? 'thiết bị / tháng lịch' : 'Chưa xác định đơn vị';
}
export function localizeService<T extends { code: string; name: string; description?: string | null }>(item: T): T {
  return { ...item, name: serviceDisplayName(item.code, item.name), ...(item.description ? { description: item.description.replace(/\bunit\b/gi, 'kho').replace(/\badd-on\b/gi, 'dịch vụ bổ sung') } : {}) };
}
