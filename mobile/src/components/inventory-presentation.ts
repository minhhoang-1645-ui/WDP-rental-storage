import { text, type Row } from '@/operations/model';
import type { StockMovement } from '@/stock/types';
import { formatDate } from '@/utils/format';

export const inventoryBlue = '#155ED8';

export const movementStatus = {
  REQUESTED: { label: 'Đã gửi', tone: 'amber', description: 'NestBox đã nhận yêu cầu. Phiếu đang chờ nhân viên tiếp nhận.' },
  ASSIGNED: { label: 'Đã tiếp nhận', tone: 'blue', description: 'Phiếu đã có nhân viên phụ trách giao nhận.' },
  COMPLETED: { label: 'Hoàn tất', tone: 'green', description: 'Hàng đã được giao nhận và kiểm đếm.' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray', description: 'Phiếu đã hủy và số lượng hàng đang lưu không thay đổi.' },
} as const satisfies Record<StockMovement['status'], { label: string; tone: string; description: string }>;

export function warehouseName(contract: Row) {
  const code = text(contract, 'storageUnit.unitNumber', 'storageUnit.unitCode', 'reservationUnit.storageUnit.unitNumber');
  const name = text(contract, 'storageType.name');
  return [name, code].filter(Boolean).join(' · ') || text(contract, 'contractCode') || 'Kho thuê';
}

export function warehousePeriod(contract: Row) {
  const start = text(contract, 'startDate');
  const end = text(contract, 'endDate');
  return [start && formatDate(start), end && formatDate(end)].filter(Boolean).join(' – ');
}

export function movementWarehouse(ticket: StockMovement) {
  return (ticket.status === 'COMPLETED' ? ticket.storageUnitAtCompletion?.unitNumber : undefined)
    || ticket.storageUnit?.unitNumber || '';
}
