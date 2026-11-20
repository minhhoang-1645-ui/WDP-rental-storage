import { date, first, label, object, rows, type Row } from '../../components/manager/portal-data';
import { staffDay } from '../staff/staff-resources';

export function unitLocation(unit: Row) {
  return [first(unit, 'floor'), unit.zone && `Khu ${unit.zone}`, unit.row && `Hàng ${unit.row}`, unit.position && `Ô ${unit.position}`].filter(Boolean).join(' · ');
}

export function unitBookingSummary(unit: Row) {
  const current = object(unit.currentAllocation ?? object(unit.allocationSummary).current);
  if (first(current, 'id', 'reservationReference', 'customer.fullName')) return 'Có phân bổ hiện tại';
  const next = rows(unit.futureAllocations ?? object(unit.allocationSummary).future)[0];
  if (next?.startDate) return `Có lịch từ ${date(next.startDate)}`;
  return '';
}

export function allocationDisplay(allocation: Row, occupied = false, today = staffDay(Date.now())) {
  if (allocation.releasedAt) return { status: 'COMPLETED', text: 'Đã giải phóng' };
  const contractStatus = first(allocation, 'contract.status');
  if (['COMPLETED', 'CANCELLED'].includes(contractStatus)) return { status: contractStatus, text: 'Đã kết thúc' };
  const reservationStatus = first(allocation, 'reservationStatus');
  if (reservationStatus && reservationStatus !== 'CONFIRMED') return { status: reservationStatus, text: label(reservationStatus) };
  const start = first(allocation, 'startDate').slice(0, 10);
  const end = first(allocation, 'endDate').slice(0, 10);
  if (contractStatus === 'ACTIVE' || occupied) return end && end <= today
    ? { status: 'OVERDUE', text: 'Quá hạn · chưa trả' } : { status: 'ACTIVE', text: 'Đang hiệu lực' };
  if (start > today) return { status: 'RESERVED', text: 'Sắp bắt đầu' };
  if (end && end <= today) return { status: 'COMPLETED', text: 'Đã kết thúc' };
  return { status: 'RESERVED', text: 'Đang giữ' };
}
