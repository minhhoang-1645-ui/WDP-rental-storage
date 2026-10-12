import type { CustomerInvoice, CustomerPayment, Paginated } from '../types/customer'
import type { BankTransferConfig, PaymentSubmission, PaymentSubmissionPage } from '../types/payment'
import { apiRequest } from './api'

export const customerBillingApi = {
  paymentConfig: (signal?: AbortSignal) => apiRequest<BankTransferConfig>('/customer/payment-config', { signal }),
  submissions: (signal?: AbortSignal) => apiRequest<PaymentSubmissionPage>('/customer/payment-submissions?limit=100', { signal }),
  createSubmission: (invoiceId: string, amount: number, idempotencyKey: string, transferReference: string, customerNote: string, signal?: AbortSignal) =>
    apiRequest<PaymentSubmission>(`/customer/invoices/${encodeURIComponent(invoiceId)}/payment-submissions`, {
      method: 'POST', signal, headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount, method: 'BANK_TRANSFER', transferReference: transferReference || null, customerNote: customerNote || null }),
    }),
}

export const managerBillingApi = {
  submissions: (path: string, signal?: AbortSignal) => apiRequest<PaymentSubmissionPage>(`/manager/payment-submissions${path}`, { signal }),
  verify: (id: string, reference: string, note: string) => apiRequest<PaymentSubmission>(`/manager/payment-submissions/${encodeURIComponent(id)}/verify`, {
    method: 'POST', body: JSON.stringify({ reference, note }),
  }),
  reject: (id: string, reason: string) => apiRequest<PaymentSubmission>(`/manager/payment-submissions/${encodeURIComponent(id)}/reject`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }),
  invoices: (signal?: AbortSignal) => apiRequest<Paginated<CustomerInvoice>>('/manager/invoices?limit=100', { signal }),
  payments: (signal?: AbortSignal) => apiRequest<Paginated<CustomerPayment>>('/manager/payments?limit=100', { signal }),
}
