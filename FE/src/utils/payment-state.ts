export function paymentWindowClosed(invoice: { type?: unknown; reservation?: { status?: unknown; expiresAt?: unknown } }, now = Date.now()) {
  if (invoice.reservation?.status === 'EXPIRED') return true
  const deadline = invoice.reservation?.expiresAt
  return invoice.type === 'INITIAL' && typeof deadline === 'string' && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) <= now
}

export function paymentExpiry(expiresAt: unknown, createdAt: unknown): string {
  if (typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))) return expiresAt
  return typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)) ? new Date(Date.parse(createdAt) + 15 * 60_000).toISOString() : ''
}

export function paymentTimeLeft(expiresAt: unknown, now = Date.now()) {
  const deadline = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN
  if (!Number.isFinite(deadline)) return 'Đang kiểm tra thời hạn phiên'
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return seconds ? `Phiên còn ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Đã đến hạn phiên; đang kiểm tra kết quả thanh toán'
}
