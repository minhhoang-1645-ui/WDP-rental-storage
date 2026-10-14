import { apiRequest } from './api'
import type {
  ManagerAppointmentDetail,
  ManagerContractDetail,
  ManagerCustomerDetail,
  ManagerDepositSettlementDetail,
  ManagerInvoiceDetail,
  ManagerMaintenanceDetail,
  ManagerPaymentDetail,
  ManagerRenewalDetail,
  ManagerRentalDetail,
  ManagerReturnDetail,
  ManagerSupportDetail,
  ManagerTransferDetail,
  ManagerUnitDetail,
  PaginatedResponse,
} from '../types/manager'

function toQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }
  const str = searchParams.toString()
  return str ? `?${str}` : ''
}

function makeKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export const managerOpsApi = {
  // Units
  listUnits: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerUnitDetail>>(`/manager/units${toQuery(params)}`, { signal }),
  getUnit: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerUnitDetail>(`/manager/units/${encodeURIComponent(id)}`, { signal }),

  // Customers
  listCustomers: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerCustomerDetail>>(`/manager/customers${toQuery(params)}`, { signal }),
  getCustomer: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerCustomerDetail>(`/manager/customers/${encodeURIComponent(id)}`, { signal }),

  // Appointments
  listAppointments: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerAppointmentDetail>>(`/manager/appointments${toQuery(params)}`, { signal }),
  getAppointment: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerAppointmentDetail>(`/manager/appointments/${encodeURIComponent(id)}`, { signal }),
  confirmAppointment: (id: string) =>
    apiRequest<ManagerAppointmentDetail>(`/manager/appointments/${encodeURIComponent(id)}/confirm`, { method: 'PATCH' }),

  // Renewals
  listRenewals: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerRenewalDetail>>(`/manager/renewals${toQuery(params)}`, { signal }),
  getRenewal: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerRenewalDetail>(`/manager/renewals/${encodeURIComponent(id)}`, { signal }),
  approveRenewal: (id: string) =>
    apiRequest<ManagerRenewalDetail>(`/manager/renewals/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  rejectRenewal: (id: string, reason: string) =>
    apiRequest<ManagerRenewalDetail>(`/manager/renewals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Billing (Invoices & Payments)
  listInvoices: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerInvoiceDetail>>(`/manager/invoices${toQuery(params)}`, { signal }),
  getInvoice: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerInvoiceDetail>(`/manager/invoices/${encodeURIComponent(id)}`, { signal }),
  recordPayment: (invoiceId: string, input: { amount: number; method: 'BANK_TRANSFER' | 'CASH'; reference?: string; note?: string }) =>
    apiRequest<{ payment: ManagerPaymentDetail; invoice: ManagerInvoiceDetail }>(`/manager/invoices/${encodeURIComponent(invoiceId)}/payments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('pay') },
      body: JSON.stringify(input),
    }),
  listPayments: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerPaymentDetail>>(`/manager/payments${toQuery(params)}`, { signal }),
  getPayment: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerPaymentDetail>(`/manager/payments/${encodeURIComponent(id)}`, { signal }),

  // Contracts
  listContracts: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerContractDetail>>(`/manager/contracts${toQuery(params)}`, { signal }),
  getContract: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerContractDetail>(`/manager/contracts/${encodeURIComponent(id)}`, { signal }),

  // Rentals
  listRentals: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerRentalDetail>>(`/manager/rentals${toQuery(params)}`, { signal }),
  getRental: (reservationId: string, signal?: AbortSignal) =>
    apiRequest<ManagerRentalDetail>(`/manager/rentals/${encodeURIComponent(reservationId)}`, { signal }),

  // Returns
  listReturns: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerReturnDetail>>(`/manager/returns${toQuery(params)}`, { signal }),
  getReturn: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerReturnDetail>(`/manager/returns/${encodeURIComponent(id)}`, { signal }),

  // Deposit Settlements
  listDepositSettlements: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerDepositSettlementDetail>>(`/manager/deposit-settlements${toQuery(params)}`, { signal }),
  getDepositSettlement: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerDepositSettlementDetail>(`/manager/deposit-settlements/${encodeURIComponent(id)}`, { signal }),
  reviewDepositSettlement: (id: string, input: { issues: Array<{ inspectionId: string; issueType: string; approvedChargeAmount: number; reason?: string }>; note?: string }) =>
    apiRequest<ManagerDepositSettlementDetail>(`/manager/deposit-settlements/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('rev') },
      body: JSON.stringify(input),
    }),
  refundDeposit: (id: string, input: { method: 'BANK_TRANSFER' | 'CASH'; reference: string; note?: string }) =>
    apiRequest<ManagerDepositSettlementDetail>(`/manager/deposit-settlements/${encodeURIComponent(id)}/refund`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('ref') },
      body: JSON.stringify(input),
    }),

  // Maintenance
  listMaintenance: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerMaintenanceDetail>>(`/manager/maintenance${toQuery(params)}`, { signal }),
  getMaintenance: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerMaintenanceDetail>(`/manager/maintenance/${encodeURIComponent(id)}`, { signal }),
  createMaintenance: (input: { storageUnitId: string; category: string; priority?: string; description: string }) =>
    apiRequest<ManagerMaintenanceDetail>('/manager/maintenance', {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('mnt-create') },
      body: JSON.stringify(input),
    }),
  assignMaintenance: (id: string, staffUserId: string) =>
    apiRequest<ManagerMaintenanceDetail>(`/manager/maintenance/${encodeURIComponent(id)}/assign`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': makeKey('mnt-asg') },
      body: JSON.stringify({ staffUserId }),
    }),
  updateMaintenancePriority: (id: string, priority: string) =>
    apiRequest<ManagerMaintenanceDetail>(`/manager/maintenance/${encodeURIComponent(id)}/priority`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': makeKey('mnt-prio') },
      body: JSON.stringify({ priority }),
    }),
  verifyMaintenance: (id: string, note?: string) =>
    apiRequest<ManagerMaintenanceDetail>(`/manager/maintenance/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('mnt-ver') },
      body: JSON.stringify({ note: note || undefined }),
    }),
  rejectMaintenanceVerification: (id: string, note: string) =>
    apiRequest<ManagerMaintenanceDetail>(`/manager/maintenance/${encodeURIComponent(id)}/reject-verification`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('mnt-rej') },
      body: JSON.stringify({ note }),
    }),

  // Transfers
  listTransfers: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerTransferDetail>>(`/manager/transfers${toQuery(params)}`, { signal }),
  getTransfer: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerTransferDetail>(`/manager/transfers/${encodeURIComponent(id)}`, { signal }),
  createTransfer: (input: { rentalContractId: string; reason: string; supportRequestId?: string }) =>
    apiRequest<ManagerTransferDetail>('/manager/transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('trf-create') },
      body: JSON.stringify(input),
    }),
  approveTransfer: (id: string, toStorageUnitId: string) =>
    apiRequest<ManagerTransferDetail>(`/manager/transfers/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ toStorageUnitId }),
    }),
  rejectTransfer: (id: string) =>
    apiRequest<ManagerTransferDetail>(`/manager/transfers/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
    }),

  // Support Requests
  listSupportRequests: (params?: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<PaginatedResponse<ManagerSupportDetail>>(`/manager/support-requests${toQuery(params)}`, { signal }),
  getSupportRequest: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerSupportDetail>(`/manager/support-requests/${encodeURIComponent(id)}`, { signal }),
  assignSupport: (id: string, staffUserId: string) =>
    apiRequest<ManagerSupportDetail>(`/manager/support-requests/${encodeURIComponent(id)}/assign`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': makeKey('sup-asg') },
      body: JSON.stringify({ staffUserId }),
    }),
  updateSupportPriority: (id: string, priority: string) =>
    apiRequest<ManagerSupportDetail>(`/manager/support-requests/${encodeURIComponent(id)}/priority`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': makeKey('sup-prio') },
      body: JSON.stringify({ priority }),
    }),
  resolveSupport: (id: string, input: { resolutionType: string; resolutionNote: string }) =>
    apiRequest<ManagerSupportDetail>(`/manager/support-requests/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: { 'Idempotency-Key': makeKey('sup-res') },
      body: JSON.stringify(input),
    }),
}
