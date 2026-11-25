import { money } from '../../components/manager/portal-data';
export type Bounds = { min: number; max: number };
export type PriceRange = { facilityId: string; sizeId: string; value: Bounds | null; status: string; effectiveFrom: string };
export function priceRangeFor(ranges: PriceRange[], facilityId: unknown, sizeId: unknown) {
  const matching = ranges.filter(range => range.facilityId === facilityId && range.sizeId === sizeId);
  return { current: matching.find(range => range.status === 'EFFECTIVE')?.value,
    scheduled: matching.find(range => range.status === 'SCHEDULED' && range.value) };
}
export const priceRangeLabel = (range: Bounds) => money(range.min) + ' – ' + money(range.max) + ' / tháng';
export function priceRangeNotice(range: PriceRange) {
  if (!range.value) return '';
  const date = new Date(range.effectiveFrom).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
  return 'Khung chờ hiệu lực · ' + priceRangeLabel(range.value) + ' · ' + date + ' (UTC+7)';
}
export function priceState(range: Bounds | null | undefined, value: unknown) {
  if (!range) return 'Chưa có khung giá';
  const price = Number(value);
  return Number.isSafeInteger(price) && price > 0 && range.min <= price && price <= range.max ? 'Hợp lệ' : 'Cần điều chỉnh';
}
