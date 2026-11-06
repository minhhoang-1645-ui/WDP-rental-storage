import { OnlinePaymentWaiting } from './OnlinePaymentWaiting'
import { useEffect, useRef, useState } from 'react'
import { customerBillingApi } from '../../services/billing'
import { readPendingOnlinePayments, removePendingOnlinePayment, savePendingOnlinePayment, type PendingOnlinePayment } from '../../services/online-payment-session'
import { useNavigate } from 'react-router-dom'
import type { OnlinePaymentPollingStatus, OnlinePaymentStatusResult } from '../../types/payment'

import type { CustomerInvoice } from '../../types/customer'
import { isScheduledRenewalInvoice, paymentWindowClosed } from '../../utils/payment-state'
import { vnpayDestination } from '../../utils/vnpay-destination'

export function useCustomerOnlinePayment(customerId: string, refreshInvoices: () => void, refreshPayments?: () => void, invoices?: CustomerInvoice[]) {
  const navigate = useNavigate()
  const [onlineInvoiceId, setOnlineInvoiceId] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [onlineNotice, setOnlineNotice] = useState('')
  const [pendingOnline, setPendingOnline] = useState<PendingOnlinePayment | null>(() => customerId ? readPendingOnlinePayments(customerId)[0] ?? null : null)
  const [onlineStatus, setOnlineStatus] = useState<OnlinePaymentPollingStatus>('PENDING')
  const [pollError, setPollError] = useState('')
  const [onlineResult, setOnlineResult] = useState<OnlinePaymentStatusResult>()
  const onlineLock = useRef(false)
  const onlineKeys = useRef(new Map<string, string>())

  useEffect(() => {
    if (!pendingOnline || onlineStatus !== 'FAILED' || onlineResult?.reconciliation || !invoices?.some(invoice => invoice.id === pendingOnline.invoiceId && invoice.status === 'PAID')) return
    // Synchronize the browser session after an authoritative invoice refresh.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      onlineLock.current = false
      setPendingOnline(null)
      setOnlineResult(undefined)
      setOnlineInvoiceId('')
      setPollError('')
      setOnlineStatus('PENDING')
    })
    return () => { cancelled = true }
  }, [invoices, pendingOnline, onlineStatus, onlineResult?.reconciliation])

  useEffect(() => {
    if (!pendingOnline) return
    let stopped = false
    let timer = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      try {
        const result = await customerBillingApi.onlinePaymentStatus(pendingOnline.transactionId, controller.signal)
        if (stopped) return
        setPollError('')
        setOnlineResult(result)
        if (result.status === 'SUCCESS' && result.invoice.status === 'PAID') {
          removePendingOnlinePayment(pendingOnline)
          setOnlineStatus('SUCCESS')
          refreshInvoices()
          refreshPayments?.()
          navigate(`/customer/payments/vnpay-return?transactionId=${encodeURIComponent(result.transactionId)}`, { replace: true })
          return
        }
        if (result.providerStatus === 'CANCELLED' && !result.reconciliation) {
          removePendingOnlinePayment(pendingOnline)
          onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
          setPendingOnline(null)
          setOnlineInvoiceId('')
          setOnlineStatus('PENDING')
          setOnlineNotice(`Phiên thanh toán VNPay cho ${pendingOnline.invoiceCode} đã được hủy.`)
          onlineLock.current = false
          refreshInvoices()
          return
        }
        if (result.status === 'FAILED') {
          setOnlineStatus('FAILED')
          onlineLock.current = false
          if (!result.reconciliation || result.reconciliation.status === 'RECONCILED') return
        }
      } catch (caught) {
        if (!stopped && !controller.signal.aborted) setPollError(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái VNPay.')
      }
      if (!stopped) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer) }
  }, [pendingOnline, navigate, refreshInvoices, refreshPayments])

  const createOnlinePayment = async (invoice: Pick<CustomerInvoice, 'id' | 'invoiceCode' | 'type'> & Partial<Pick<CustomerInvoice, 'signing' | 'reservation' | 'renewalCycle' | 'dueAt'>>, mode: 'VNPAY' | 'VNPAYQR' = 'VNPAY') => {
    if (!customerId || onlineLock.current || pendingOnline || invoice.signing?.complete === false || paymentWindowClosed(invoice) || isScheduledRenewalInvoice(invoice) || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(invoice.type)) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) { setOnlineError('Trình duyệt đã chặn tab VNPay. Hãy cho phép popup rồi thử lại.'); return }
    paymentWindow.opener = null
    onlineLock.current = true
    setOnlineInvoiceId(invoice.id)
    setOnlineError('')
    setOnlineNotice('')
    setOnlineResult(undefined)
    const keyIdentity = `${invoice.id}:${mode}`
    let key = onlineKeys.current.get(keyIdentity)
    if (!key) {
      key = `cust-vnpay-${crypto.randomUUID()}`
      onlineKeys.current.set(keyIdentity, key)
    }
    try {
      const transaction = await customerBillingApi.createOnlinePayment(invoice.id, key, mode === 'VNPAYQR' ? 'VNPAYQR' : undefined)
      const destination = vnpayDestination(transaction.paymentUrl)
      const pending: PendingOnlinePayment = { customerId, invoiceId: invoice.id, invoiceCode: invoice.invoiceCode, transactionId: transaction.transactionId, merchantOrderRef: transaction.merchantOrderRef, amount: transaction.amount, expiresAt: transaction.expiresAt, paymentUrl: destination.href, mode, createdAt: new Date().toISOString() }
      savePendingOnlinePayment(pending)
      setPendingOnline(pending)
      setOnlineStatus('PENDING')
      setPollError('')
      paymentWindow.location.replace(destination.href)
    } catch (caught) {
      paymentWindow.close()
      setOnlineError(caught instanceof Error ? caught.message : 'Không thể khởi tạo thanh toán VNPay.')
      setOnlineInvoiceId('')
      onlineLock.current = false
    }
  }

  const feedback = <>
    {pendingOnline && <OnlinePaymentWaiting payment={pendingOnline} status={onlineStatus} reconciliation={onlineResult?.reconciliation} providerStatus={onlineResult?.providerStatus} networkError={pollError} onRelease={() => {
      removePendingOnlinePayment(pendingOnline)
      onlineKeys.current.delete(`${pendingOnline.invoiceId}:${pendingOnline.mode}`)
      setPendingOnline(null)
      setOnlineStatus('PENDING')
      setPollError('')
      setOnlineInvoiceId('')
      onlineLock.current = false
      setOnlineResult(undefined)
      refreshInvoices()
    }} />}
    {onlineError && <div className="booking-alert is-error payment-online-error" role="alert">{onlineError}</div>}
    {onlineNotice && <p className="customer-filter-notice" role="status">{onlineNotice}</p>}
  </>
  return { createOnlinePayment, onlineInvoiceId, hasPendingOnline: Boolean(pendingOnline), feedback }
}
