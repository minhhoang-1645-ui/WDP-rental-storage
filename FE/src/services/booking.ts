import type { AuthSession, AvailabilityResult, BookingDraft, GuestInquiry, ManagerInquiry, ManagerRequestStatus, PendingReservation, PricingQuote, PublicUser } from '../types/booking'
import { apiRequest } from './api'

export const authApi = {
  register: (input: { fullName: string; email: string; phone: string; password: string }) =>
    apiRequest<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(input), authenticated: false, timeoutMs: 15000 }),
  login: (input: { email: string; password: string }) =>
    apiRequest<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(input), authenticated: false, timeoutMs: 15000 }),
  me: () => apiRequest<PublicUser>('/auth/me'),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
}

export const bookingApi = {
  quote: (input: { storageTypeId: string; quantity: number; startDate: string; endDate: string; paymentPlan: BookingDraft['paymentPlan']; services?: BookingDraft['services'] }, signal?: AbortSignal) =>
    apiRequest<PricingQuote>('/pricing/quote', { method: 'POST', body: JSON.stringify(input), signal }),
  availability: (draft: BookingDraft, signal?: AbortSignal) =>
    apiRequest<AvailabilityResult>('/booking/availability', { method: 'POST', body: JSON.stringify(draft), signal }),
  createReservation: (draft: BookingDraft) =>
    apiRequest<PendingReservation>('/reservations', { method: 'POST', body: JSON.stringify(draft) }),
  createInquiry: (draft: BookingDraft) =>
    apiRequest<GuestInquiry>('/inquiries', { method: 'POST', body: JSON.stringify({ ...draft, ...draft.customer, note: draft.note }) }),
  list: (signal?: AbortSignal) => apiRequest<PendingReservation[]>('/reservations', { signal }),
  getReservation: (id: string, signal?: AbortSignal) => apiRequest<PendingReservation>('/reservations/' + encodeURIComponent(id), { signal }),
  getInquiry: (id: string, accessToken: string, signal?: AbortSignal) => apiRequest<GuestInquiry>('/inquiries/' + encodeURIComponent(id), { signal, headers: { 'X-Inquiry-Access-Token': accessToken } }),
}

export const managerApi = {
  listInquiries: (page = 1, limit = 20, signal?: AbortSignal) =>
    apiRequest<{ page: number; limit: number; total: number; items: ManagerInquiry[] }>(`/manager/inquiries?page=${page}&limit=${limit}`, { signal }),
  getInquiry: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerInquiry>('/manager/inquiries/' + encodeURIComponent(id), { signal }),
  updateInquiry: (id: string, input: { status: ManagerRequestStatus; internalNotes: string }) =>
    apiRequest<ManagerInquiry>('/manager/inquiries/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(input) }),
  getReservation: (id: string, signal?: AbortSignal) =>
    apiRequest<ManagerInquiry>('/manager/reservations/' + encodeURIComponent(id), { signal }),
  updateReservationStatus: (id: string, status: Extract<ManagerRequestStatus, 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'>) =>
    apiRequest<ManagerInquiry>('/manager/reservations/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }),
}
