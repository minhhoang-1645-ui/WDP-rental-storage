import { AlertCircle, CheckCircle2, Clock3, CreditCard } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { moneyLabel } from '../../components/customer/CustomerPortalHelpers'
import { customerBillingApi } from '../../services/billing'
import { readPendingOnlinePayments, removePendingOnlinePayment } from '../../services/online-payment-session'
import type { OnlinePaymentStatusResult } from '../../types/payment'

export function CustomerVnpayReturnPage() {
  const location = useLocation()
  return <ReturnResult key={location.search} query={location.search.slice(1)} />
}

function ReturnResult({ query }: { query: string }) {
  const { user } = useAuth()
  const directTransactionId = useMemo(() => new URLSearchParams(query).get('transactionId')?.trim() ?? '', [query])
  const [transactionIdentity, setTransactionIdentity] = useState(directTransactionId)
  const [result, setResult] = useState<OnlinePaymentStatusResult>()
  const [fatalError, setFatalError] = useState('')
  const [networkError, setNetworkError] = useState('')
  const [retry, setRetry] = useState(0)
  const missingTransaction = !directTransactionId && !query
  const displayedFatalError = fatalError || (missingTransaction ? 'Không tìm thấy thông tin giao dịch VNPay.' : '')

  useEffect(() => {
    if (directTransactionId) return
    if (!query) return
    const controller = new AbortController()
    customerBillingApi.vnpayReturn(query, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        if (!value.valid) {
          setFatalError(value.status === 'INVALID_SIGNATURE' ? 'Chữ ký trả về từ VNPay không hợp lệ.' : 'Không tìm thấy giao dịch thanh toán tương ứng.')
          return
        }
        setTransactionIdentity(value.transaction.merchantOrderRef)
      })
      .catch((caught) => { if (!controller.signal.aborted) setNetworkError(caught instanceof Error ? caught.message : 'Không kiểm tra được dữ liệu trả về từ VNPay.') })
    return () => controller.abort()
  }, [query, directTransactionId, retry])

  useEffect(() => {
    if (!transactionIdentity || displayedFatalError) return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      try {
        const value = await customerBillingApi.onlinePaymentStatus(transactionIdentity, controller.signal)
        if (stopped) return
        setResult(value)
        setNetworkError('')
        if (value.status === 'SUCCESS' && value.invoice.status === 'PAID') {
          const pending = user ? readPendingOnlinePayments(user.id).find((item) => item.transactionId === value.transactionId || item.merchantOrderRef === value.merchantOrderRef) : undefined
          if (pending) removePendingOnlinePayment(pending)
          return
        }
        if (value.status === 'FAILED') return
      } catch (caught) {
        if (!stopped && !controller.signal.aborted) setNetworkError(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái thanh toán.')
      }
      if (!stopped) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer) }
  }, [transactionIdentity, displayedFatalError, user])

  const successful = result?.status === 'SUCCESS' && result.invoice.status === 'PAID'
  const failed = result?.status === 'FAILED'
  const content = displayedFatalError
    ? { icon: <AlertCircle size={38} />, tone: 'is-error', title: 'Kết quả thanh toán không hợp lệ', description: displayedFatalError }
    : successful
      ? { icon: <CheckCircle2 size={38} />, tone: 'is-success', title: 'Thanh toán thành công', description: `Hóa đơn ${result.invoice.invoiceCode} đã ghi nhận ${moneyLabel(result.amount)}.` }
      : failed
        ? { icon: <AlertCircle size={38} />, tone: 'is-error', title: 'Thanh toán không thành công', description: 'Hóa đơn chưa được ghi nhận thanh toán. Bạn có thể quay lại và thử lại.' }
        : { icon: <Clock3 size={38} />, tone: 'is-pending', title: 'Đang chờ VNPay xác nhận', description: 'WDP đang kiểm tra kết quả từ VNPay. Bạn chỉ cần thanh toán một lần; kết quả và hóa đơn sẽ được cập nhật sau khi giao dịch được xác nhận.' }

  return <section className="customer-page vnpay-return-page"><div className={`vnpay-return-card ${content.tone}`}>
    <span className="vnpay-return-icon">{content.icon}</span>
    <p className="eyebrow">Thanh toán VNPay</p>
    <h1>{content.title}</h1>
    <p>{content.description}</p>
    {networkError && !displayedFatalError && <div className="booking-alert is-error" role="alert">{networkError} Hệ thống sẽ tiếp tục thử lại.</div>}
    {(displayedFatalError || networkError) && <button className="button-secondary" onClick={() => { setFatalError(''); setNetworkError(''); setResult(undefined); setRetry((value) => value + 1) }}>Kiểm tra lại</button>}
    {result && <dl><div><dt>Mã giao dịch</dt><dd>{result.merchantOrderRef}</dd></div><div><dt>Số tiền</dt><dd>{moneyLabel(result.amount)}</dd></div><div><dt>Hóa đơn</dt><dd>{result.invoice.invoiceCode}</dd></div></dl>}
    <Link className="button-primary" to="/customer/payments"><CreditCard size={17} /> Xem hóa đơn và thanh toán</Link>
  </div></section>
}
