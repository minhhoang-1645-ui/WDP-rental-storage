import { isItemUnit } from './item-units';
import type { StockDraftLine, StockLine, StoredItem, StockMovement } from '../types/stock';

const countFormat = new Intl.NumberFormat('vi-VN');

export function stockLineSummary(lines: StockLine[], completed: boolean) {
  if (lines.length === 0) return '';
  const [first] = lines;
  const quantity = (line: StockLine) => completed ? line.actualQty : line.requestedQty;
  const firstQuantity = quantity(first);
  const name = firstQuantity == null ? first.storedItem.name : `${first.storedItem.name} · ${countFormat.format(firstQuantity)} ${first.storedItem.unit}`;
  if (lines.length === 1) return name;
  const amounts = lines.map(quantity);
  if (first.storedItem.unit && lines.every(line => line.storedItem.unit === first.storedItem.unit)
    && amounts.every(amount => amount != null)) {
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    return `${lines.length} mặt hàng · ${countFormat.format(total)} ${first.storedItem.unit}`;
  }
  return `${name} (+${lines.length - 1} mặt hàng)`;
}

export function stockMovementLocation(row: StockMovement) {
  if (row.status === 'COMPLETED') {
    if (row.storageUnitAtCompletion?.unitNumber) return { unit: row.storageUnitAtCompletion, label: 'Kho khi giao nhận' };
    if (row.storageUnit?.unitNumber) return { unit: row.storageUnit, label: 'Kho lúc yêu cầu' };
    return { unit: row.currentStorageUnit, label: 'Kho hiện tại' };
  }
  if (row.currentStorageUnit?.unitNumber) return { unit: row.currentStorageUnit, label: 'Kho' };
  return { unit: row.storageUnit, label: 'Kho lúc yêu cầu' };
}

export const stockQuantity = (value: unknown) => typeof value === 'string' && value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 1000000;
export function stockSchedule(value: string) {
  if (!value) return undefined;
  const local = value.replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Ngày giờ phải có dạng YYYY-MM-DD HH:mm (UTC+7).');
  const time = Date.parse(`${local}+07:00`);
  if (!Number.isFinite(time) || new Date(time + 25200000).toISOString().slice(0, 16) !== local) throw new Error('Ngày giờ dự kiến không hợp lệ.');
  return new Date(time).toISOString();
}
export function stockCreateInput(contractId: string, type: 'IN' | 'OUT', lines: StockDraftLine[], items: StoredItem[], scheduledAt: string, note: string) {
  if (!contractId) throw new Error('Chọn hợp đồng đang hoạt động.');
  if (!lines.length || lines.length > 100) throw new Error('Phiếu cần từ 1 đến 100 dòng hàng.');
  const seen = new Set<string>();
  const parsed = lines.map((line, index) => {
    if (!stockQuantity(line.quantity)) throw new Error(`Dòng ${index + 1}: số lượng phải là số nguyên từ 1 đến 1.000.000.`);
    const quantity = Number(line.quantity), item = items.find(value => value.id === line.storedItemId);
    if (line.storedItemId) {
      if (!item || (item.rentalContract && item.rentalContract.id !== contractId)) throw new Error(`Dòng ${index + 1}: mặt hàng không thuộc hợp đồng đã chọn.`);
      if (seen.has(item.id)) throw new Error('Mỗi mặt hàng chỉ được xuất hiện một lần trong phiếu.');
      seen.add(item.id);
      if (type === 'OUT' && quantity > item.balance) throw new Error(`Dòng ${index + 1}: số lượng xuất vượt tồn hiện tại (${item.balance}).`);
    } else if (type === 'OUT' || !line.name.trim() || !line.unit.trim()) throw new Error(`Dòng ${index + 1}: chọn mặt hàng hoặc nhập tên và đơn vị hàng mới.`);
    if (!item && !isItemUnit(line.unit.trim())) throw new Error('Chọn đơn vị hàng mới trong danh mục.');
    return { ...(item ? { storedItemId: item.id } : { name: line.name.trim(), unit: line.unit.trim() }), quantity, ...(line.note.trim() ? { note: line.note.trim() } : {}) };
  });
  return { rentalContractId: contractId, type, lines: parsed, scheduledAt: stockSchedule(scheduledAt), ...(note.trim() ? { note: note.trim() } : {}) };
}
export function stockCompleteInput(row: StockMovement, quantities: Record<string, string>, note: string) {
  if (!row.lines.length) throw new Error('Phiếu không có dòng hàng.');
  return { note: note.trim() || undefined, lines: row.lines.map(line => {
    const raw = quantities[line.id];
    if (typeof raw !== 'string' || !raw.trim() || !Number.isSafeInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 1000000) throw new Error(`Nhập số lượng thực tế của ${line.storedItem.name}, từ 0 đến 1.000.000.`);
    const actualQty = Number(raw);
    if (actualQty !== line.requestedQty && !note.trim()) throw new Error('Cần ghi chú lý do chênh lệch số lượng kiểm đếm.');
    if (row.type === 'OUT' && (line.storedItem.balance == null || actualQty > line.storedItem.balance)) throw new Error(`Không đủ dữ liệu tồn hoặc số lượng tồn của ${line.storedItem.name}. Tải lại để kiểm tra.`);
    return { lineId: line.id, actualQty };
  }) };
}
