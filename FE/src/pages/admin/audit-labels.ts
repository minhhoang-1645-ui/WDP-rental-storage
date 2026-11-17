export const auditResources: Record<string, string> = {
  auth: 'Tài khoản', users: 'Người dùng', units: 'Kho', 'storage-types': 'Loại kho', reservations: 'Đặt kho', contracts: 'Hợp đồng', renewals: 'Gia hạn', appointments: 'Lịch bàn giao', maintenance: 'Bảo trì', returns: 'Trả kho', 'early-return-requests': 'Trả trước hạn', transfers: 'Chuyển kho', 'stock-movements': 'Nhập/xuất hàng', 'stored-items': 'Hàng lưu kho', 'additional-services': 'Dịch vụ', payments: 'Thanh toán', invoices: 'Hóa đơn', 'payment-submissions': 'Thông báo chuyển khoản', 'online-payment-reconciliations': 'Kiểm tra thanh toán VNPay', 'support-requests': 'Hỗ trợ', 'deposit-settlements': 'Xử lý tiền cọc', 'unit-staff': 'Phụ trách kho', 'staff-assignments': 'Phân công', inquiries: 'Tư vấn',
};
const actions: Record<string, string> = { ONLINE_PAYMENT: 'Mở phiên thanh toán', SIGNATURE_OTP: 'Gửi mã xác nhận', STAFF_ASSIGNMENT: 'Phân công', AUTH_LOGIN: 'Đăng nhập', AUTH_LOGOUT: 'Đăng xuất', AUTH_REGISTER: 'Đăng ký', CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa', STATUS: 'Đổi trạng thái', APPROVE: 'Phê duyệt', REJECT: 'Từ chối', CONFIRM: 'Xác nhận', COMPLETE: 'Hoàn tất', FINALIZE: 'Hoàn tất', ASSIGN: 'Phân công', RESOLVE: 'Giải quyết', VERIFY: 'Nghiệm thu', REJECT_VERIFICATION: 'Yêu cầu sửa lại', PAYMENTS: 'Ghi nhận thanh toán', SIGN: 'Xác nhận hợp đồng', ACCEPT: 'Chấp thuận', START: 'Bắt đầu', START_INSPECTION: 'Bắt đầu kiểm tra', RECONCILE: 'Đối soát', SUBMIT: 'Gửi yêu cầu' };
actions.AUTH_PROFILE_UPDATE = 'Cập nhật thông tin liên hệ';
auditResources['business-policies'] = 'Chính sách hệ thống';
auditResources['transfer-orders'] = 'Phụ lục chuyển kho';
auditResources['booking-requests'] = 'Đơn đặt kho';
auditResources['damage-claims'] = 'Sự cố hàng hóa';

const resourceActions: Record<string, Record<string, string>> = {
  users: {
    CREATE: 'Tạo tài khoản', UPDATE: 'Cập nhật thông tin tài khoản', STATUS: 'Đổi trạng thái tài khoản',
    DISABLE_ACCOUNT: 'Khóa tài khoản', REACTIVATE_ACCOUNT: 'Mở khóa tài khoản',
    ACCOUNT_STATUS_UNCHANGED: 'Giữ nguyên trạng thái tài khoản',
  },
  'stock-movements': { CREATE: 'Tạo phiếu nhập/xuất hàng', ASSIGN: 'Phân công nhập/xuất hàng', COMPLETE: 'Hoàn tất nhập/xuất hàng' },
  'support-requests': { CREATE: 'Gửi yêu cầu hỗ trợ', ASSIGN: 'Phân công xử lý hỗ trợ', START: 'Bắt đầu xử lý hỗ trợ', RESOLVE: 'Giải quyết yêu cầu hỗ trợ', ESCALATE: 'Chuyển yêu cầu hỗ trợ lên quản lý', PRIORITY: 'Đổi mức ưu tiên hỗ trợ' },
  maintenance: { CREATE: 'Tạo phiếu bảo trì', ASSIGN: 'Phân công bảo trì', START: 'Bắt đầu bảo trì', COMPLETE_WORK: 'Báo hoàn thành bảo trì', VERIFY: 'Kiểm tra kết quả bảo trì', REJECT_VERIFICATION: 'Yêu cầu bảo trì lại', PRIORITY: 'Đổi mức ưu tiên bảo trì' },
  units: { STAFF_ASSIGNMENT: 'Phân công nhân viên phụ trách kho' },
  appointments: { CREATE: 'Đặt lịch bàn giao', COMPLETE_HANDOVER: 'Hoàn tất bàn giao' },
  reservations: { CREATE: 'Gửi yêu cầu đặt kho' },
  contracts: { ACCEPT: 'Xác nhận hợp đồng', SIGN: 'Ký hợp đồng' },
  renewals: { ACCEPT: 'Ký phụ lục gia hạn' },
  'early-return-requests': { DECISION: 'Ghi nhận quyết định trả trước hạn' },
  invoices: { PAYMENTS: 'Ghi nhận khoản thu', ONLINE_PAYMENT: 'Mở phiên thanh toán trực tuyến', PAYMENT_SUBMISSIONS: 'Gửi thông báo chuyển khoản', DEMO_PAYMENT_SUBMISSIONS: 'Gửi thông báo chuyển khoản mô phỏng' },
  'payment-submissions': { VERIFY: 'Xác nhận chuyển khoản', REJECT: 'Từ chối xác nhận chuyển khoản' },
  'deposit-settlements': { REVIEW: 'Xét duyệt quyết toán cọc', REFUND: 'Ghi nhận hoàn cọc' },
  'booking-requests': { CLAIM: 'Nhận đơn đặt kho đã xác minh' },
  'transfer-orders': { ACCEPT: 'Ký phụ lục chuyển kho' },
};

export type AuditEvent = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  targetAccount?: { fullName: string; role: string } | null;
  actorName?: string | null;
  attemptAccountName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  createdAt: string;
  outcome: 'SUCCESS' | 'FAILURE';
};
export type AuditPage = { page: number; limit: number; total: number; items: AuditEvent[] };

export function auditTitle(event: AuditEvent) {
  if (event.outcome === 'FAILURE') {
    if (event.action === 'AUTH_LOGIN_ACCOUNT_DISABLED') return 'Đăng nhập thất bại do tài khoản đã khóa';
    if (event.action === 'AUTH_LOGIN') return 'Đăng nhập thất bại';
    if (event.action === 'AUTH_LOGOUT') return 'Đăng xuất thất bại';
  }
  return resourceActions[event.resource]?.[event.action] ?? actions[event.action] ?? 'Hoạt động chưa có nhãn';
}

export const auditResource = (value: string) => auditResources[value] ?? 'Hồ sơ';
export const auditActor = (event: AuditEvent) => event.actorName || event.attemptAccountName || event.actorEmail || 'Không xác định tài khoản';

export function auditRecordPath(event: AuditEvent) {
  if (event.resource === 'users' && event.outcome === 'SUCCESS' && event.resourceId) {
    return `/admin/users/${encodeURIComponent(event.resourceId)}`;
  }
}
