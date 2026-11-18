import type { StockLine } from '../../types/stock';

export function StockReconciliation({ lines, quantities, onQuantityChange, movementType = 'IN' }: {
  lines: StockLine[]; quantities?: Record<string, string>; onQuantityChange?: (id: string, value: string) => void; movementType?: 'IN' | 'OUT';
}) {
  return <div className="stock-reconciliation" aria-label="Đối chiếu hàng hóa">{lines.map(line => {
    const draft = quantities?.[line.id];
    const actual = onQuantityChange ? draft?.trim() ? Number(draft) : null : line.actualQty;
    const difference = actual == null ? null : actual - line.requestedQty;
    return <article className="stock-item-review" key={line.id}>
      <header><div><h3>{line.storedItem.name}</h3><small>{line.storedItem.itemCode}</small></div><span className="stock-item-unit">Đơn vị: {line.storedItem.unit}</span></header>
      <div className="stock-item-counts">
        <div><span>Khách yêu cầu</span><strong>{line.requestedQty} <small>{line.storedItem.unit}</small></strong></div>
        <div><span>Thực tế giao nhận</span><strong>{line.actualQty == null ? 'Chưa kiểm đếm' : `${line.actualQty} ${line.storedItem.unit}`}</strong></div>
        <div><span>Đang lưu hiện tại</span><strong>{line.storedItem.balance} <small>{line.storedItem.unit}</small></strong></div>
      </div>
      {onQuantityChange && <div className="stock-count-editor"><label className="field-label">Số lượng thực tế · {line.storedItem.name}<input required type="number" min={0} max={movementType === 'OUT' ? Math.min(1000000, line.storedItem.balance) : 1000000} step={1} inputMode="numeric" value={draft ?? ''} onChange={event => onQuantityChange(line.id, event.target.value)} /></label><p>{difference == null ? 'Nhập số lượng đã kiểm đếm tại kho.' : difference === 0 ? 'Khớp với số lượng yêu cầu.' : `Chênh lệch ${difference > 0 ? '+' : ''}${difference} ${line.storedItem.unit}. Cần ghi rõ lý do.`}</p></div>}
      {!onQuantityChange && difference !== null && difference !== 0 && <p className="stock-item-difference">Chênh lệch: {difference > 0 ? '+' : ''}{difference} {line.storedItem.unit}</p>}
      {line.note && <p className="stock-item-note">Ghi chú: {line.note}</p>}
    </article>;
  })}</div>;
}
