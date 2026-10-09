export function formatPortalDate(value: string, includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function quoteLabel(amount: number | null) {
  return amount === null ? 'Cần xác nhận báo giá' : new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
}

export function moneyLabel(amount: number, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function customerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang thuê', OVERDUE: 'Quá hạn', PENDING_PAYMENT: 'Chờ thanh toán', READY_FOR_HANDOVER: 'Chờ bàn giao', COMPLETED: 'Hoàn tất',
    OPEN: 'Chưa thanh toán', PARTIALLY_PAID: 'Thanh toán một phần', PAID: 'Đã thanh toán', VOID: 'Đã hủy',
    REQUESTED: 'Đã yêu cầu', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy', PENDING: 'Chờ duyệt',
    APPROVED_PENDING_PAYMENT: 'Đã duyệt, chờ thanh toán', REJECTED: 'Bị từ chối',
  }
  return labels[status] ?? status
}
