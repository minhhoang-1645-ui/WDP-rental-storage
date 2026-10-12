import type { Catalog } from '../catalog/catalog-context'
import type { AvailabilityResult, AvailabilitySnapshot, BookingDraft } from '../types/booking'
import type { StorageSizeId } from '../types/storage'

export const DRAFT_STORAGE_KEY = 'wdp-booking-draft-v1'
export const AVAILABILITY_STORAGE_KEY = 'wdp-booking-availability-v1'
export const BOOKING_STEP_STORAGE_KEY = 'wdp-booking-step-v1'
export const AUTH_TOKEN_KEY = 'wdp-auth-token-v1'

export const initialBookingDraft: BookingDraft = {
  productId: 'sm-b12',
  startDate: '',
  endDate: '',
  periodMode: 'duration',
  durationMonths: 3,
  quantity: 1,
  adjacencyPreference: false,
  addonIds: [],
  note: '',
  paymentChoice: 'pay-later',
  paymentPlan: 'PAY_MONTHLY',
  customer: { fullName: '', phone: '', email: '' },
}

export const bookingVisuals: Record<StorageSizeId, { position: string; alt: string }> = {
  locker: { position: '0% 0%', alt: 'Minh họa isometric tủ lưu trữ với vali, hồ sơ và thùng đồ' },
  small: { position: '100% 0%', alt: 'Minh họa isometric kho nhỏ với nệm, ghế, xe đạp và thùng đồ' },
  medium: { position: '0% 100%', alt: 'Minh họa isometric kho vừa với sofa, tủ lạnh, bàn ăn và kệ' },
  large: { position: '100% 100%', alt: 'Minh họa isometric kho lớn với nội thất, thiết bị, pallet và kệ hàng' },
}

export function readBookingDraft(catalog: Catalog): BookingDraft {
  const storageListings = catalog.products
  const approvedDurations = catalog.approvedDurations
  const fallback = { ...initialBookingDraft, productId: storageListings.find(item => item.id === initialBookingDraft.productId)?.id ?? storageListings[0].id, durationMonths: approvedDurations.includes(3) ? 3 : approvedDurations[0] }
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? '') as Partial<BookingDraft>
    const productId = storageListings.some((item) => item.id === saved.productId) ? saved.productId! : fallback.productId
    const durationMonths = approvedDurations.includes(saved.durationMonths as 1 | 3 | 6 | 12) ? saved.durationMonths as 1 | 3 | 6 | 12 : null
    const quantity = Number.isInteger(saved.quantity) && Number(saved.quantity) >= 1 && Number(saved.quantity) <= 3 ? Number(saved.quantity) : 1
    const customer = saved.customer && typeof saved.customer === 'object' ? saved.customer : initialBookingDraft.customer
    return {
      ...initialBookingDraft,
      ...saved,
      productId,
      startDate: typeof saved.startDate === 'string' ? saved.startDate : '',
      endDate: typeof saved.endDate === 'string' ? saved.endDate : '',
      periodMode: saved.periodMode === 'dates' ? 'dates' : 'duration',
      durationMonths: durationMonths ?? fallback.durationMonths,
      quantity,
      adjacencyPreference: saved.adjacencyPreference === true && quantity > 1,
      addonIds: Array.isArray(saved.addonIds) ? [] : [],
      note: typeof saved.note === 'string' ? saved.note.slice(0, 500) : '',
      paymentChoice: saved.paymentChoice === 'pay-now' ? 'pay-now' : 'pay-later',
      paymentPlan: saved.paymentPlan === 'PREPAID' ? 'PREPAID' : 'PAY_MONTHLY',
      customer: {
        fullName: typeof customer.fullName === 'string' ? customer.fullName : '',
        phone: typeof customer.phone === 'string' ? customer.phone : '',
        email: typeof customer.email === 'string' ? customer.email : '',
        ...(typeof customer.note === 'string' ? { note: customer.note } : {}),
      },
    }
  } catch {
    return fallback
  }
}

export function bookingAvailabilityFingerprint(draft: BookingDraft) {
  return JSON.stringify({
    productId: draft.productId,
    startDate: draft.startDate,
    endDate: draft.endDate,
    periodMode: draft.periodMode,
    durationMonths: draft.durationMonths,
    quantity: draft.quantity,
    adjacencyPreference: draft.adjacencyPreference,
    addonIds: draft.addonIds,
    paymentPlan: draft.paymentPlan,
  })
}

export function readBookingAvailability(draft: BookingDraft): AvailabilityResult | null {
  try {
    const snapshot = JSON.parse(localStorage.getItem(AVAILABILITY_STORAGE_KEY) ?? '') as AvailabilitySnapshot
    return snapshot.fingerprint === bookingAvailabilityFingerprint(draft) ? snapshot.result : null
  } catch {
    return null
  }
}

export function saveBookingAvailability(draft: BookingDraft, result: AvailabilityResult) {
  const snapshot: AvailabilitySnapshot = { fingerprint: bookingAvailabilityFingerprint(draft), result }
  localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(snapshot))
}

export function clearBookingAvailability() {
  localStorage.removeItem(AVAILABILITY_STORAGE_KEY)
}

export function readBookingStep() {
  const value = Number(localStorage.getItem(BOOKING_STEP_STORAGE_KEY))
  return value >= 1 && value <= 3 ? value as 1 | 2 | 3 : 1
}

export function saveBookingStep(step: 1 | 2 | 3) {
  localStorage.setItem(BOOKING_STEP_STORAGE_KEY, String(step))
}

export function clearBookingDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY)
  localStorage.removeItem(AVAILABILITY_STORAGE_KEY)
  localStorage.removeItem(BOOKING_STEP_STORAGE_KEY)
}

export function saveBookingDraft(draft: BookingDraft) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
}
