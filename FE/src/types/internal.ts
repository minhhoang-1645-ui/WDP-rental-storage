export interface Paginated<T> { page: number; limit: number; total: number; items: T[] }

export interface ManagerUnit {
  id: string; unitCode: string; status: string; floor: string | null; zone: string | null
  storageType: { id: string; code: string; name: string }
  allocationSummary: { current: { reservationReference: string; customer: { fullName: string }; endDate: string } | null; future: unknown[] }
}

export interface ManagerCustomer {
  id: string; fullName: string; email: string; phone: string; accountStatus: string; createdAt: string; reservationCount: number
  latestReservation: { reference: string; storageType: { name: string }; status: string } | null
}

export interface ManagerReservation {
  id: string; reference: string; status: string; quantity: number; startDate: string; endDateExclusive: string
  customer: { fullName: string; email: string; phone: string }
  product: { name: string; code: string }
  allocatedUnits: Array<{ unitNumber: string; physicalStatus: string }>
}

export interface OperationalAppointment { id: string; appointmentCode: string; status: string; scheduledAt: string; customer: { fullName: string; phone: string }; reservation: { reference: string; storageType: { name: string } } }
export interface OperationalRental { reservationId: string; reservationReference: string; rentalState: string; effectiveEndDate: string; customer: { fullName: string; phone: string }; storageType: { name: string }; contracts: Array<{ unit: { unitCode: string } }> }
export interface OperationalReturn { id: string; returnCode: string; status: string; createdAt: string; customer: { fullName: string; phone: string }; reservation: { reference: string; storageType: { name: string } }; inspectionSummary: { total: number; pending: number; passed: number; issues: number } }
