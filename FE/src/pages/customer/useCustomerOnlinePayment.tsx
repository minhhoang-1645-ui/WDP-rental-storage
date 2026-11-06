import { OnlinePaymentWaiting } from './OnlinePaymentWaiting'
import { useEffect, useRef, useState } from 'react'
import { customerBillingApi } from '../../services/billing'
import { readPendingOnlinePayments, removePendingOnlinePayment, savePendingOnlinePayment, type PendingOnlinePayment } from '../../services/online-payment-session'
import { useNavigate } from 'react-router-dom'
import type { OnlinePaymentPollingStatus } from '../../types/payment'

export function useCustomerOnlinePayment(customerId: string, refreshInvoices: () => void, refreshPayments?: () => void) {
  const navigate = useNavigate()
  const [onlineInvoiceId, setOnlineInvoiceId] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [onlineNotice, setOnlineNotice] = useState('')
  const [pendingOnline, setPendingOnline] = useState<PendingOnlinePayment | null>(() => customerId ? readPendingOnlinePayments(customerId)[0] ?? null : null)
  const [onlineStatus, setOnlineStatus] = useState<OnlinePaymentPollingStatus>('PENDING')
  const [pollError, setPollError] = useState('')
  const onlineLock = useRef(false)
  const onlineKeys = useRef(new Map<string, string>())

  useEffect(() => {
    if (!pendingOnline || onlineStatus !== 'PENDING') return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      try {
        const result = await customerBillingApi.onlinePaymentStatus(pendingOnline.transactionId, controller.signal)
        if (stopped) return
        setPollError('')
        if (result.status === 'SUCCESS' && result.invoice.status === 'PAID') {
          removePendingOnlinePayment(pendingOnline)
          setOnlineStatus('SUCCESS')
          refreshInvoices()
          refreshPayments?.()
          navigate(`/customer/payments/vnpay-return?transactionId=${encodeURIComponent(result.transactionId)}`, { replace: true })
          return
        }
        if (result.providerStatus === 'CANCELLED') {
          removePendingOnlinePayment(pendingOnline)
          onlineKeys.current.delete(pendingOnline.invoiceId)
          setPendingOnline(null)
          setOnlineInvoiceId('')
          setOnlineNotice(`Phiên thanh toán VNPay cho ${pendingOnline.invoiceCode} đã được hủy.`)
          onlineLock.current = false
          refreshInvoices()
          return
        }
        if (result.status === 'FAILED') {
          setOnlineStatus('FAILED')
          onlineLock.current = false
          return
        }
      } catch (caught) {
        if (!stopped && !controller.signal.aborted) setPollError(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái VNPay.')
      }
      if (!stopped) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer) }
  }, [pendingOnline, onlineStatus, navigate, refreshInvoices, refreshPayments])

  const createOnlinePayment = async (invoice: { id: string; invoiceCode: string; type: string }) => {
    if (!customerId || onlineLock.current || pendingOnline || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) { setOnlineError('Trình duyệt đã chặn tab VNPay. Hãy cho phép popup rồi thử lại.'); return }
    paymentWindow.opener = null
    onlineLock.current = true
    setOnlineInvoiceId(invoice.id)
    setOnlineError('')
    setOnlineNotice('')
    const keyIdentity = invoice.id
    let key = onlineKeys.current.get(keyIdentity)
    if (!key) {
      key = `cust-vnpay-${crypto.randomUUID()}`
      onlineKeys.current.set(keyIdentity, key)
    }
    try {
      const transaction = await customerBillingApi.createOnlinePayment(invoice.id, key)
      const destination = new URL(transaction.paymentUrl)
      if (destination.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(destination.hostname) || destination.username || destination.password) throw new Error('Đường dẫn thanh toán VNPay không hợp lệ.')
      const pending: PendingOnlinePayment = { customerId, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, transactionId: transaction.transactionId, merchantOrderRef: transaction.merchantOrderRef, amount: transaction.amount, expiresAt: transaction.expiresAt, paymentUrl: destination.href, mode: 'VNPAY', createdAt: new Date().toISOString() }
      savePendingOnlinePayment(pending)
      setPendingOnline(pending)
      setOnlineStatus('PENDING')
      setPollError('')
      paymentWindow.location.replace(transaction.paymentUrl)
    } catch (caught) {
      paymentWindow.close()
      setOnlineError(caught instanceof Error ? caught.message : 'Không thể khởi tạo thanh toán VNPay.')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }
  }

  const feedback = <>
    {pendingOnline && <OnlinePaymentWaiting payment={pendingOnline} status={onlineStatus} networkError={pollError} onRetry={() => {
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(pendingOnline.invoiceId)
      setPendingOnline(null)
      setOnlineStatus('PENDING')
      setPollError('')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }} />}
    {onlineError && <div className="booking-alert is-error payment-online-error" role="alert">{onlineError}</div>}
    {onlineNotice && <p className="customer-filter-notice" role="status">{onlineNotice}</p>}
  </>
  return { createOnlinePayment, onlineInvoiceId, hasPendingOnline: Boolean(pendingOnline), feedback }
}
