export interface PaginatedResponse<T> {
  page: number
  limit: number
  total: number
  items: T[]
}

export interface ManagerUnitDetail {
  id: string
  unitCode: string
  storageType: { id: string; code: string; name: string }
  category: { id: string; name: string }
  condition: string
  dimensions: { widthCm: number; lengthCm: number; heightCm: number; display: string }
  floor: string | null
  zone: string | null
  row: number | null
  position: number | null
  status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE'
  activeMaintenance: { id: string; maintenanceCode: string; status: string; priority: string } | null
  maintenanceStatus: string | null
  maintenancePriority: string | null
  currentAllocation: {
    id: string
    reservationReference: string
    reservationStatus: string
    customer: { id: string; fullName: string; email: string }
    startDate: string
    endDate: string
    releasedAt: string | null
  } | null
  futureAllocations: Array<{
    id: string
    reservationReference: string
    reservationStatus: string
    customer: { id: string; fullName: string; email: string }
    startDate: string
    endDate: string
    releasedAt: string | null
  }>
  allocations: Array<{
    id: string
    reservationReference: string
    reservationStatus: string
    customer: { id: string; fullName: string; email: string }
    startDate: string
    endDate: string
    releasedAt: string | null
  }>
  createdAt: string
  updatedAt: string
}

export interface ManagerCustomerDetail {
  id: string
  fullName: string
  email: string
  phone: string
  accountStatus: string
  createdAt: string
  updatedAt: string
  reservationCount: number
  reservations: Array<{
    id: string
    reference: string
    storageType: { id: string; code: string; name: string }
    quantity: number
    startDate: string
    endDate: string
    status: string
    createdAt: string
    allocatedUnits: Array<{
      unitId: string
      unitCode: string
      plannedStartDate: string
      plannedEndDate: string
      releasedAt: string | null
    }>
  }>
}

export interface ManagerAppointmentDetail {
  id: string
  appointmentCode: string
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  scheduledAt: string
  note?: string
  requestedBy?: { id: string; fullName: string; role: string }
  confirmedBy?: { id: string; fullName: string; role: string }
  completedBy?: { id: string; fullName: string; role: string }
  confirmedAt?: string
  reservation: {
    id: string
    reference: string
    status: string
    quantity: number
    contractCount: number
    customer?: { id: string; fullName: string; email: string; phone: string }
    contracts?: Array<{
      id: string
      contractCode: string
      status: string
      reservationUnit?: {
        storageUnit?: { id: string; unitNumber: string; status: string; floor: string; zone: string }
      }
    }>
  }
}

export interface ManagerRenewalDetail {
  id: string
  renewalCode: string
  status: 'PENDING' | 'APPROVED_PENDING_PAYMENT' | 'COMPLETED' | 'REJECTED'
  previousEndDate: string
  requestedEndDate: string
  termMonths: number
  paymentPlan: 'PAY_MONTHLY' | 'PREPAID'
  rejectionReason?: string
  approvedAt?: string
  customer?: { fullName: string; email: string; phone: string }
  reservation?: { id: string; reference: string; quantity: number }
  contracts?: Array<{ id: string; contractCode: string; status: string }>
  invoices?: Array<{
    id: string
    invoiceCode: string
    type: string
    status: string
    totalAmount: number
    balanceDue: number
    billingPeriodStart?: string
    billingPeriodEnd?: string
  }>
}

export interface ManagerInvoiceDetail {
  id: string
  invoiceCode: string
  type: 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'SETTLEMENT'
  billingCycle?: number
  renewalCycle?: number
  billingPeriodStart?: string
  billingPeriodEnd?: string
  dueAt?: string
  isPastDue: boolean
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID'
  rentalAmount: number
  depositAmount: number
  chargeAmount?: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  reservation?: {
    id: string
    reference: string
    status: string
    quantity: number
    storageType?: { id: string; code: string; name: string }
    customer?: { fullName: string; email: string; phone: string }
    contracts?: Array<{
      contractCode: string
      status: string
      reservationUnit?: { storageUnit?: { unitNumber: string } }
    }>
  }
  payments?: Array<{
    id: string
    paymentCode: string
    amount: number
    method: 'BANK_TRANSFER' | 'CASH'
    reference?: string
    note?: string
    receivedAt: string
    recordedBy?: { fullName: string; role: string }
  }>
  historicalPricing?: Record<string, unknown>
}

export interface ManagerPaymentDetail {
  id: string
  paymentCode: string
  amount: number
  method: 'BANK_TRANSFER' | 'CASH'
  reference?: string
  note?: string
  receivedAt: string
  recordedBy?: { id: string; fullName: string; role: string }
  invoice?: {
    id: string
    invoiceCode: string
    type: string
    status: string
    totalAmount: number
    amountPaid: number
    balanceDue: number
    reservation?: { reference: string; customer?: { fullName: string; phone: string } }
  }
}

