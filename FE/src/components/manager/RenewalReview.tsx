import { date, first, label, money, object, rows, type Row } from './portal-data'
import { Facts, Status } from './PortalUi'

export function RenewalReview({ row, showContracts = true, audience = 'internal' }: { row: Row; showContracts?: boolean; audience?: 'internal' | 'customer' }) {
  const quote = object(row.quoteSnapshot), reservation = object(row.reservation)
  return <section className="manager-section renewal-review" aria-label="Thông tin đối chiếu gia hạn">
    <h2>{audience === 'customer' ? 'Chi tiết gia hạn của bạn' : 'Thông tin đối chiếu gia hạn'}</h2>
    <Facts items={[
      ['Mã gia hạn', first(row, 'renewalCode')], ['Yêu cầu đặt kho', first(reservation, 'reference')],
      ['Khách hàng', first(row, 'customer.fullName', 'requestedBy.fullName') || '—'], ['Email liên hệ', first(row, 'customer.email', 'requestedBy.email') || '—'],
      ['Loại kho', first(reservation, 'storageType.name')], ['Số lượng kho', String(reservation.quantity ?? '—')],
      ['Hạn trước gia hạn (không bao gồm)', date(row.previousEndDate)], ['Gia hạn đến (không bao gồm)', date(row.requestedEndDate)],
      ['Số tháng gia hạn', String(row.termMonths ?? '—')], ['Kế hoạch thanh toán', label(row.paymentPlan)],
      ['Đơn giá tháng / kho', money(quote.monthlyUnitPrice)], ['Tiền thuê trước giảm', money(quote.baseRentalAmount)],
      ['Tỷ lệ giảm', typeof quote.discountPercent === 'number' ? `${quote.discountPercent}%` : '—'], ['Tiền giảm', money(quote.discountAmount)],
      ['Tiền thuê gia hạn', money(quote.rentalAmount)], ['Cọc thu thêm', money(quote.depositAmount)], ['Tổng giá trị gia hạn', money(quote.totalAmount)],
      ['Đã lập hóa đơn', money(object(row.billingSummary).totalInvoiced)], ['Đã thanh toán', money(object(row.billingSummary).totalPaid)], ['Dư nợ hóa đơn gia hạn', money(object(row.billingSummary).totalOutstanding)],
      ['Người yêu cầu', first(row, 'requestedBy.fullName') || first(row, 'customer.fullName') || '—'], ['Ngày yêu cầu', date(row.requestedAt, true)],
      ['Người xét duyệt', first(row, 'reviewedBy.fullName') || (row.reviewedAt || row.approvedAt || row.rejectedAt ? 'Hồ sơ chưa cung cấp tên người xét duyệt' : 'Chưa xét duyệt')], ['Ngày xét duyệt', date(row.reviewedAt || row.approvedAt || row.rejectedAt, true)],
    ]} />
    <p className="manager-action-copy">{audience === 'customer' ? 'Sau khi yêu cầu được duyệt, hóa đơn gia hạn sẽ xuất hiện trong Thanh toán.' : 'Duyệt tạo hóa đơn gia hạn.'} {row.paymentPlan === 'PREPAID' ? 'Trả trước: thanh toán đủ hóa đơn gia hạn để cập nhật thời hạn.' : 'Hàng tháng: thanh toán đủ hóa đơn kỳ đầu để cập nhật thời hạn; các hóa đơn kỳ sau vẫn có thể còn dư nợ.'} Không thu cọc lần nữa cho kỳ gia hạn.</p>
    {showContracts && rows(row.contracts).length > 0 && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Hợp đồng</th><th>Kho</th><th>Hạn đang ghi nhận</th><th>Trạng thái</th></tr></thead><tbody>{rows(row.contracts).map((contract, index) => <tr key={`${first(contract, 'contractCode')}:${index}`}><td>{first(contract, 'contractCode')}</td><td>{first(contract, 'unitCode', 'unit.unitCode', 'storageUnit.unitCode')}</td><td>{date(contract.endDate)}</td><td><Status value={contract.status} /></td></tr>)}</tbody></table></div>}
    {row.status === 'COMPLETED' && <p className="booking-alert">{audience === 'customer' ? 'Gia hạn của bạn đã hoàn tất. Vui lòng đối chiếu thời hạn mới và các khoản thanh toán trong hồ sơ kho đang thuê.' : 'Có thể dùng các thông tin trên để đối chiếu khi lập phụ lục. Hồ sơ này chưa chứa số phụ lục, phiên bản hoặc chữ ký; bản in không phải phụ lục đã ký.'}</p>}
  </section>
}
