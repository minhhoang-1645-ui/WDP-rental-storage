import type { PublicUser } from '../auth/auth.types.js';
import type { PaymentPlan, PricingQuote } from '../pricing/pricing.types.js';
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
  paymentPlan: PaymentPlan;
}

export type QuoteSnapshot = PricingQuote;

export interface AvailabilityResult {
  available: boolean;
  startDate: string;
  endDateExclusive: string;
  periodStatus: QuoteSnapshot['periodStatus'];
  reasonCode: 'AVAILABLE' | 'CONFLICT' | 'OCCUPIED' | 'INSUFFICIENT_INVENTORY';
  message: string;
  quote: QuoteSnapshot;
}

export interface PendingReservation extends ReservationDraft {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  endDateExclusive: string;
  customer: PublicUser;
  product: BookingProduct;
  quote: QuoteSnapshot;
  unitAssignment: null;
  paymentStatus: 'NOT_STARTED';
  persistence: 'DATABASE';
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
  persistence: 'DATABASE';
  accessToken?: string;
}
