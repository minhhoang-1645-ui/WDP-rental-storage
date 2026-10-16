import type { AdditionalService, ServiceSelection } from '../types/additional-service'

export function validServiceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function serviceCalendarMonths(start: string, end: string): number | null {
  if (!validServiceDate(start) || !validServiceDate(end)) return null
  const first = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`)
  const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth()
  if (months < 1) return null
  const expected = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + months, 1))
  expected.setUTCDate(Math.min(first.getUTCDate(), new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth() + 1, 0)).getUTCDate()))
  return expected.toISOString().slice(0, 10) === end ? months : null
}

export function serviceSelectionIssue(service: AdditionalService | undefined, selection: ServiceSelection, rentalStart: string, rentalEnd: string): string {
  if (!service) return 'Dịch vụ không còn trong danh mục. Vui lòng chọn lại.'
  if (service.isActive === false || !Number.isSafeInteger(service.unitPrice) || Number(service.unitPrice) <= 0) return 'Dịch vụ chưa có giá hợp lệ hoặc đã ngừng hoạt động. Vui lòng bỏ chọn dịch vụ này.'
  if (!Number.isSafeInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 100) return 'Số lượng dịch vụ phải là số nguyên từ 1 đến 100.'
  if (service.kind === 'PURCHASE') return service.billingUnit === 'ONE_TIME' ? '' : 'Dịch vụ mua phải tính theo lần.'
  if (!['DAY', 'MONTH'].includes(service.billingUnit)) return 'Dịch vụ thuê phải tính theo ngày hoặc tháng.'
  const start = selection.serviceStartDate ?? '', end = selection.serviceEndDate ?? ''
  if (!validServiceDate(start) || !validServiceDate(end) || !validServiceDate(rentalStart) || !validServiceDate(rentalEnd)) return 'Chọn đầy đủ ngày sử dụng dịch vụ và kỳ thuê kho.'
  if (end <= start) return 'Ngày kết thúc dịch vụ phải sau ngày bắt đầu; không tính ngày kết thúc.'
  if (start < rentalStart || end > rentalEnd) return 'Thời gian dịch vụ phải nằm trong kỳ thuê kho. Vui lòng cập nhật lại ngày sử dụng.'
  if (service.billingUnit === 'MONTH' && serviceCalendarMonths(start, end) === null) return 'Dịch vụ theo tháng cần đủ số tháng lịch, không quy đổi 30 ngày thành một tháng.'
  return ''
}

export function serviceBillingBasis(service: AdditionalService, selection: ServiceSelection): string {
  if (service.billingUnit === 'ONE_TIME') return `Đơn giá × ${selection.quantity} sản phẩm; tính một lần, không nhân số ngày thuê kho.`
  const start = selection.serviceStartDate ?? '', end = selection.serviceEndDate ?? ''
  if (!validServiceDate(start) || !validServiceDate(end) || end <= start) return ''
  const units = service.billingUnit === 'DAY' ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 : serviceCalendarMonths(start, end)
  return units === null ? '' : `Đơn giá × ${selection.quantity} thiết bị × ${units} ${service.billingUnit === 'DAY' ? 'ngày' : 'tháng lịch'}. Không tính ngày kết thúc. Tổng tiền lấy từ báo giá hệ thống.`
}
