import { Facts } from './PortalUi';
import { label, money, object, rows, first, type Row } from './portal-data';

/** Display saved backend pricing; never recalculate installments from catalog prices. */
export function ManagerPricingExplanation({ quote }: { quote: Row }) {
  const initial = object(quote.initialPaymentBreakdown);
  return <section className="manager-section">
    <h2>Báo giá đã lưu · toàn bộ kỳ thuê</h2>
    <Facts items={[
      ['Hình thức thanh toán', label(quote.paymentPlan)],
      ['Thời hạn', quote.billingMode === 'DAILY' ? `${quote.billableDays} ngày` : typeof quote.termMonths === 'number' ? `${quote.termMonths} tháng` : 'Chưa có dữ liệu'],
      ['Giá niêm yết / tháng / kho', money(quote.monthlyUnitPrice)],
      ['Tiền thuê trước giảm giá', money(quote.baseRentalAmount)],
      [`Giảm giá${typeof quote.discountPercent === 'number' ? ` (${quote.discountPercent}%)` : ''}`, money(quote.discountAmount)],
      ['Tiền thuê toàn kỳ sau giảm giá', money(quote.rentalAmount)],
      ['Tiền cọc (theo điều kiện hoàn cọc)', money(quote.depositAmount)],
      ['Dịch vụ mua một lần · toàn kỳ', money(quote.purchaseAddOnAmount)],
      ['Dịch vụ thuê ngày/tháng · toàn kỳ', money(quote.rentalAddOnAmount)],
      ['Tổng thanh toán cả kỳ gồm cọc', money(quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal)],
    ]} />
    {Object.keys(initial).length ? <><h3>Khoản thanh toán lần đầu theo báo giá</h3><Facts items={[
      ['Tiền thuê kỳ đầu', money(initial.rentalAmount)], ['Cọc thu lần đầu', money(initial.depositAmount)],
      ['Mua dịch vụ lần đầu', money(initial.purchaseAddOnAmount)], ['Thuê dịch vụ kỳ đầu', money(initial.rentalAddOnAmount)],
      ['Tổng lần đầu', money(initial.totalAmount)], ['Dự kiến các kỳ tiếp theo', money(initial.remainingAmount)],
    ]} /></> : <p className="manager-action-copy">Snapshot cũ chưa có phân tách lần đầu/các kỳ sau. Đối chiếu hóa đơn, không suy ra số tiền phải trả ngay từ tổng cả kỳ.</p>}
    <p className="manager-action-copy">Các khoản trên lấy từ snapshot BE. Số còn phải trả hiện tại nằm trên từng hóa đơn; tổng cả kỳ gồm cọc không phải toàn bộ chi phí không hoàn lại.</p>
    <details><summary>Chi tiết cách tính đã lưu</summary>{rows(quote.lineItems).map((item, index) => <div className="portal-quote-line" key={`${first(item, 'code')}:${index}`}><span>{first(item, 'label')}<small>{first(item, 'basis')}</small></span><strong>{money(item.amount)}</strong></div>)}</details>
  </section>;
}
