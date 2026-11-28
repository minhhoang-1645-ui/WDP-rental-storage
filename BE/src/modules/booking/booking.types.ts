import type { PublicUser } from '../auth/auth.types.js';
import type { PaymentPlan, PricingQuote } from '../pricing/pricing.types.js';
import type { BookingProduct } from './booking.catalog.js';

export const suggestedRentalMonths = [1, 3, 6, 12] as const;
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
  /** Customer's optional, same-product physical-unit preference. Revalidated while confirming. */
  selectedUnitIds?: string[];
  addonIds: string[];
  serviceSelections?: Array<{ serviceId: string; quantity: number; serviceStartDate?: string; serviceEndDate?: string }>;
  note?: string;
  paymentChoice: PaymentChoice;
  paymentPlan: PaymentPlan;
}

export type QuoteSnapshot = PricingQuote;

export interface AvailabilityResult {
  serviceQuoteVersion?: string;
  available: boolean;
  availableQuantity: number;
  startDate: string;
  endDateExclusive: string;
  periodStatus: QuoteSnapshot['periodStatus'];
  reasonCode: 'AVAILABLE' | 'CONFLICT' | 'OCCUPIED' | 'INSUFFICIENT_INVENTORY';
  message: string;
  quote: QuoteSnapshot;
}

export interface PendingReservation extends ReservationDraft {
  paidCancellation?: { state: string; total: number; refundDueOn?: string };
  rentalSummary?: {
    rentalPeriod: ReturnType<typeof import('../billing/rental-account-summary.js').rentalAccountSummary>['rentalPeriod'];
    paymentDetails: ReturnType<typeof import('../billing/rental-account-summary.js').rentalAccountSummary>['paymentDetails'];
    currentUnits: Array<{ contractId: string; contractCode: string; unitCode: string; floor: string | null; zone: string | null }>;
    totalInvoiced: number; totalPaid: number; renewalPaid: number;
    renewals: Array<{ id: string; code: string; status: string; months: number; previousEndDate: string; endDate: string; amount: number; discount: number; paid: number }>;
    transfers: Array<{ id: string; code: string; from: string; to: string; completedAt: string | null; handoverReport: unknown }>;
  };
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string | null;
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
