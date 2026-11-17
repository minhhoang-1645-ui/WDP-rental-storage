import { moneyLabel } from './CustomerPortalHelpers';
export interface EarlyReturnFinancialDecision { disposition: 'KEEP' | 'WAIVE_UNUSED'; reason: string; waivedAmount: number; appliedAt?: string }
export function EarlyReturnFinancialNotice({ review }: { review?: EarlyReturnFinancialDecision | null }) {
  return <div className="customer-inline-notice early-return-financial-notice">
    <strong>Thanh toán đủ trước khi trả kho</strong>
    <p>Trả trước hạn và trả đúng hạn đều phải thanh toán đủ toàn bộ công nợ theo các hóa đơn còn hiệu lực, gồm các kỳ đã cam kết nhưng chưa đến hạn.</p>
    <p>Chấp thuận đề nghị trả sớm xác nhận thời điểm trả; bạn vẫn cần tất toán trước khi gửi yêu cầu trả kho và được nhân viên nhận lại kho.</p>
    {review?.appliedAt && review.waivedAmount > 0 && <p>Điều chỉnh lịch sử trước quy định hiện tại: đã miễn {moneyLabel(review.waivedAmount)}. {review.reason}</p>}
    <small>Tiền cọc được đối soát riêng sau khi nhân viên kiểm tra và nhận trả kho.</small>
  </div>;
}
