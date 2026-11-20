import { isItemUnit } from './item-units';
import type { StockDraftLine, StoredItem, StockMovement } from './types';

export const stockQuantity = (value: unknown) => typeof value === 'string' && value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 1000000;
export function stockSchedule(value: string) {
  if (!value) return undefined;
  const local = value.replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Ngày giờ phải có dạng YYYY-MM-DD HH:mm (UTC+7).');
  const time = Date.parse(`${local}+07:00`);
  if (!Number.isFinite(time) || new Date(time + 25200000).toISOString().slice(0, 16) !== local) throw new Error('Ngày giờ dự kiến không hợp lệ.');
  return new Date(time).toISOString();
}
export function validateStockSchedule(scheduledAt: string | undefined, contract: { startDate?: unknown; endDate?: unknown }, now = Date.now(), type: 'IN' | 'OUT' = 'IN') {
  if (!scheduledAt) return;
  const time = Date.parse(scheduledAt);
  if (time <= now) throw new Error('Lịch dự kiến phải ở tương lai.');
  const start = typeof contract.startDate === 'string' ? Date.parse(contract.startDate.slice(0, 10) + 'T00:00:00+07:00') : NaN;
  const end = typeof contract.endDate === 'string' ? Date.parse(contract.endDate.slice(0, 10) + 'T00:00:00+07:00') : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Chưa đọc được kỳ thuê. Tải lại hợp đồng hoặc bỏ trống lịch dự kiến.');
  if (time < start || (type === 'IN' && time >= end)) throw new Error(type === 'IN' ? 'Chọn giờ trong kỳ thuê của kho này.' : 'Chọn giờ từ ngày bắt đầu thuê.');
}

export type StockLineIssues = Partial<Record<'name' | 'unit' | 'quantity', string>>;

export function stockLineIssues(contractId: string, type: 'IN' | 'OUT', lines: StockDraftLine[], items: StoredItem[], existing: Record<string, boolean> = {}) {
  const seen = new Set<string>();
  const available = new Map(items.map(item => [item.id, item]));
  return lines.map((line): StockLineIssues => {
    const issues: StockLineIssues = {};
    const item = available.get(line.storedItemId);
    if (!stockQuantity(line.quantity)) issues.quantity = 'Nhập số nguyên từ 1 đến 1.000.000.';
    if (line.storedItemId) {
      if (!item || (item.rentalContract && item.rentalContract.id !== contractId)) issues.name = 'Mặt hàng không thuộc hợp đồng đã chọn.';
      else if (seen.has(item.id)) issues.name = 'Mỗi mặt hàng chỉ được xuất hiện một lần trong phiếu.';
      else {
        seen.add(item.id);
        if (type === 'OUT' && !issues.quantity && Number(line.quantity) > item.balance) issues.quantity = 'Số lượng xuất vượt tồn hiện tại (' + item.balance + ' ' + item.unit + ').';
      }
    } else if (type === 'OUT' || existing[line.key]) issues.name = 'Chọn hàng đang lưu.';
    else {
      if (!line.name.trim()) issues.name = 'Nhập tên hàng.';
      if (!isItemUnit(line.unit.trim())) issues.unit = 'Chọn đơn vị hàng mới trong danh mục.';
    }
    return issues;
  });
}

export function stockCreateInput(contractId: string, type: 'IN' | 'OUT', lines: StockDraftLine[], items: StoredItem[], scheduledAt: string, note: string) {
  if (!contractId) throw new Error('Chọn hợp đồng đang hoạt động.');
  if (!lines.length || lines.length > 100) throw new Error('Phiếu cần từ 1 đến 100 dòng hàng.');
  const issues = stockLineIssues(contractId, type, lines, items);
  const invalid = issues.findIndex(issue => issue.name || issue.unit || issue.quantity);
  if (invalid >= 0) throw new Error(`Dòng ${invalid + 1}: ${Object.values(issues[invalid]).join(' ')}`);
  if (lines.reduce((sum, line) => sum + (line.photos?.length ?? 0), 0) > 3) throw new Error('Mỗi phiếu được đính kèm tối đa 3 ảnh.');
  const parsed = lines.map(line => {
    const quantity = Number(line.quantity), item = items.find(value => value.id === line.storedItemId);
    return { ...(item ? { storedItemId: item.id } : { name: line.name.trim(), unit: line.unit.trim() }), quantity, ...(line.photos?.length ? { photos: line.photos } : {}), ...(line.note.trim() ? { note: line.note.trim() } : {}) };
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
    if (row.type === 'OUT' && actualQty > line.storedItem.balance) throw new Error(`Không đủ tồn của ${line.storedItem.name}. Tải lại để kiểm tra số lượng mới nhất.`);
    return { lineId: line.id, actualQty };
  }) };
}

