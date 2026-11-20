import { moneyLabel } from './CustomerPortalHelpers';
export interface EarlyReturnFinancialDecision { policy?: string; disposition?: 'KEEP' | 'WAIVE_UNUSED'; reason?: string; waivedAmount?: number; appliedAt?: string; requestedDate?: string }
export function EarlyReturnFinancialNotice({ review }: { review?: EarlyReturnFinancialDecision | null }) {
  return <div className="customer-inline-notice early-return-financial-notice">
    <strong>Quyết toán khi trả trước hạn</strong>
    <p>Bạn thanh toán các kỳ đã sử dụng và kỳ hiện tại. Các kỳ chưa bắt đầu sẽ được miễn sau khi hoàn tất trả kho.</p>
    {review?.appliedAt && Boolean(review.waivedAmount) && <p>Đã miễn {moneyLabel(review.waivedAmount!)}. {review.reason}</p>}
    <small>Tiền trả trước và tiền cọc được quyết toán riêng.</small>
  </div>;
}
