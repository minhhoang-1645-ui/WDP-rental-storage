export type Row = Record<string, unknown>;
export const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
export const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
export function at(row: Row, path: string): unknown { return path.split('.').reduce<unknown>((value, key) => object(value)[key], row); }
export function text(row: Row, ...paths: string[]): string {
  for (const path of paths) { const value = at(row, path); if (typeof value === 'string' || typeof value === 'number') return String(value); }
  return '';
}
export const idOf = (row: Row) => text(row, 'databaseId', 'id', 'reservationId');
export const codeOf = (row: Row) => text(row, 'movementCode', 'reference', 'contractCode', 'invoiceCode', 'paymentCode', 'appointmentCode', 'renewalCode', 'returnCode', 'transferCode', 'maintenanceCode', 'supportCode', 'settlementCode', 'submissionCode', 'unitCode', 'code', 'reservationReference', 'email', 'id');

export interface ResourceDefinition { title: string; path: string; shape?: 'catalog' | 'array'; statuses?: string[] }
export const resources: Record<string, ResourceDefinition> = {
  'stock-movements': { title: 'Nhập – xuất hàng', path: '/manager/stock-movements', statuses: ['REQUESTED', 'ASSIGNED', 'COMPLETED', 'CANCELLED'] },
  inquiries: { title: 'Yêu cầu tư vấn', path: '/manager/inquiries', statuses: ['PENDING_CONTACT', 'CONTACTED', 'IN_REVIEW', 'CLOSED', 'CANCELLED'] },
  reservations: { title: 'Yêu cầu đặt kho', path: '/manager/reservations', statuses: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
  units: { title: 'Kho vật lý', path: '/manager/units', statuses: ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE'] },
  catalog: { title: 'Loại kho & bảng giá', path: '/booking/catalog', shape: 'catalog' },
  'additional-services': { title: 'Dịch vụ bổ sung', path: '/manager/additional-services', shape: 'array' },
  customers: { title: 'Khách hàng', path: '/manager/customers' },
  appointments: { title: 'Lịch bàn giao', path: '/manager/appointments', statuses: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] },
  contracts: { title: 'Hợp đồng thuê', path: '/manager/contracts', statuses: ['PENDING_PAYMENT', 'READY_FOR_HANDOVER', 'ACTIVE', 'COMPLETED'] },
  rentals: { title: 'Kho đang thuê', path: '/manager/rentals', statuses: ['ACTIVE', 'OVERDUE'] },
  renewals: { title: 'Gia hạn kho', path: '/manager/renewals', statuses: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED'] },
  transfers: { title: 'Chuyển kho', path: '/manager/transfers', statuses: ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] },
  returns: { title: 'Trả kho & kiểm tra', path: '/manager/returns', statuses: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'PENDING_SETTLEMENT', 'COMPLETED'] },
  invoices: { title: 'Hóa đơn', path: '/manager/invoices', statuses: ['OPEN', 'PARTIALLY_PAID', 'PAID'] },
  payments: { title: 'Khoản thu đã ghi nhận', path: '/manager/payments' },
  'payment-submissions': { title: 'Đối chiếu chuyển khoản', path: '/manager/payment-submissions', statuses: ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'] },
  'deposit-settlements': { title: 'Quyết toán cọc', path: '/manager/deposit-settlements', statuses: ['PENDING_REVIEW', 'APPROVED', 'AWAITING_OUTSTANDING_PAYMENT', 'SETTLED'] },
  maintenance: { title: 'Bảo trì kho', path: '/manager/maintenance', statuses: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'] },
  'support-requests': { title: 'Hỗ trợ khách hàng', path: '/manager/support-requests', statuses: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'] },
};
export const adminSections = [
  ['dashboard', 'Tổng quan hệ thống'], ['users', 'Quản lý tài khoản người dùng'],
] as const;
const labels: Record<string, string> = {
  VOID: 'Đã hủy', UNINSPECTED: 'Chưa kiểm tra',
  LOCK_OR_KEY_ISSUE: 'Vấn đề khóa/chìa khóa', ACCESS_CODE_ISSUE: 'Vấn đề mã truy cập', PAYMENT_SUPPORT: 'Hỗ trợ thanh toán', STORED_ITEM_CONCERN: 'Vấn đề hàng đang gửi', DAILY: 'Theo ngày', MONTHLY: 'Theo tháng',
  INITIAL: 'Hóa đơn ban đầu', RECURRING: 'Hóa đơn định kỳ', RENEWAL: 'Hóa đơn gia hạn', SETTLEMENT: 'Hóa đơn quyết toán', INCLUDED: 'Đã tính trong báo giá', PRICED: 'Đã có báo giá', QUOTE_REQUIRED: 'Cần xác nhận báo giá', dates: 'Chọn khoảng ngày', duration: 'Chọn số tháng', INQUIRY: 'Yêu cầu tư vấn', RESERVATION: 'Yêu cầu đặt kho', ok: 'Đã kết nối',
  PENDING_CONTACT: 'Chờ liên hệ', CONTACTED: 'Đã liên hệ', IN_REVIEW: 'Đang xem xét', CLOSED: 'Đã đóng', PENDING: 'Chờ duyệt', CONFIRMED: 'Đã xác nhận', REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Đã hết hạn',
  AVAILABLE: 'Sẵn sàng', RESERVED: 'Đã phân bổ', OCCUPIED: 'Đang sử dụng', MAINTENANCE: 'Đang bảo trì', ACTIVE: 'Đang hoạt động', DISABLED: 'Đã vô hiệu hóa', OVERDUE: 'Quá hạn', REQUESTED: 'Chờ xử lý', COMPLETED: 'Hoàn tất',
  PENDING_PAYMENT: 'Chờ thanh toán', READY_FOR_HANDOVER: 'Sẵn sàng bàn giao', OPEN: 'Đang mở', PARTIALLY_PAID: 'Đã trả một phần', PAID: 'Đã thanh toán', APPROVED: 'Đã duyệt', APPROVED_PENDING_PAYMENT: 'Đã duyệt, chờ thanh toán',
  PENDING_VERIFICATION: 'Chờ xác nhận', VERIFIED: 'Đã xác nhận', INSPECTION_IN_PROGRESS: 'Đang kiểm tra', ISSUE_FOUND: 'Có vấn đề', PASS: 'Đạt', PENDING_SETTLEMENT: 'Chờ quyết toán', PENDING_REVIEW: 'Chờ duyệt', AWAITING_OUTSTANDING_PAYMENT: 'Chờ thu bổ sung', SETTLED: 'Đã quyết toán',
  IN_PROGRESS: 'Đang xử lý', AWAITING_VERIFICATION: 'Chờ nghiệm thu', ASSIGNED: 'Đã phân công', ESCALATED: 'Chờ xem xét', RESOLVED: 'Đã giải quyết', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao',
  CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', MANAGER: 'Quản lý', ADMIN: 'Quản trị viên', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', VNPAY: 'VNPay', PURCHASE: 'Mua', RENTAL: 'Thuê', ONE_TIME: 'Một lần', DAY: 'Ngày', MONTH: 'Tháng',
  STANDARD: 'Tiêu chuẩn', AIR_CONDITIONED: 'Điều hòa', standard: 'Tiêu chuẩn', climate: 'Điều hòa', PAY_MONTHLY: 'Hàng tháng', PREPAID: 'Trả trước',
  UNIT_ISSUE: 'Vấn đề kho', FACILITY_EQUIPMENT_FAILURE: 'Lỗi thiết bị cơ sở', OPERATIONAL_RELOCATION: 'Điều chuyển vận hành', OTHER: 'Khác', UNIT_DAMAGE: 'Hư hỏng kho', CLEANING: 'Vệ sinh', LOCK_OR_ACCESS: 'Khóa hoặc truy cập', FACILITY_EQUIPMENT: 'Thiết bị cơ sở',
  NORMAL_WEAR: 'Hao mòn thông thường', FACILITY_FAULT: 'Lỗi cơ sở', CUSTOMER_DAMAGE: 'Hư hỏng do khách', CLEANING_REQUIRED: 'Cần vệ sinh', LOST_KEY_OR_ACCESS_ITEM: 'Mất khóa/vật phẩm truy cập',
  ON_SITE_RESOLVED: 'Đã xử lý tại chỗ', CUSTOMER_GUIDANCE: 'Đã hướng dẫn khách', ACCESS_RESTORED: 'Đã khôi phục truy cập', PAYMENT_GUIDANCE: 'Đã hướng dẫn thanh toán', MANAGER_RESOLVED: 'Đã xử lý sau chuyển tiếp', TRANSFER_RECOMMENDED: 'Đề xuất chuyển kho', NO_ACTION_REQUIRED: 'Không cần xử lý',
};
export const label = (value: unknown) => typeof value === 'string' ? labels[value] ?? value : '—';
export const options = (values: string[]) => values.map(value => ({ value, label: label(value) }));
export const operationRoot = (role: string) => role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : '/manager';
