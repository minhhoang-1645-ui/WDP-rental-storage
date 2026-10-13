import { apiRequest } from './api';
import type { PricingEstimate } from '../types/booking';
import type { ServiceSelection } from '../types/additional-service';

export interface GuestBooking {
  bookingCode: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
  storage: { id: string; code: string; name: string };
  quantity: number;
  startDate: string;
  endDate: string;
  quote: PricingEstimate;
  reservationCode?: string | null;
  message?: string;
}

export const guestBookingApi = {
  create: (input: { fullName: string; email: string; phone: string; storageTypeId: string; quantity: number; startDate: string; endDate: string; paymentPlan: 'PAY_MONTHLY' | 'PREPAID'; services: ServiceSelection[] }, idempotencyKey: string) => apiRequest<GuestBooking>('/guest/booking-requests', { method: 'POST', body: JSON.stringify(input), authenticated: false, headers: { 'Idempotency-Key': idempotencyKey } }),
  verify: (token: string) => apiRequest<GuestBooking>('/guest/booking-requests/verify', { method: 'POST', authenticated: false, body: JSON.stringify({ token }) }),
  claim: (bookingCode: string) => apiRequest<{ reservationCode: string }>(`/customer/booking-requests/${encodeURIComponent(bookingCode)}/claim`, { method: 'POST', body: '{}' }),
};
