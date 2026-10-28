import type { CustomerPayment, Paginated } from './customer'

export type PaymentSubmissionStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'

export interface BankTransferConfig {
  configured: boolean
  bankName: string
  bankCode: string
  accountNumber: string
  accountName: string
}

export interface PaymentSubmission {
  id: string
  isDemo?: boolean
  submissionCode: string
  status: PaymentSubmissionStatus
  amount: number
  method: 'BANK_TRANSFER'
  transferReference: string | null
  customerNote: string | null
  submittedAt: string
  reviewedAt: string | null
  reviewedBy: { id: string; fullName: string; role: string } | null
  rejectionReason: string | null
  verifiedPayment: Pick<CustomerPayment, 'id' | 'paymentCode' | 'amount' | 'method' | 'reference' | 'receivedAt'> | null
  customer: { id: string; fullName: string; email: string; phone: string | null }
  invoice: {
    id: string
    invoiceCode: string
    status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
    totalAmount: number
    amountPaid: number
    balanceDue: number
    currency: string
    reservation: { id: string; reference: string; customer: { id: string; fullName: string; email: string; phone: string | null }; storageType: { id: string; code: string; name: string } }
  }
  createdAt: string
  updatedAt: string
}

export type PaymentSubmissionPage = Paginated<PaymentSubmission>

export type OnlinePaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
export type OnlinePaymentPollingStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface OnlinePaymentCreated {
  transactionId: string
  merchantOrderRef: string
  status: OnlinePaymentStatus
  amount: number
  expiresAt: string
  paymentUrl: string
}

export interface OnlinePaymentStatusResult {
  transactionId: string
  merchantOrderRef: string
  status: OnlinePaymentPollingStatus
  providerStatus: OnlinePaymentStatus
  amount: number
  expiresAt: string
  paidAt: string | null
  updatedAt: string
  invoice: {
    id: string
    invoiceCode: string
    type: 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'SETTLEMENT'
    status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
    amountPaid: number
    balanceDue: number
    paidAt: string | null
  }
  payment: {
    id: string
    paymentCode: string
    amount: number
    receivedAt: string
  } | null
  reconciliation: {
    reconciliationCode: string
    status: 'PENDING_REVIEW' | 'REFUND_REQUIRED' | 'RECONCILED'
    reason: string
    resolutionNote: string | null
    reviewedAt: string | null
  } | null
}

export type VnpayReturnResult =
  | {
      valid: true
      transaction: {
        merchantOrderRef: string
        status: OnlinePaymentStatus
        amount: number
      }
      invoice: {
        invoiceCode: string
        status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
      }
      providerResponseCode: string
    }
  | {
      valid: false
      status: 'NOT_FOUND' | 'INVALID_SIGNATURE'
    }
