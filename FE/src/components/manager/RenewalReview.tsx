import { date, first, label, money, object, rows, type Row } from './portal-data'
import { Facts, Status } from './PortalUi'

export function RenewalReview({ row, showContracts = true, audience = 'internal' }: { row: Row; showContracts?: boolean; audience?: 'internal' | 'customer' }) {
  const quote = object(row.quoteSnapshot), reservation = object(row.reservation), appendix = object(row.appendix)
  const firstInvoice = rows(row.invoices ?? object(row.billingSummary).invoices).find(invoice => Number(invoice.renewalCycle) === 1)
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
      ['Hóa đơn gia hạn kỳ đầu', first(firstInvoice ?? {}, 'invoiceCode') || 'Chưa lập hóa đơn'], ['Khoản cần thanh toán kỳ đầu', money(firstInvoice?.totalAmount)],
      ['Mã phụ lục', first(appendix, 'code') || 'Lập sau khi chấp thuận'], ['Phiên bản phụ lục', first(appendix, 'version') || '—'],
      ['Xác nhận phụ lục', appendix.acceptedAt ? `${appendix.signatureImage ? 'Đã ký vẽ' : 'Đã xác nhận'} · ${first(appendix, 'acceptanceName')} · ${date(appendix.acceptedAt, true)}` : 'Chưa ký'],
      ['Người yêu cầu', first(row, 'requestedBy.fullName') || first(row, 'customer.fullName') || '—'], ['Ngày yêu cầu', date(row.requestedAt, true)],
      ['Người xét duyệt', first(row, 'reviewedBy.fullName') || (row.reviewedAt || row.approvedAt || row.rejectedAt ? row.approvedAt && !row.rejectedAt && Object.hasOwn(row, 'reviewedBy') && row.reviewedBy === null ? 'Hệ thống tự động' : 'Hồ sơ chưa cung cấp tên người xét duyệt' : 'Chưa xét duyệt')], ['Ngày xét duyệt', date(row.reviewedAt || row.approvedAt || row.rejectedAt, true)],
    ]} />
    <p className="manager-action-copy">{audience === 'customer' ? 'Sau khi được duyệt, bạn đọc và ký phụ lục rồi thanh toán hóa đơn gia hạn.' : 'Chấp thuận sẽ lập phụ lục và hóa đơn. Khách phải ký phụ lục trước khi thanh toán.'} {row.paymentPlan === 'PREPAID' ? 'Trả trước: thanh toán đủ hóa đơn gia hạn để cập nhật thời hạn.' : 'Hàng tháng: thanh toán đủ hóa đơn kỳ đầu để cập nhật thời hạn; các hóa đơn kỳ sau vẫn có thể còn dư nợ.'} Không thu cọc lần nữa cho kỳ gia hạn.</p>
    {showContracts && rows(row.contracts).length > 0 && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Hợp đồng</th><th>Kho</th><th>Hạn đang ghi nhận</th><th>Trạng thái</th></tr></thead><tbody>{rows(row.contracts).map((contract, index) => <tr key={`${first(contract, 'contractCode')}:${index}`}><td>{first(contract, 'contractCode')}</td><td>{first(contract, 'unitCode', 'unit.unitCode', 'storageUnit.unitCode')}</td><td>{date(contract.endDate)}</td><td><Status value={contract.status} /></td></tr>)}</tbody></table></div>}
    {row.status === 'COMPLETED' && <p className="booking-alert">{audience === 'customer' ? 'Gia hạn của bạn đã hoàn tất. Vui lòng đối chiếu thời hạn mới và các khoản thanh toán trong hồ sơ kho đang thuê.' : (appendix.code ? 'Phụ lục liên kết được ghi ở trên. Đối chiếu bản đã ký và thời hạn mới; bảng tổng hợp này không thay thế tài liệu đã ký.' : 'Hồ sơ cũ chưa có phụ lục liên kết. Cần đối chiếu tài liệu trước khi xác nhận đủ hồ sơ.')}</p>}
  </section>
}
