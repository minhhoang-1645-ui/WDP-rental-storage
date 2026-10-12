import { AlertCircle, CheckCircle2, Clock3, CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { customerBillingApi } from '../../services/billing'
import type { VnpayReturnResult } from '../../types/payment'

export function CustomerVnpayReturnPage() {
  const location = useLocation()
  const query = location.search.slice(1)
  const [result, setResult] = useState<VnpayReturnResult>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!query) {
      return
    }
    const controller = new AbortController()
    customerBillingApi.vnpayReturn(query, controller.signal)
      .then((value) => { setResult(value); setError('') })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không kiểm tra được kết quả VNPay.') })
    return () => controller.abort()
  }, [query, attempt])

  useEffect(() => {
    if (!result?.valid || result.transaction.status !== 'PENDING' || attempt >= 15) return
    const timer = window.setTimeout(() => setAttempt((value) => value + 1), 2000)
    return () => window.clearTimeout(timer)
  }, [result, attempt])

  const displayedResult: VnpayReturnResult | undefined = query ? result : { valid: false, status: 'NOT_FOUND' }
  const content = (() => {
    if (error) return { icon: <AlertCircle size={38} />, tone: 'is-error', title: 'Chưa kiểm tra được giao dịch', description: error }
    if (!displayedResult) return { icon: <span className="customer-spinner" />, tone: 'is-pending', title: 'Đang kiểm tra thanh toán', description: 'WDP đang đối chiếu kết quả trả về từ VNPay.' }
    if (!displayedResult.valid) return { icon: <AlertCircle size={38} />, tone: 'is-error', title: 'Kết quả thanh toán không hợp lệ', description: displayedResult.status === 'INVALID_SIGNATURE' ? 'Chữ ký trả về từ VNPay không hợp lệ.' : 'Không tìm thấy giao dịch thanh toán tương ứng.' }
    if (displayedResult.transaction.status === 'SUCCESS') return { icon: <CheckCircle2 size={38} />, tone: 'is-success', title: 'Thanh toán thành công', description: `Hóa đơn ${displayedResult.invoice.invoiceCode} đã ghi nhận ${moneyLabel(displayedResult.transaction.amount)}.` }
    if (displayedResult.transaction.status === 'FAILED' || displayedResult.transaction.status === 'CANCELLED') return { icon: <AlertCircle size={38} />, tone: 'is-error', title: displayedResult.transaction.status === 'CANCELLED' ? 'Đã hủy thanh toán' : 'Thanh toán không thành công', description: 'Hóa đơn chưa được ghi nhận thanh toán. Bạn có thể quay lại và thử lại.' }
    return { icon: <Clock3 size={38} />, tone: 'is-pending', title: 'Đang chờ VNPay xác nhận', description: 'Trang đang tự kiểm tra trạng thái chính thức từ hệ thống. Vui lòng chờ trong giây lát.' }
  })()

  return <section className="customer-page vnpay-return-page"><div className={`vnpay-return-card ${content.tone}`}>
    <span className="vnpay-return-icon">{content.icon}</span>
    <p className="eyebrow">Thanh toán VNPay</p>
    <h1>{content.title}</h1>
    <p>{content.description}</p>
    {displayedResult?.valid && <dl><div><dt>Mã giao dịch</dt><dd>{displayedResult.transaction.merchantOrderRef}</dd></div><div><dt>Số tiền</dt><dd>{moneyLabel(displayedResult.transaction.amount)}</dd></div><div><dt>Hóa đơn</dt><dd>{displayedResult.invoice.invoiceCode}</dd></div></dl>}
    <Link className="button-primary" to="/customer/payments"><CreditCard size={17} /> Xem hóa đơn và thanh toán</Link>
  </div></section>
}
