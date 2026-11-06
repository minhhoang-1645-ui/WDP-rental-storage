import { paymentTimeLeft } from '../../utils/payment-state'
import { X } from 'lucide-react'
import { moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import type { OnlinePaymentPollingStatus } from '../../types/payment'
import { useEffect, useState } from 'react'
import type { PendingOnlinePayment } from '../../services/online-payment-session'

export function OnlinePaymentWaiting({ payment, status, networkError, onRetry }: { payment: PendingOnlinePayment; status: OnlinePaymentPollingStatus; networkError: string; onRetry: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const failed = status === 'FAILED'
  return <div className={`vnpay-waiting-panel ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    <span className="vnpay-waiting-icon">{failed ? <X size={23} /> : <span className="customer-spinner" />}</span>
    {!failed && <small>{paymentTimeLeft(payment.expiresAt, now)}. Hết phiên có thể thử lại nếu hóa đơn còn hiệu lực.</small>}
    <div><strong>{failed ? 'Thanh toán VNPay không thành công' : 'Đang chờ VNPay xác nhận'}</strong><span>{payment.invoiceCode} · {moneyLabel(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</span>{networkError && !failed && <small>{networkError} Hệ thống sẽ tự thử lại.</small>}</div>
    {!failed && payment.paymentUrl && (() => { try { const url = new URL(payment.paymentUrl); return url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(url.hostname) && !url.username && !url.password ? <a className="button-secondary" href={url.href} target="_blank" rel="noopener noreferrer">Mở lại VNPay</a> : null } catch { return null } })()}
    {failed && <button type="button" className="button-secondary" onClick={onRetry}>Thử thanh toán lại</button>}
  </div>
}

