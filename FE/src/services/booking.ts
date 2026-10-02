import type { AuthSession, AvailabilityResult, BookingDraft, GuestInquiry, PendingReservation, PublicUser } from '../types/booking'
import { apiRequest } from './api'

export const authApi = {
  register: (input: { fullName: string; email: string; phone: string; password: string }) =>
    apiRequest<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    apiRequest<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => apiRequest<PublicUser>('/auth/me'),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
}

export const bookingApi = {
  availability: (draft: BookingDraft, signal?: AbortSignal) =>
    apiRequest<AvailabilityResult>('/booking/availability', { method: 'POST', body: JSON.stringify(draft), signal }),
  createReservation: (draft: BookingDraft) =>
    apiRequest<PendingReservation>('/reservations', { method: 'POST', body: JSON.stringify(draft) }),
  createInquiry: (draft: BookingDraft) =>
    apiRequest<GuestInquiry>('/inquiries', { method: 'POST', body: JSON.stringify({ ...draft, ...draft.customer, note: draft.note }) }),
  list: (signal?: AbortSignal) => apiRequest<PendingReservation[]>('/reservations', { signal }),
  getReservation: (id: string, signal?: AbortSignal) => apiRequest<PendingReservation>('/reservations/' + encodeURIComponent(id), { signal }),
  getInquiry: (id: string, signal?: AbortSignal) => apiRequest<GuestInquiry>('/inquiries/' + encodeURIComponent(id), { signal }),
}
