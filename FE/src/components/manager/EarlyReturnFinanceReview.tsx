import { first, date, money, object, type Row } from './portal-data';

export function EarlyReturnFinanceFields({ item }: { item: Row }) {
  const amount = object(item.financialSummary).outstandingAmount;
  const outstanding = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
  return <section className="early-return-finance-review" aria-label="Điều kiện tất toán công nợ">
    <h3>Thanh toán đủ trước khi trả kho</h3>
    <p>Trả trước hạn và trả đúng hạn đều phải thanh toán đủ toàn bộ hóa đơn còn hiệu lực, gồm các kỳ đã cam kết nhưng chưa đến hạn.</p>
    <p>Công nợ còn phải thanh toán: <strong>{outstanding === null ? 'Chưa xác định' : money(outstanding)}</strong>.</p>
    <p>{outstanding === null ? 'Cần đối chiếu đầy đủ dữ liệu hóa đơn trước khi xác nhận điều kiện trả kho.' : outstanding > 0 ? 'Khách chưa đủ điều kiện gửi yêu cầu trả kho. Nhân viên cũng không thể hoàn tất nhận trả khi còn công nợ.' : 'Đã tất toán công nợ hóa đơn hiện có. Nhân viên vẫn cần kiểm tra hàng hóa và nhận lại kho, chìa khóa theo quy trình.'}</p>
    <p>Chấp thuận đề nghị trả sớm chỉ xác nhận thời điểm trả. Khách cần tất toán công nợ trước khi tạo hồ sơ trả kho.</p>
  </section>;
}

export function EarlyReturnFinanceReview({ item }: { item: Row }) {
  if (item.decision !== 'APPROVED') return null;
  const waivedAmount = Number(first(item, 'financialReview.waivedAmount'));
  return <section className="early-return-finance-review">
    <h3>Công nợ khi trả sớm</h3>
    <EarlyReturnFinanceFields item={item} />
    {Boolean(item.physicallyReturnedAt) && <p>Nhân viên đã nhận trả kho lúc {date(item.physicallyReturnedAt, true)}.</p>}
    {waivedAmount > 0 && Boolean(first(item, 'financialReview.appliedAt')) && <p>Điều chỉnh lịch sử trước quy định hiện tại: đã miễn <strong>{money(waivedAmount)}</strong>. Xem các hóa đơn đã hủy và lý do trong lịch sử thanh toán.</p>}
  </section>;
}
