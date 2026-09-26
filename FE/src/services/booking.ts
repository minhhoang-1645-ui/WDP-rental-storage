import type { AuthSession, AvailabilityResult, BookingDraft, GuestInquiry, PendingReservation, PublicUser } from '../types/booking'
import { apiRequest } from './api'

export const authApi = {
  register: (input: { fullName: string; email: string; phone: string; password: string }) =>
    apiRequest<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    apiRequest<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => apiRequest<PublicUser>('/auth/me'),
}

export const bookingApi = {
  availability: (draft: BookingDraft, signal?: AbortSignal) =>
    apiRequest<AvailabilityResult>('/booking/availability', { method: 'POST', body: JSON.stringify(draft), signal }),
  createReservation: (draft: BookingDraft) =>
    apiRequest<PendingReservation>('/reservations', { method: 'POST', body: JSON.stringify(draft) }),
  createInquiry: (draft: BookingDraft) =>
    apiRequest<GuestInquiry>('/inquiries', { method: 'POST', body: JSON.stringify(draft) }),
  list: () => apiRequest<PendingReservation[]>('/reservations'),
  getReservation: (id: string) => apiRequest<PendingReservation>('/reservations/' + encodeURIComponent(id)),
  getInquiry: (id: string) => apiRequest<GuestInquiry>('/inquiries/' + encodeURIComponent(id)),
}
