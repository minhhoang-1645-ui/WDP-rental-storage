import type { Paginated, CustomerStorageType } from './customer'

export type StaffPage<T> = Paginated<T>

export interface StaffContact { id?: string; fullName: string; email?: string | null; phone?: string | null }
export interface StaffUnit {
  id: string
  unitCode: string
  status: string
  floor: string | null
  zone: string | null
  row?: string | null
  position?: string | null
  storageType?: CustomerStorageType
}

export interface StaffAppointment {
  id: string
  appointmentCode: string
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  scheduledAt: string
  reservation: { id: string; reference: string; status: string; quantity: number; contractCount: number; customer?: StaffContact }
  allocatedUnits: Array<{ contractCode: string; contractStatus: string; activatedAt?: string | null; unitId?: string; unitCode: string; unitStatus: string; floor: string | null; zone: string | null }>
  note: string | null
  handoverNote: string | null
  createdAt: string
}

export interface StaffRental {
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
  customer: StaffContact
  contracts: Array<{
    id: string
    contractCode: string
    status: string
    startDate: string
    endDate: string
    unit: StaffUnit & { nextConfirmedAllocation?: { reservationReference: string; startDate: string; endDate: string } | null }
    hasCurrentAllocationConflict?: boolean
  }>
  pendingRenewal: { renewalCode: string; status: string; requestedEndDate: string } | null
  futureAllocationRisk: { hasFutureAllocation: boolean; hasCurrentAllocationConflict: boolean }
  billingReadiness: { hasUnpaidInvoices: boolean }
}

export interface StaffSupportRequest {
  id: string
  supportCode: string
  category: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED'
  subject: string
  description: string
  reservation: { id: string; reference: string; status: string }
  contract: { id: string; contractCode: string; status: string; startDate: string; endDate: string } | null
  unit: StaffUnit | null
  invoice: { id: string; invoiceCode: string; status: string } | null
  customer: StaffContact
  assignedStaff: StaffContact | null
  escalationReason?: string | null
  startedAt: string | null
  resolutionType: string | null
  resolutionNote: string | null
  createdAt: string
}

export interface StaffMaintenanceCase {
  id: string
  maintenanceCode: string
  status: 'OPEN' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'COMPLETED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  category: 'UNIT_DAMAGE' | 'CLEANING' | 'LOCK_OR_ACCESS' | 'FACILITY_EQUIPMENT' | 'OTHER'
  source: string
  description: string
  unit: StaffUnit & { storageType: CustomerStorageType }
  assignedStaff: StaffContact | null
  startedAt: string | null
  workCompletedAt: string | null
  workNote: string | null
  createdAt: string
}

export interface StaffReturnRequest {
  id: string
  returnCode: string
  status: 'REQUESTED' | 'INSPECTION_IN_PROGRESS' | 'ISSUE_FOUND' | 'PENDING_SETTLEMENT' | 'COMPLETED'
  requestedAt: string
  inspectionStartedAt: string | null
  physicallyReturnedAt: string | null
  completedAt: string | null
  note: string | null
  reservation: { id: string; reference: string; status: string; quantity: number; effectiveEndDate: string; storageType: CustomerStorageType; customer?: StaffContact }
  inspections: Array<{
    id: string
    result: 'PENDING' | 'PASS' | 'ISSUE_FOUND'
    issueType: string | null
    conditionNote?: string | null
    issueNote?: string | null
    unit: StaffUnit
    contract: { id: string; contractCode: string; status: string; completedAt: string | null }
    nextConfirmedAllocation?: { reference: string; startDate: string; endDate: string } | null
  }>
  inspectionSummary: { total: number; pending: number; passed: number; issues: number }
  settlementStatus: string | null
  createdAt: string
}
