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
