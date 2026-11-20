import type { BankTransferConfig, OnlinePaymentCreated, OnlinePaymentStatusResult, PaymentSubmission, PaymentSubmissionPage, VnpayReturnResult } from '../types/payment'
import { apiRequest } from './api'

export const customerBillingApi = {
  paymentConfig: (signal?: AbortSignal) => apiRequest<BankTransferConfig>('/customer/payment-config', { signal }),
  submissions: (signal?: AbortSignal) => apiRequest<PaymentSubmissionPage>('/customer/payment-submissions?limit=100', { signal }),
  createSubmission: (invoiceId: string, amount: number, idempotencyKey: string, transferReference: string, customerNote: string, signal?: AbortSignal) =>
    apiRequest<PaymentSubmission>(`/customer/invoices/${encodeURIComponent(invoiceId)}/payment-submissions`, {
      method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount, method: 'BANK_TRANSFER', transferReference: transferReference || null, customerNote: customerNote || null }),
    }),
  createOnlinePayment: (invoiceId: string, idempotencyKey: string, bankCode?: string, signal?: AbortSignal) =>
    apiRequest<OnlinePaymentCreated>(`/customer/invoices/${encodeURIComponent(invoiceId)}/online-payment`, {
      method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ locale: 'vn', ...(bankCode ? { bankCode } : {}) }),
    }),
  onlinePaymentStatus: (transactionIdentity: string, signal?: AbortSignal) =>
    apiRequest<OnlinePaymentStatusResult>(`/customer/online-payments/${encodeURIComponent(transactionIdentity)}`, { signal }),
  vnpayReturn: (query: string, signal?: AbortSignal) =>
    apiRequest<VnpayReturnResult>(`/payments/vnpay/return${query ? `?${query}` : ''}`, { signal, authenticated: false }),
}
