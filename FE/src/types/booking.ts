import type { StorageListing } from './storage'

export interface PublicUser {
  id: string
  fullName: string
  email: string
  phone: string
  role: 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN'
}

export interface AuthSession {
  token: string
  user: PublicUser
}

export type PeriodMode = 'duration' | 'dates'
export type PaymentChoice = 'pay-later' | 'pay-now'

export interface GuestContact {
  fullName: string
  phone: string
  email: string
  note?: string
}

export interface BookingDraft {
  productId: string
  startDate: string
  endDate: string
  periodMode: PeriodMode
  durationMonths: number | null
  quantity: number
  adjacencyPreference: boolean
  addonIds: string[]
  note: string
  paymentChoice: PaymentChoice
  customer: GuestContact
}

export interface QuoteLineItem {
  code: string
  label: string
  basis: string
  amount: number | null
  status: 'QUOTE_REQUIRED' | 'INCLUDED'
}

export interface PricingEstimate {
  status: 'QUOTE_REQUIRED'
  periodStatus: 'APPROVED_DURATION' | 'SHORT_DURATION_UNDECIDED' | 'DATE_RANGE_QUOTE_REQUIRED'
  lineItems: QuoteLineItem[]
  rentalSubtotal: null
  deposit: null
  applicableFees: null
  taxes: null
  discounts: null
  grandTotal: null
  amountPayableNow: null
  message: string
}

export interface AvailabilityResult {
  available: boolean
  startDate: string
  endDateExclusive: string
  periodStatus: PricingEstimate['periodStatus']
  reasonCode: 'AVAILABLE' | 'CONFLICT' | 'OCCUPIED' | 'INSUFFICIENT_INVENTORY'
  message: string
  quote: PricingEstimate
}

export interface AvailabilitySnapshot {
  fingerprint: string
  result: AvailabilityResult
}

export interface PendingReservation extends BookingDraft {
  id: string
  status: 'PENDING'
  createdAt: string
  endDateExclusive: string
  customer: PublicUser
  product: Pick<StorageListing, 'id' | 'code' | 'name' | 'sizeId' | 'condition' | 'status'> & {
    dimensions: string
    floorArea: string
    volume: string
  }
  quote: PricingEstimate
  unitAssignment: null
  paymentStatus: 'NOT_STARTED'
  persistence: 'DATABASE'
}

export interface GuestInquiry extends BookingDraft {
  id: string
  status: 'PENDING_CONTACT'
  createdAt: string
  endDateExclusive: string
  customer: GuestContact
  product: PendingReservation['product']
  quote: PricingEstimate
  inventoryGuarantee: false
  persistence: 'DATABASE'
  accessToken?: string
}

export type InquiryStatus = 'PENDING_CONTACT' | 'CONTACTED' | 'IN_REVIEW' | 'CLOSED' | 'CANCELLED'
export type ManagerRequestStatus = InquiryStatus | 'PENDING' | 'EXPIRED'

export interface ManagerInquiry {
  id: string
  reference: string
  requestType: 'INQUIRY' | 'RESERVATION'
  customer: GuestContact
  product: PendingReservation['product']
  quantity: number
  startDate: string
  endDateExclusive: string
  periodMode: PeriodMode
  durationMonths: number | null
  adjacencyPreference: boolean
  availability: AvailabilityResult
  quote: PricingEstimate
  customerNotes: string | null
  internalNotes: string | null
  status: ManagerRequestStatus
  contactedAt: string | null
  processedBy: { id: string; fullName: string } | null
  createdAt: string
  updatedAt: string
}
