import { first, date, money, object, type Row } from './portal-data';

export function EarlyReturnFinanceFields({ item }: { item: Row }) {
  const amount = object(item.financialSummary).outstandingAmount;
  const outstanding = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
  return <section className="early-return-finance-review" aria-label="Điều kiện thanh toán trước khi trả kho">
    <h3>Thanh toán đủ trước khi trả kho</h3>
    <p>Khách cần trả đủ các hóa đơn còn hiệu lực, kể cả kỳ đã cam kết chưa đến hạn. Duyệt trả sớm chỉ xác nhận thời điểm trả, không miễn tiền thuê.</p>
    <p>Còn phải thanh toán: <strong>{outstanding === null ? 'Chưa xác định' : money(outstanding)}</strong>.</p>
    <p>{outstanding === null ? 'Cần đối chiếu đầy đủ dữ liệu hóa đơn trước khi xác nhận điều kiện trả kho.' : outstanding > 0 ? 'Khách cần trả đủ số tiền còn thiếu trước khi gửi yêu cầu và bàn giao lại kho.' : 'Khách đã trả đủ các hóa đơn hiện có. Nhân viên cần kiểm tra hàng hóa, nhận lại kho và chìa khóa.'}</p>
  </section>;
}

export function EarlyReturnFinanceReview({ item }: { item: Row }) {
  if (item.decision !== 'APPROVED') return null;
  const waivedAmount = Number(first(item, 'financialReview.waivedAmount'));
  return <section className="early-return-finance-review">
    <EarlyReturnFinanceFields item={item} />
    {Boolean(item.physicallyReturnedAt) && <p>Nhân viên đã nhận trả kho lúc {date(item.physicallyReturnedAt, true)}.</p>}
    {waivedAmount > 0 && Boolean(first(item, 'financialReview.appliedAt')) && <p>Điều chỉnh lịch sử trước quy định hiện tại: đã miễn <strong>{money(waivedAmount)}</strong>. Xem các hóa đơn đã hủy và lý do trong lịch sử thanh toán.</p>}
  </section>;
}
