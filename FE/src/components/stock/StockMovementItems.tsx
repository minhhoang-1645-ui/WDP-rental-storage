import type { StockMovement } from '../../types/stock';

export function StockMovementItems({ movement, compact = false }: { movement: StockMovement; compact?: boolean }) {
  return <section className={`stock-movement-items${compact ? ' is-compact' : ''}`} aria-label="Hàng hóa trong phiếu">
    {!compact && <h3>Hàng hóa trong phiếu · {movement.lines.length} mặt hàng</h3>}
    <ul>{movement.lines.map(line => <li key={line.id}>
      <span><strong>{line.storedItem.name}</strong>{!compact && <small>{line.storedItem.itemCode}</small>}</span>
      <span className="stock-movement-item-quantity">{movement.status === 'COMPLETED'
        ? <><strong>{line.actualQty == null ? 'Chưa ghi nhận thực tế' : `${line.actualQty} ${line.storedItem.unit}`}</strong>{!compact && <small>Thực tế {movement.type === 'IN' ? 'đã nhập' : 'đã xuất'} · Yêu cầu {line.requestedQty} {line.storedItem.unit}</small>}</>
        : <><strong>{line.requestedQty} {line.storedItem.unit}</strong>{!compact && <small>Số lượng yêu cầu</small>}</>}
      </span>
    </li>)}</ul>
  </section>;
}
