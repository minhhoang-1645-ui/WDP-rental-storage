import type { PublicUser } from '../auth/auth.types.js';
import type { BookingProduct } from './booking.catalog.js';

export const approvedDurations = [1, 3, 6, 12] as const;
export type PeriodMode = 'duration' | 'dates';
export type PaymentChoice = 'pay-later' | 'pay-now';

export interface GuestContact {
  fullName: string;
  phone: string;
  email: string;
  note?: string;
}

export interface ReservationDraft {
  productId: string;
  startDate: string;
  endDate?: string;
  periodMode: PeriodMode;
  durationMonths?: number;
  quantity: number;
  adjacencyPreference: boolean;
  addonIds: string[];
  note?: string;
  paymentChoice: PaymentChoice;
}

export interface QuoteLineItem {
  code: string;
  label: string;
  basis: string;
  amount: number | null;
  status: 'QUOTE_REQUIRED' | 'INCLUDED';
}

export interface QuoteSnapshot {
  status: 'QUOTE_REQUIRED';
  periodStatus: 'APPROVED_DURATION' | 'SHORT_DURATION_UNDECIDED' | 'DATE_RANGE_QUOTE_REQUIRED';
  lineItems: QuoteLineItem[];
  rentalSubtotal: null;
  deposit: null;
  applicableFees: null;
  taxes: null;
  discounts: null;
  grandTotal: null;
  amountPayableNow: null;
  message: string;
}

export interface AvailabilityResult {
  available: boolean;
  startDate: string;
  endDateExclusive: string;
  periodStatus: QuoteSnapshot['periodStatus'];
  reasonCode: 'AVAILABLE' | 'CONFLICT' | 'OCCUPIED' | 'DEMO_INVENTORY_UNCONFIGURED';
  message: string;
  quote: QuoteSnapshot;
}

export interface PendingReservation extends ReservationDraft {
  id: string;
  status: 'PENDING';
  createdAt: string;
  endDateExclusive: string;
  customer: PublicUser;
  product: BookingProduct;
  quote: QuoteSnapshot;
  unitAssignment: null;
  paymentStatus: 'NOT_STARTED';
  persistence: 'DEMO_VOLATILE';
}

export interface GuestInquiry extends ReservationDraft {
  id: string;
  status: 'PENDING_CONTACT';
  createdAt: string;
  endDateExclusive: string;
  customer: GuestContact;
  product: BookingProduct;
  quote: QuoteSnapshot;
  inventoryGuarantee: false;
  persistence: 'DEMO_VOLATILE';
}
