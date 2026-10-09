export interface Paginated<T> {
  page: number
  limit: number
  total: number
  items: T[]
}

export interface CustomerStorageType {
  id: string
  code: string
  name: string
  sizeId?: string
  sizeName?: string
  condition?: string
}

export interface CustomerContract {
  id: string
  contractCode: string
  status: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' | 'ACTIVE' | 'COMPLETED'
  startDate: string
  endDate: string
  reservation: { id: string; reference: string; status: string; quantity: number }
  storageType: CustomerStorageType
  storageUnit: { id: string; unitCode: string; floor: string | null; zone: string | null; row: string | null; position: string | null; physicalStatus: string }
  activatedAt: string | null
  completedAt: string | null
}

export interface RentalContractSummary {
  id: string
  contractCode: string
  status: string
  startDate: string
  endDate: string
  activatedAt: string | null
  unit: { id: string; unitCode: string; status: string; floor: string | null; zone: string | null; row: string | null; position: string | null }
}

export interface CustomerRental {
  reservationId: string
  reservationReference: string
  storageType: CustomerStorageType
  quantity: number
  startDate: string
  endDate: string
  effectiveEndDate: string
  isOverdue: boolean
  overdueSince: string | null
  rentalState: 'ACTIVE' | 'OVERDUE'
  contractCount: number
  unitCount: number
  contracts: RentalContractSummary[]
  pendingRenewal: { renewalCode: string; status: string; requestedEndDate: string } | null
  billingSummary: { totalInvoiced: number; totalPaid: number; totalOutstanding: number; nextInvoice: CustomerInvoice | null }
}

export interface CustomerInvoice {
  id: string
  invoiceCode: string
  type: 'INITIAL' | 'RECURRING' | 'RENEWAL'
  billingCycle: number | null
  renewalCycle: number | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  dueAt: string | null
  isPastDue: boolean
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
  reservation: { id: string; reference: string; status: string; quantity: number; storageType: CustomerStorageType }
  rentalAmount: number
  depositAmount: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  currency: string
  issuedAt: string
  paidAt: string | null
}

export interface CustomerPayment {
  id: string
  paymentCode: string
  amount: number
  method: string
  reference: string | null
  note: string | null
  receivedAt: string
  invoice: { id: string; invoiceCode: string; status: string; totalAmount: number; amountPaid: number; balanceDue: number; reservation: { id: string; reference: string } }
}

export interface CustomerAppointment {
  id: string
  appointmentCode: string
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  scheduledAt: string
  reservation: { id: string; reference: string; status: string; quantity: number; contractCount: number }
  allocatedUnits: Array<{ contractCode: string; contractStatus: string; unitCode: string; unitStatus: string; floor: string | null; zone: string | null }>
  note: string | null
  handoverNote: string | null
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface CustomerRenewal {
  id: string
  renewalCode: string
  status: 'PENDING' | 'APPROVED_PENDING_PAYMENT' | 'COMPLETED' | 'REJECTED'
  reservation: { id: string; reference: string; quantity: number; currentEndDate: string; storageType: Pick<CustomerStorageType, 'id' | 'code' | 'name'> }
  previousEndDate: string
  requestedEndDate: string
  termMonths: number
  paymentPlan: 'PAY_MONTHLY' | 'PREPAID'
  quoteSnapshot: { currency: string; totalAmount: number; discountAmount: number }
  billingSummary: { totalInvoiced: number; totalPaid: number; totalOutstanding: number }
  rejectionReason: string | null
  requestedAt: string
}
