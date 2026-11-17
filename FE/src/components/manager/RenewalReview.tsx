import { date, first, label, money, object, rows, type Row } from './portal-data';
import { Facts, Status } from './PortalUi';

export function RenewalReview({ row, showContracts = true, audience = 'internal' }: { row: Row; showContracts?: boolean; audience?: 'internal' | 'customer' }) {
  const quote = object(row.quoteSnapshot), reservation = object(row.reservation), appendix = object(row.appendix), billing = object(row.billingSummary);
  const title = audience === 'customer' ? 'Chi tiết gia hạn của bạn' : 'Thông tin đối chiếu gia hạn';
  const facts: [string, string][] = [
    ...(audience === 'internal' ? [
      ['Khách hàng', first(row, 'customer.fullName', 'requestedBy.fullName') || '—'],
      ['Kho thuê', first(reservation, 'storageType.name') + (reservation.quantity ? ' · ' + reservation.quantity + ' kho' : '')],
    ] as [string, string][] : []),
    ['Gia hạn' + (typeof row.termMonths === 'number' ? ' · ' + row.termMonths + ' tháng' : ''), date(row.previousEndDate) + ' – ' + date(row.requestedEndDate)],
    ['Thanh toán', label(row.paymentPlan)],
    ['Tổng tiền gia hạn', money(quote.totalAmount)],
    ...(typeof quote.discountAmount === 'number' && quote.discountAmount > 0 ? [['Đã giảm' + (typeof quote.discountPercent === 'number' ? ' ' + quote.discountPercent + '%' : ''), money(quote.discountAmount)]] as [string, string][] : []),
    ['Đã thanh toán', typeof billing.totalPaid === 'number' ? money(billing.totalPaid) : 'Chưa có thông tin'],
    ['Còn lại', typeof billing.totalOutstanding === 'number' ? money(billing.totalOutstanding) : 'Chưa có thông tin'],
    ['Phụ lục', appendix.acceptedAt ? 'Đã ký' : appendix.code ? 'Chưa ký' : 'Chưa lập'],
  ];
  return <section className={'manager-section renewal-review renewal-review-compact' + (audience === 'customer' ? ' renewal-review-customer' : '')} aria-label={title}>
    <h2>{title}</h2>
    <Facts items={facts} />
    {first(row, 'rejectionReason', 'reviewNote') && <div className="portal-note"><small>{row.status === 'REJECTED' ? 'Lý do từ chối' : 'Ghi chú duyệt'}</small><p>{first(row, 'rejectionReason', 'reviewNote')}</p></div>}
    {row.status === 'APPROVED_PENDING_PAYMENT' && <p className="manager-action-copy">{appendix.acceptedAt ? 'Chờ thanh toán hóa đơn gia hạn.' : 'Chờ khách ký phụ lục và thanh toán.'}</p>}
    {showContracts && rows(row.contracts).length > 0 && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Hợp đồng</th><th>Kho</th><th>Hạn hiện tại</th><th>Trạng thái</th></tr></thead><tbody>{rows(row.contracts).map((contract, index) => <tr key={first(contract, 'contractCode') + ':' + index}><td>{first(contract, 'contractCode')}</td><td>{first(contract, 'unitCode', 'unit.unitCode', 'storageUnit.unitCode')}</td><td>{date(contract.endDate)}</td><td><Status value={contract.status} /></td></tr>)}</tbody></table></div>}
  </section>;
}
