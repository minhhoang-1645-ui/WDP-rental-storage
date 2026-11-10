import { paymentTimeLeft } from '../../utils/payment-state'
import { X } from 'lucide-react'
import { moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import type { OnlinePaymentPollingStatus, OnlinePaymentStatusResult } from '../../types/payment'
import { useEffect, useState } from 'react'
import type { PendingOnlinePayment } from '../../services/online-payment-session'

import { vnpayDestination } from '../../utils/vnpay-destination'

export function OnlinePaymentWaiting({ payment, status, reconciliation, providerStatus, networkError, onRelease }: { payment: PendingOnlinePayment; status: OnlinePaymentPollingStatus; reconciliation?: OnlinePaymentStatusResult['reconciliation']; providerStatus?: OnlinePaymentStatusResult['providerStatus']; networkError: string; onRelease: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const failed = status === 'FAILED'
  const resolved = reconciliation?.status === 'RECONCILED'
  const awaitingRefund = reconciliation?.status === 'REFUND_REQUIRED'
  return <div className={`vnpay-waiting-panel ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    <span className="vnpay-waiting-icon">{failed ? <X size={23} /> : <span className="customer-spinner" />}</span>
    {!failed && !reconciliation && <small>{paymentTimeLeft(payment.expiresAt, now)}. Hết phiên có thể thử lại nếu hóa đơn còn hiệu lực.</small>}
    <div><strong>{reconciliation ? resolved ? 'Đã hoàn tất đối soát' : awaitingRefund ? 'Đang chờ hoàn tiền' : 'Giao dịch đang được đối soát' : failed ? providerStatus === 'EXPIRED' ? 'Phiên thanh toán đã hết hạn' : providerStatus === 'CANCELLED' ? 'Bạn đã hủy thanh toán VNPay' : 'Thanh toán VNPay không thành công' : 'Đang chờ VNPay xác nhận'}</strong><span>{payment.invoiceCode} · {moneyLabel(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</span>{networkError && (!failed || reconciliation && !resolved) && <small>{networkError} Hệ thống sẽ tự thử lại.</small>}</div>
    {!failed && !reconciliation && payment.paymentUrl && (() => { try { const url = vnpayDestination(payment.paymentUrl); return <a className="button-secondary" href={url.href} target="_blank" rel="noopener noreferrer">Mở lại VNPay</a> } catch { return null } })()}
    {reconciliation && <div style={{ gridColumn: '1 / -1', minWidth: 0, overflowWrap: 'anywhere' }}><p>Hồ sơ {reconciliation.reconciliationCode}. {resolved ? 'NestBox đã ghi nhận kết quả xử lý. Việc đóng thông báo không tạo thanh toán mới.' : awaitingRefund ? 'NestBox đã xác định khoản tiền cần hoàn lại và sẽ cập nhật khi xác nhận hoàn tiền thực tế; vui lòng không thanh toán lại.' : 'VNPay đã báo thành công nhưng khoản tiền cần được kiểm tra. NestBox đang đối soát; vui lòng không thanh toán lại.'}</p>{reconciliation.resolutionNote && <p>Kết quả từ NestBox: {reconciliation.resolutionNote}</p>}</div>}
    {resolved ? <button type="button" className="button-secondary" style={{ gridColumn: '1 / -1' }} onClick={onRelease}>Đã xem kết quả đối soát</button> : failed && !reconciliation && <button type="button" className="button-secondary" onClick={onRelease}>Thử thanh toán lại</button>}
  </div>
}
