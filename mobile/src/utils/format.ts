export function formatMoney(value: number, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang thuê', OVERDUE: 'Quá hạn', OPEN: 'Đang mở', PARTIALLY_PAID: 'Đã trả một phần', PAID: 'Đã thanh toán', VOID: 'Đã hủy',
    REQUESTED: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', IN_PROGRESS: 'Đang xử lý',
    ASSIGNED: 'Đã phân công', ESCALATED: 'Đã chuyển quản lý', RESOLVED: 'Đã giải quyết', APPROVED: 'Đã duyệt', AWAITING_VERIFICATION: 'Chờ nghiệm thu',
    INSPECTION_IN_PROGRESS: 'Đang kiểm tra', ISSUE_FOUND: 'Có vấn đề', PENDING_SETTLEMENT: 'Chờ quyết toán',
  };
  return labels[status] ?? status;
}
