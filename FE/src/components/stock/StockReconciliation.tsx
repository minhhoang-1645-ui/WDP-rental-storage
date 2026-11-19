import type { StockLine } from '../../types/stock';

const formatQuantity = (amount: number, unit: string) => `${amount.toLocaleString('vi-VN')} ${unit}`.trim();
const formatBalance = (amount: number | null, unit: string) => amount == null || amount < 0 ? '—' : formatQuantity(amount, unit);

export function StockReconciliation({ lines, quantities, onQuantityChange, movementType = 'IN', compact = false, staffResults = false }: {
  lines: StockLine[]; quantities?: Record<string, string>; onQuantityChange?: (id: string, value: string) => void; movementType?: 'IN' | 'OUT';
  compact?: boolean; staffResults?: boolean;
}) {
  if (compact && !onQuantityChange) {
    if (!lines.length) return <p>Chưa có mặt hàng trong phiếu.</p>;
    const balanceLabel = staffResults ? 'Còn trong kho' : 'Đang lưu';
    return <div className="stock-result-table">
      <table className="manager-table" aria-label="Số lượng hàng giao nhận">
        <thead><tr><th scope="col">Mặt hàng</th><th scope="col">Yêu cầu</th><th scope="col">Thực tế</th><th scope="col">{balanceLabel}</th></tr></thead>
        <tbody>{lines.map(({ id, storedItem, requestedQty, actualQty, note }) => <tr key={id}>
          <th scope="row">{storedItem.name}{!staffResults && <small>Đơn vị: {storedItem.unit}</small>}{note && <small>{note}</small>}</th>
          <td data-label="Yêu cầu">{staffResults ? formatQuantity(requestedQty, storedItem.unit) : requestedQty}</td>
          <td data-label="Thực tế">{actualQty == null || actualQty < 0 ? 'Chưa kiểm đếm' : staffResults ? formatQuantity(actualQty, storedItem.unit) : actualQty}
            {staffResults && actualQty != null && actualQty !== requestedQty && <small>
              Chênh lệch {Math.abs(actualQty - requestedQty)} {storedItem.unit} ({actualQty < requestedQty ? 'thiếu' : 'thừa'}).
            </small>}
          </td>
          <td data-label={balanceLabel}>{staffResults ? formatBalance(storedItem.balance, storedItem.unit) : storedItem.balance}</td>
        </tr>)}</tbody>
      </table>
    </div>;
  }
  return <div className="stock-reconciliation" aria-label="Đối chiếu hàng hóa">{lines.map(line => {
    const draft = quantities?.[line.id];
    const actual = onQuantityChange ? draft?.trim() ? Number(draft) : null : line.actualQty;
    const difference = actual == null ? null : actual - line.requestedQty;
    return <article className="stock-item-review" key={line.id}>
      <header><div><h3>{line.storedItem.name}</h3><small>{line.storedItem.itemCode}</small></div><span className="stock-item-unit">Đơn vị: {line.storedItem.unit}</span></header>
      <div className="stock-item-counts">
        <div><span>Khách yêu cầu</span><strong>{line.requestedQty} <small>{line.storedItem.unit}</small></strong></div>
        <div><span>Thực tế giao nhận</span><strong>{line.actualQty == null ? 'Chưa kiểm đếm' : `${line.actualQty} ${line.storedItem.unit}`}</strong></div>
        <div><span>{staffResults ? 'Còn trong kho' : 'Đang lưu hiện tại'}</span><strong>{formatBalance(line.storedItem.balance, line.storedItem.unit)}</strong></div>
      </div>
      {onQuantityChange && <div className="stock-count-editor"><label className="field-label">Số lượng thực tế · {line.storedItem.name}<input required type="number" min={0} max={movementType === 'OUT' ? Math.max(0, Math.min(1000000, line.storedItem.balance ?? 0)) : 1000000} step={1} inputMode="numeric" value={draft ?? ''} onChange={event => onQuantityChange(line.id, event.target.value)} /></label><p>{difference == null ? 'Nhập số lượng đã kiểm đếm tại kho.' : difference === 0 ? 'Khớp với số lượng yêu cầu.' : `Chênh lệch ${difference > 0 ? '+' : ''}${difference} ${line.storedItem.unit}. Cần ghi rõ lý do.`}</p></div>}
      {!onQuantityChange && difference !== null && difference !== 0 && <p className="stock-item-difference">Chênh lệch: {difference > 0 ? '+' : ''}{difference} {line.storedItem.unit}</p>}
      {line.note && <p className="stock-item-note">Ghi chú: {line.note}</p>}
    </article>;
  })}</div>;
}
