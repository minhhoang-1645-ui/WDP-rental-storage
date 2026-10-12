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
    status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID'
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
