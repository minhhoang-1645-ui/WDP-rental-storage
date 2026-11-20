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
    ACCOUNT_ACTIVE: 'Đang hoạt động', DISABLED: 'Đã vô hiệu hóa', PENDING: 'Chờ duyệt', REJECTED: 'Đã từ chối', EXPIRED: 'Hết hạn',
    AVAILABLE: 'Kho trống', RESERVED: 'Đã giữ chỗ', OCCUPIED: 'Đang sử dụng', MAINTENANCE: 'Đang bảo trì',
    APPROVED_PENDING_PAYMENT: 'Đã duyệt, chờ thanh toán', PENDING_PAYMENT: 'Chờ thanh toán', READY_FOR_HANDOVER: 'Sẵn sàng bàn giao',
    PENDING_REVIEW: 'Chờ xét duyệt', AWAITING_OUTSTANDING_PAYMENT: 'Chờ trả phần thiếu', SETTLED: 'Đã quyết toán',
    PENDING_VERIFICATION: 'Chờ xác minh', VERIFIED: 'Đã xác minh', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao',
    BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', PREPAID: 'Trả trước', PAY_MONTHLY: 'Trả hàng tháng',
    CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', MANAGER: 'Quản lý', ADMIN: 'Quản trị viên',
    ACTIVE: 'Đang thuê', OVERDUE: 'Quá hạn', OPEN: 'Đang mở', PARTIALLY_PAID: 'Đã trả một phần', PAID: 'Đã thanh toán', VOID: 'Đã hủy',
    REQUESTED: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', IN_PROGRESS: 'Đang xử lý',
    ASSIGNED: 'Đã phân công', ESCALATED: 'Đã chuyển quản lý', RESOLVED: 'Đã giải quyết', APPROVED: 'Đã duyệt', AWAITING_VERIFICATION: 'Chờ nghiệm thu',
    INSPECTION_IN_PROGRESS: 'Đang kiểm tra', ISSUE_FOUND: 'Có vấn đề', PENDING_SETTLEMENT: 'Chờ quyết toán',
  };
  return labels[status] ?? status;
}
