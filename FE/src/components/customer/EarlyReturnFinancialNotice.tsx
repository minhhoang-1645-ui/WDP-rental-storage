import { moneyLabel } from './CustomerPortalHelpers';
export interface EarlyReturnFinancialDecision { disposition: 'KEEP' | 'WAIVE_UNUSED'; reason: string; waivedAmount: number; appliedAt?: string }
export function EarlyReturnFinancialNotice({ review }: { review?: EarlyReturnFinancialDecision | null }) {
  return <div className="customer-inline-notice early-return-financial-notice">
    <strong>Thanh toán đủ trước khi trả kho</strong>
    <p>Bạn cần trả đủ các hóa đơn còn hiệu lực, kể cả tiền thuê các kỳ đã cam kết chưa đến hạn.</p>
    <p>Được duyệt trả sớm không có nghĩa là được miễn tiền thuê. Hãy thanh toán đủ trước khi gửi yêu cầu trả kho.</p>
    {review?.appliedAt && review.waivedAmount > 0 && <p>Điều chỉnh lịch sử trước quy định hiện tại: đã miễn {moneyLabel(review.waivedAmount)}. {review.reason}</p>}
    <small>Tiền cọc được xử lý sau khi nhân viên kiểm tra và nhận lại kho.</small>
  </div>;
}