export interface ManagerContractDetail {
  id: string
  contractCode: string
  status: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' | 'ACTIVE' | 'COMPLETED'
  startDate: string
  endDate: string
  activatedAt?: string
  storageUnit?: { id: string; unitCode: string; status: string; floor: string; zone: string }
  reservation?: {
    id: string
    reference: string
    quantity: number
    customer?: { id: string; fullName: string; email: string; phone: string }
    storageType?: { name: string; code: string }
  }
  reservationPricing?: Record<string, unknown>
}

export interface ManagerRentalDetail {
  reservationId: string
  reservationReference: string
  rentalState: string
  effectiveEndDate: string
  isOverdue: boolean
  futureAllocationRisk?: { hasFutureAllocation: boolean; hasCurrentAllocationConflict: boolean }
  customer?: { id: string; fullName: string; email: string; phone: string }
  storageType?: { id: string; code: string; name: string }
  contracts?: Array<{
    id: string
    contractCode: string
    status: string
    unit?: { id: string; unitCode: string; status: string; nextConfirmedAllocation?: unknown }
  }>
  invoices?: Array<{ invoiceCode: string; type: string; status: string; totalAmount: number; balanceDue: number }>
}

export interface ManagerReturnDetail {
  id: string
  returnCode: string
  status: 'REQUESTED' | 'INSPECTION_IN_PROGRESS' | 'ISSUE_FOUND' | 'COMPLETED'
  requestedReturnDate?: string
  createdAt: string
  customer?: { fullName: string; email: string; phone: string }
  reservation?: { id: string; reference: string; storageType?: { name: string } }
  inspections?: Array<{
    id: string
    inspectionCode: string
    itemStatus: string
    cleanliness: string
    damageObserved: boolean
    result?: string
    issueType?: string
    conditionNote?: string
    issueNote?: string
    storageUnit?: { unitNumber: string }
  }>
  depositSettlement?: { id: string; settlementCode: string; status: string }
}

export interface ManagerDepositSettlementDetail {
  id: string
  settlementCode: string
  status: 'PENDING_REVIEW' | 'APPROVED' | 'AWAITING_OUTSTANDING_PAYMENT' | 'SETTLED'
  initialDepositAmount: number
  totalCharges: number
  refundAmount: number
  outstandingAmount: number
  customer?: { fullName: string; email: string; phone: string }
  returnRequest?: { id: string; returnCode: string; status: string }
  issues?: Array<{
    id: string
    inspectionId: string
    issueType: string
    approvedChargeAmount: number
    reason?: string
    inspection?: { inspectionCode: string; storageUnit?: { unitNumber: string } }
  }>
  settlementInvoice?: { id: string; invoiceCode: string; status: string; balanceDue: number }
  refundPayment?: { id: string; paymentCode: string; method: string; reference: string; receivedAt: string }
}

export interface ManagerMaintenanceDetail {
  id: string
  maintenanceCode: string
  status: 'OPEN' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'COMPLETED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  category: 'UNIT_DAMAGE' | 'CLEANING' | 'LOCK_OR_ACCESS' | 'FACILITY_EQUIPMENT' | 'OTHER'
  description: string
  storageUnit?: { id: string; unitNumber: string; status: string; floor?: string; zone?: string }
  reportedBy?: { id: string; fullName: string; role: string }
  assignedStaff?: { id: string; fullName: string; role: string }
  workNote?: string
  rejectionNote?: string
  verificationNote?: string
  completedAt?: string
  verifiedAt?: string
  nextConfirmedAllocation?: {
    reservationReference: string
    startDate: string
    endDate: string
    customer?: { fullName: string }
  } | null
  createdAt: string
}

export interface ManagerTransferDetail {
  id: string
  transferCode: string
  status: 'REQUESTED' | 'APPROVED' | 'COMPLETED' | 'REJECTED'
  reason: 'UNIT_ISSUE' | 'FACILITY_EQUIPMENT_FAILURE' | 'OPERATIONAL_RELOCATION' | 'OTHER'
  rentalContract?: {
    id: string
    contractCode: string
    status: string
    reservation?: { reference: string; customer?: { fullName: string; phone: string } }
  }
  fromStorageUnit?: { id: string; unitNumber: string; status: string }
  toStorageUnit?: { id: string; unitNumber: string; status: string }
  requestedBy?: { id: string; fullName: string; role: string }
  approvedBy?: { id: string; fullName: string; role: string }
  supportRequestId?: string
  createdAt: string
}

export interface ManagerSupportDetail {
  id: string
  supportCode: string
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  category: 'UNIT_ISSUE' | 'LOCK_OR_KEY_ISSUE' | 'ACCESS_CODE_ISSUE' | 'FACILITY_EQUIPMENT_FAILURE' | 'PAYMENT_SUPPORT' | 'STORED_ITEM_CONCERN' | 'OTHER'
  subject: string
  description: string
  customer?: { id: string; fullName: string; email: string; phone: string }
  reservation?: { id: string; reference: string }
  assignedStaff?: { id: string; fullName: string; role: string }
  resolutionType?: string
  resolutionNote?: string
  resolvedBy?: { id: string; fullName: string; role: string }
  createdAt: string
}
