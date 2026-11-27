import { date, first, label, object, rows, type Row } from '../../components/manager/portal-data';
import { staffDay } from '../staff/staff-resources';
import { metersFromCm } from './inventory-dimensions';

export function unitLocation(unit: Row) {
  return [first(unit, 'floor'), unit.zone && `Khu ${unit.zone}`, unit.row && `Hàng ${unit.row}`, unit.position && `Ô ${unit.position}`].filter(Boolean).join(' · ');
}

export function unitBookingSummary(unit: Row) {
  const next = rows(unit.futureAllocations ?? object(unit.allocationSummary).future)[0];
  if (next?.startDate) return `Có lịch thuê từ ${date(next.startDate)}`;
  return '';
}

const unitStatusDescriptions: Record<string, string> = {
  AVAILABLE: 'Cần kiểm tra khả dụng theo kỳ thuê.',
  RESERVED: 'Đã giữ cho một nghiệp vụ, chưa đưa vào sử dụng.',
  OCCUPIED: 'Đã bàn giao và đang được sử dụng.',
  MAINTENANCE: 'Kho đang được bảo trì.',
};

export function unitStatusDescription(unit: Row) {
  return unitStatusDescriptions[first(unit, 'status')] ?? '';
}

const areaFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });
const volumeFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 });

export function unitMeasurements(unit: Row) {
  const { widthCm, lengthCm, heightCm } = object(unit.dimensions);
  const validCm = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  const hasFloor = validCm(widthCm) && validCm(lengthCm);
  const hasVolume = hasFloor && validCm(heightCm);
  return {
    dimensions: hasVolume ? `${metersFromCm(widthCm)} × ${metersFromCm(lengthCm)} × ${metersFromCm(heightCm)} m` : '—',
    area: hasFloor ? `${areaFormat.format(widthCm * lengthCm / 10_000)} m²` : '—',
    volume: hasVolume ? `${volumeFormat.format(widthCm * lengthCm * heightCm / 1_000_000)} m³` : '—',
  };
}

export function allocationDisplay(allocation: Row, occupied = false, today = staffDay(Date.now())) {
  if (allocation.releasedAt) return { status: 'COMPLETED', text: 'Đã giải phóng' };
  const contractStatus = first(allocation, 'contract.status');
  if (['COMPLETED', 'CANCELLED'].includes(contractStatus)) return { status: contractStatus, text: 'Đã kết thúc' };
  const reservationStatus = first(allocation, 'reservationStatus');
  if (reservationStatus && reservationStatus !== 'CONFIRMED') return { status: reservationStatus, text: label(reservationStatus) };
  const start = first(allocation, 'startDate').slice(0, 10);
  const end = first(allocation, 'endDate').slice(0, 10);
  if (contractStatus === 'ACTIVE' || occupied) return end && end < today
    ? { status: 'OVERDUE', text: 'Quá hạn · chưa trả' } : { status: 'ACTIVE', text: end === today ? 'Đến hạn hôm nay' : 'Đang hiệu lực' };
  if (start > today) return { status: 'RESERVED', text: 'Sắp bắt đầu' };
  if (end && end <= today) return { status: 'COMPLETED', text: 'Đã kết thúc' };
  return { status: 'RESERVED', text: 'Đang giữ' };
}
