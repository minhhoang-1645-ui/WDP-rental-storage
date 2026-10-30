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
  status: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  startDate: string
  endDate: string
  reservation: { id: string; reference: string; status: string; quantity: number }
  storageType: CustomerStorageType
  storageUnit: { id: string; unitCode: string; floor: string | null; zone: string | null; row: string | null; position: string | null; physicalStatus: string }
  activatedAt: string | null
  completedAt: string | null
  terms: { version: string; acceptedAt: string | null; acceptanceName: string | null; acceptanceNote: string | null; document: Record<string, unknown>; snapshotHash: string; signatureImage: string | null; otp?: { required: boolean; emailConfigured: boolean }; verification?: { method: string; verifiedAt: string; recipient: string } | null }
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
  historicalPricing?: { billingMode?: 'DAILY' | 'MONTHLY' }
  billingSummary: { totalInvoiced: number; totalPaid: number; totalOutstanding: number; nextInvoice: CustomerInvoice | null }
}

export interface CustomerInvoice {
  signing?: { required: boolean; complete: boolean; contracts: { id: string; code: string }[]; renewalId: string | null }
  id: string
  invoiceCode: string
  type: 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'SETTLEMENT'
  billingCycle: number | null
  renewalCycle: number | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  dueAt: string | null
  isPastDue: boolean
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
  reservation: { id: string; reference: string; status: string; expiresAt: string | null; quantity: number; storageType: CustomerStorageType }
  rentalAmount: number
  depositAmount: number
  serviceAmount?: number
  chargeAmount?: number
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
  invoices?: Array<{ id: string; invoiceCode: string; renewalCycle: number; status: string; balanceDue: number }>
  rejectionReason: string | null
  requestedAt: string
  appendix: { code: string; version: string | null; snapshot: unknown; snapshotHash: string; acceptedAt: string | null; acceptanceName: string | null; signatureImage: string | null; otp?: { required: boolean; emailConfigured: boolean }; verification?: { method: string; verifiedAt: string; recipient: string } | null } | null
}

export type SupportCategory = 'UNIT_ISSUE' | 'LOCK_OR_KEY_ISSUE' | 'ACCESS_CODE_ISSUE' | 'FACILITY_EQUIPMENT_FAILURE' | 'PAYMENT_SUPPORT' | 'STORED_ITEM_CONCERN' | 'OTHER'

export interface CustomerSupportRequest {
  earlyReturnDecision?: 'APPROVED' | 'REJECTED' | null
  earlyReturnForEndDate?: string | null
  transfers?: Array<{ id: string; transferCode: string; status: string; contractId: string; fromUnit: { id: string; unitCode: string }; toUnit: { id: string; unitCode: string } | null; createdAt: string; approvedAt: string | null; completedAt: string | null }>
  id: string
  supportCode: string
  category: SupportCategory
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED'
  subject: string
  description: string
  reservation: { id: string; reference: string; status: string }
  contract: { id: string; contractCode: string; status: string; startDate: string; endDate: string } | null
  unit: { id: string; unitCode: string; status: string; floor: string | null; zone: string | null; row: string | null; position: string | null; storageType: CustomerStorageType } | null
  invoice: { id: string; invoiceCode: string; status: string } | null
  startedAt: string | null
  resolvedAt: string | null
  resolutionType: string | null
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerReturnRequest {
  inventory?: { remainingItemTypes: number; pendingMovements: number }
  id: string
  returnCode: string
  status: 'REQUESTED' | 'INSPECTION_IN_PROGRESS' | 'ISSUE_FOUND' | 'PENDING_SETTLEMENT' | 'COMPLETED'
  requestedAt: string
  inspectionStartedAt: string | null
  physicallyReturnedAt: string | null
  completedAt: string | null
  note: string | null
  reservation: { id: string; reference: string; status: string; quantity: number; startDate: string; endDate: string; effectiveEndDate: string; storageType: CustomerStorageType }
  inspections: Array<{ id: string; result: 'PENDING' | 'PASS' | 'ISSUE_FOUND'; issueType: string | null; hasIssue: boolean; contract: { id: string; contractCode: string; status: string; completedAt: string | null }; unit: { id: string; unitCode: string; status: string; floor: string | null; zone: string | null; row: string | null; position: string | null } }>
  inspectionSummary: { total: number; pending: number; passed: number; issues: number }
  settlementStatus: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerDepositSettlement {
  id: string
  settlementCode: string
  returnCode: string
  status: 'PENDING_REVIEW' | 'APPROVED' | 'AWAITING_OUTSTANDING_PAYMENT' | 'SETTLED'
  depositAmount: number
  totalApprovedCharges: number
  deductionAmount: number
  refundAmount: number
  outstandingAmount: number
  reservation: { id: string; reference: string; storageType: CustomerStorageType }
  issues: Array<{ inspectionId: string; unit: { id: string; unitCode: string; status: string }; contract: { id: string; contractCode: string; status: string }; observedIssueType: string | null; approvedIssueType: string; approvedChargeAmount: number; reason: string | null }>
  refundedAt: string | null
  settledAt: string | null
  outstandingInvoice: { id: string; invoiceCode: string; status: string; chargeAmount: number; totalAmount: number; amountPaid: number; balanceDue: number } | null
  createdAt: string
  updatedAt: string
}
