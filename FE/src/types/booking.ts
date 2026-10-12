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
export type PaymentPlan = 'PAY_MONTHLY' | 'PREPAID'

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
  paymentPlan: PaymentPlan
  customer: GuestContact
}

export interface QuoteLineItem {
  code: string
  label: string
  basis: string
  amount: number | null
  status: 'QUOTE_REQUIRED' | 'INCLUDED'
}

export interface PricingQuote {
  currency: 'VND'
  storageTypeId: string
  storageTypeName: string
  quantity: number
  startDate: string
  endDate: string
  billingMode: 'DAILY' | 'MONTHLY'
  billableDays: number | null
  termMonths: number | null
  paymentPlan: PaymentPlan
  monthlyUnitPrice: number
  dailyUnitPrice: string | null
  baseRentalAmount: number
  discountPercent: number
  discountAmount: number
  rentalAmount: number
  depositAmount: number
  quotedTotalAmount: number
  status: 'PRICED'
  periodStatus: 'APPROVED_DURATION' | 'SHORT_DURATION_APPROVED'
  lineItems: Array<{ code: string; label: string; basis: string; amount: number; status: 'INCLUDED' }>
  rentalSubtotal: number
  deposit: number
  applicableFees: null
  taxes: null
  discounts: number
  grandTotal: number
  amountPayableNow: null
  message: string
}

export interface AvailabilityResult {
  available: boolean
  startDate: string
  endDateExclusive: string
  periodStatus: PricingQuote['periodStatus']
  reasonCode: 'AVAILABLE' | 'CONFLICT' | 'OCCUPIED' | 'INSUFFICIENT_INVENTORY'
  message: string
  quote: PricingQuote
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
  quote: PricingQuote
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
  quote: PricingQuote
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
  quote: PricingQuote
  customerNotes: string | null
  internalNotes: string | null
  status: ManagerRequestStatus
  contactedAt: string | null
  processedBy: { id: string; fullName: string } | null
  createdAt: string
  updatedAt: string
}
