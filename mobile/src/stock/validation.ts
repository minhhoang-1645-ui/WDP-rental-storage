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
    return { ...(item ? { storedItemId: item.id } : { name: line.name.trim(), unit: line.unit.trim() }), quantity, ...(line.note.trim() ? { note: line.note.trim() } : {}) };
  });
  return { rentalContractId: contractId, type, lines: parsed, scheduledAt: stockSchedule(scheduledAt), ...(note.trim() ? { note: note.trim() } : {}) };
}
export function stockCompleteInput(row: StockMovement, quantities: Record<string, string>, note: string) {
  if (!row.lines.length) throw new Error('Phiếu không có dòng hàng.');
  return { note: note.trim() || undefined, lines: row.lines.map(line => {
    const raw = quantities[line.id];
    if (!stockQuantity(raw)) throw new Error(`Số lượng thực tế của ${line.storedItem.name} phải là số nguyên từ 1 đến 1.000.000.`);
    const actualQty = Number(raw);
    if (row.type === 'OUT' && actualQty > line.storedItem.balance) throw new Error(`Không đủ tồn của ${line.storedItem.name}. Tải lại để kiểm tra số lượng mới nhất.`);
    return { lineId: line.id, actualQty };
  }) };
}

