export const auditResources: Record<string, string> = {
  auth: 'Tài khoản', users: 'Người dùng', units: 'Kho', 'storage-types': 'Loại kho', reservations: 'Đặt kho', contracts: 'Hợp đồng', renewals: 'Gia hạn', appointments: 'Lịch bàn giao', maintenance: 'Bảo trì', returns: 'Trả kho', 'early-return-requests': 'Trả trước hạn', transfers: 'Chuyển kho', 'stock-movements': 'Nhập/xuất hàng', 'stored-items': 'Hàng lưu kho', 'additional-services': 'Dịch vụ', payments: 'Thanh toán', invoices: 'Hóa đơn', 'payment-submissions': 'Thông báo chuyển khoản', 'online-payment-reconciliations': 'Kiểm tra thanh toán VNPay', 'support-requests': 'Hỗ trợ', 'deposit-settlements': 'Xử lý tiền cọc', 'unit-staff': 'Phụ trách kho', 'staff-assignments': 'Phân công', inquiries: 'Tư vấn',
};
const actions: Record<string, string> = { ONLINE_PAYMENT: 'Mở phiên thanh toán', SIGNATURE_OTP: 'Gửi mã xác nhận', STAFF_ASSIGNMENT: 'Phân công', AUTH_LOGIN: 'Đăng nhập', AUTH_LOGOUT: 'Đăng xuất', AUTH_REGISTER: 'Đăng ký', CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa', STATUS: 'Đổi trạng thái', APPROVE: 'Phê duyệt', REJECT: 'Từ chối', CONFIRM: 'Xác nhận', COMPLETE: 'Hoàn tất', FINALIZE: 'Hoàn tất', ASSIGN: 'Phân công', RESOLVE: 'Giải quyết', VERIFY: 'Nghiệm thu', REJECT_VERIFICATION: 'Yêu cầu sửa lại', PAYMENTS: 'Ghi nhận thanh toán', SIGN: 'Xác nhận hợp đồng', ACCEPT: 'Chấp thuận', START: 'Bắt đầu', START_INSPECTION: 'Bắt đầu kiểm tra', RECONCILE: 'Đối soát', SUBMIT: 'Gửi yêu cầu' };
const businessActions: Record<string, string> = {
  FACILITY_LIFECYCLE: 'Thay đổi trạng thái kinh doanh',
  FACILITY_SCHEDULE_IMPACT: 'Cập nhật lịch hoạt động cơ sở',
  PUBLISH_GROUP_PRICE_RANGE: 'Công bố khung giá thuê',
  CHANGE_ROLE: 'Thay đổi vai trò',
  GRANT_FACILITY_ACCESS: 'Cấp quyền truy cập cơ sở',
  REVOKE_FACILITY_ACCESS: 'Thu hồi quyền truy cập cơ sở',
  REVOKE_SESSION: 'Thu hồi phiên đăng nhập',
  REVOKE_SESSIONS: 'Thu hồi toàn bộ phiên đăng nhập',
  CREATE_SHIFT: 'Xếp ca nhân viên', CHANGE_SHIFT: 'Điều chỉnh ca làm',
  CHANGE_SHIFT_STATUS: 'Thay đổi trạng thái ca làm', CHECK_IN: 'Xác nhận vào ca',
  CHECK_OUT: 'Kết thúc ca', START_BREAK: 'Bắt đầu nghỉ giữa ca', END_BREAK: 'Kết thúc nghỉ giữa ca',
  TASK_ASSIGNMENT: 'Phân công nhiệm vụ', RETURN_INSPECTION_SCHEDULE: 'Cập nhật lịch kiểm tra trả kho',
  ONLINE_PAYMENT: 'Mở phiên thanh toán trực tuyến',
  CONFIRM_OFFERING_CONFIGURATION: 'Xác nhận cấu hình dịch vụ bổ trợ',
  UPDATE_OFFERING_QUANTITY: 'Cập nhật số lượng dịch vụ tại cơ sở',
  UPDATE_SHARED_SERVICE_CATALOG: 'Cập nhật danh mục bổ trợ chung',
  DELIVER_PURCHASED_PRODUCTS: 'Bàn giao sản phẩm đã mua',
  OVERDUE_RETURN_FACILITY_REVIEW: 'Xác minh lỗi cơ sở khi trả kho quá hạn',
  TRANSFER_REFUND_CONFIRMED: 'Xác nhận hoàn tiền chuyển kho',
  MANAGER_CLOSURE_NOTICE: 'Thông báo kế hoạch ngừng kinh doanh',
  RELOCATION_ASSIGNED: 'Phân công xử lý di dời',
  RELOCATION_PROPOSED: 'Đề xuất phương án di dời',
  RELOCATION_DECLINED: 'Từ chối phương án di dời',
  RELOCATION_RESERVED: 'Giữ kho cho phương án di dời',
  RELOCATION_RECEIVING_ASSIGNED: 'Phân công tiếp nhận di dời',
  RELOCATION_COMPLETED: 'Hoàn tất di dời',
  RELOCATION_EXCEPTION: 'Ghi nhận ngoại lệ di dời',
  RELOCATION_CANCELLED: 'Hủy phương án di dời',
  CLOSURE_BOOKING_REFUND_PENDING: 'Ghi nhận chờ hoàn tiền do ngừng kinh doanh',
  CLOSURE_BOOKING_REFUND_RECORDED: 'Ghi nhận hoàn tiền do ngừng kinh doanh',
  CLOSURE_BOOKING_CANCELLED: 'Hủy đơn do ngừng kinh doanh',
  BOOKING_CANCELLATION_REQUEST: 'Yêu cầu hủy đơn đã thanh toán',
  BOOKING_CANCELLATION_RECOVER: 'Xác nhận thu hồi quyền truy cập kho',
  BOOKING_CANCELLATION_APPROVE: 'Duyệt hủy đơn đã thanh toán',
  BOOKING_CANCELLATION_REJECT: 'Từ chối hủy đơn đã thanh toán',
  BOOKING_CANCELLATION_REFUND: 'Ghi nhận hoàn tiền hủy đơn',
  MAINTENANCE_DISPATCH_READY: 'Cập nhật khả năng phân công bảo trì',
  INCIDENT_BOOKING_SCOPE: 'Cập nhật phạm vi kho bị ảnh hưởng bởi sự cố',
  INCIDENT_VERIFIED: 'Nghiệm thu xử lý sự cố',
  INCIDENT_VERIFICATION_REJECTED: 'Yêu cầu xử lý lại sự cố',
};

const historicalRoles: Record<string, string> = { CUSTOMER: 'STORAGE_CUSTOMER', MANAGER: 'FACILITY_MANAGER', STAFF: 'FACILITY_STAFF' };
export const auditRole = (role: string) => historicalRoles[role] ?? role;

actions.AUTH_PROFILE_UPDATE = 'Cập nhật thông tin liên hệ';
auditResources['facility-access'] = 'Quyền cơ sở';
auditResources['business-policies'] = 'Chính sách hệ thống';
auditResources['transfer-orders'] = 'Phụ lục chuyển kho';
auditResources['booking-requests'] = 'Đơn đặt kho';
auditResources['damage-claims'] = 'Sự cố hàng hóa';
Object.assign(auditResources, {
  users: 'Tài khoản', facility: 'Cơ sở', facilities: 'Cơ sở', 'staff-shifts': 'Ca làm',
  'business-rules': 'Quy tắc kinh doanh', 'business-policies': 'Chính sách thuê kho', 'pricing-rules': 'Khung giá thuê',
  'facility-service-offering': 'Dịch vụ tại cơ sở', 'shared-service-catalog': 'Danh mục bổ trợ chung',
  'additional-services': 'Dịch vụ bổ trợ', relocation: 'Phương án di dời',
});

const resourceActions: Record<string, Record<string, string>> = {
  users: {
    CREATE: 'Tạo tài khoản', UPDATE: 'Cập nhật thông tin tài khoản', STATUS: 'Đổi trạng thái tài khoản',
    DISABLE_ACCOUNT: 'Khóa tài khoản', REACTIVATE_ACCOUNT: 'Mở khóa tài khoản',
    REVOKE: businessActions.REVOKE_SESSIONS,
    ACCOUNT_STATUS_UNCHANGED: 'Giữ nguyên trạng thái tài khoản',
  },
  'facility-access': { CREATE: businessActions.GRANT_FACILITY_ACCESS, ROLE: businessActions.CHANGE_ROLE, REVOKE: businessActions.REVOKE_FACILITY_ACCESS },
  facilities: { CREATE: 'Tạo cơ sở mới', UPDATE: 'Cập nhật thông tin cơ sở' },
  'business-policies': { UPDATE: 'Cập nhật chính sách thuê kho' },
  'pricing-rules': { CREATE: businessActions.PUBLISH_GROUP_PRICE_RANGE },
  'additional-services': { CREATE: 'Tạo mục danh mục bổ trợ', UPDATE: 'Cập nhật dịch vụ bổ trợ', INVENTORY: 'Cập nhật tồn dịch vụ bổ trợ', OFFERINGS: 'Cấu hình dịch vụ bổ trợ' },
  'damage-claims': { CREATE: 'Báo cáo sự cố hàng hóa', ASSIGN: 'Phân công xử lý sự cố hàng hóa', HANDOVER: 'Ghi nhận bàn giao bồi thường', UPDATE: 'Cập nhật hồ sơ sự cố hàng hóa' },
  'online-payment-reconciliations': { RESOLVE: 'Xử lý ngoại lệ thanh toán trực tuyến' },
  inquiries: { CREATE: 'Tạo yêu cầu tư vấn', UPDATE: 'Cập nhật yêu cầu tư vấn' },
  'stock-movements': { CREATE: 'Tạo phiếu nhập/xuất hàng', ASSIGN: 'Phân công nhập/xuất hàng', COMPLETE: 'Hoàn tất nhập/xuất hàng' },
  'support-requests': { CREATE: 'Gửi yêu cầu hỗ trợ', ASSIGN: 'Phân công xử lý hỗ trợ', START: 'Bắt đầu xử lý hỗ trợ', RESOLVE: 'Giải quyết yêu cầu hỗ trợ', ESCALATE: 'Chuyển yêu cầu hỗ trợ lên quản lý', PRIORITY: 'Đổi mức ưu tiên hỗ trợ', RESUME: 'Tiếp tục xử lý hỗ trợ', WAIT_CUSTOMER: 'Chờ khách hàng phản hồi' },
  maintenance: { CREATE: 'Tạo phiếu bảo trì', ASSIGN: 'Phân công bảo trì', START: 'Bắt đầu bảo trì', COMPLETE_WORK: 'Báo hoàn thành bảo trì', VERIFY: 'Kiểm tra kết quả bảo trì', REJECT_VERIFICATION: 'Yêu cầu bảo trì lại', PRIORITY: 'Đổi mức ưu tiên bảo trì', BOOKING_IMPACT: 'Cập nhật ảnh hưởng đặt kho do bảo trì', DISPATCH_READY: 'Cập nhật khả năng phân công bảo trì', HOLD_UNSAFE_UNIT: 'Tạm dừng sử dụng kho chưa an toàn' },
  units: { UPDATE: 'Cập nhật thông tin kho', STAFF_ASSIGNMENT: 'Phân công nhân viên phụ trách kho' },
  appointments: { CREATE: 'Đặt lịch bàn giao', COMPLETE_HANDOVER: 'Hoàn tất bàn giao', HANDOVER: 'Ghi nhận bàn giao kho', ASSIGN: 'Phân công bàn giao', CONFIRM: 'Xác nhận lịch bàn giao', RESCHEDULE: 'Đổi lịch bàn giao', SCHEDULE: 'Xử lý lịch bàn giao' },
  reservations: { CREATE: 'Gửi yêu cầu đặt kho', CANCEL: 'Hủy đơn đặt kho', STATUS: 'Đổi trạng thái đơn đặt kho', PAID_CANCELLATION: 'Xử lý hủy đơn đã thanh toán' },
  returns: { CREATE: 'Yêu cầu trả kho', ASSIGN: 'Phân công kiểm tra trả kho', AUTHORIZE_SAFETY: 'Xác nhận điều kiện an toàn trả kho',
    START_INSPECTION: 'Bắt đầu kiểm tra trả kho', FINALIZE: 'Hoàn tất trả kho', UPDATE: 'Cập nhật hồ sơ trả kho' },
  transfers: { CREATE: 'Yêu cầu chuyển kho', APPROVE: 'Duyệt chuyển kho', REJECT: 'Từ chối chuyển kho', ASSIGN: 'Phân công chuyển kho',
    COMPLETE: 'Hoàn tất chuyển kho', DESTINATION_HANDOVER: 'Bàn giao kho đích', COMMERCIAL_REFUND: 'Ghi nhận hoàn tiền chuyển kho',
    PROBLEM: 'Báo vấn đề khi chuyển kho', REVIEW_PROBLEM: 'Xử lý vấn đề khi chuyển kho', START_SOURCE_INSPECTION: 'Bắt đầu kiểm tra kho nguồn' },
  contracts: { ACCEPT: 'Xác nhận hợp đồng', SIGN: 'Ký hợp đồng' },
  renewals: { ACCEPT: 'Ký phụ lục gia hạn', CREATE: 'Yêu cầu gia hạn', APPROVE: 'Duyệt gia hạn', REJECT: 'Từ chối gia hạn', CANCEL: 'Hủy yêu cầu gia hạn' },
  'early-return-requests': { DECISION: 'Ghi nhận quyết định trả trước hạn', FACILITY_REVIEW: 'Xác minh cơ sở khi trả trước hạn', FINANCIAL_REVIEW: 'Xét duyệt tài chính trả trước hạn', REFUND_CONFIRMATION: 'Xác nhận hoàn tiền trả trước hạn', SETTLEMENT_APPROVAL: 'Duyệt quyết toán trả trước hạn' },
  invoices: { PAYMENTS: 'Ghi nhận khoản thu', ONLINE_PAYMENT: businessActions.ONLINE_PAYMENT, PAYMENT_SUBMISSIONS: 'Gửi thông báo chuyển khoản', DEMO_PAYMENT_SUBMISSIONS: 'Gửi thông báo chuyển khoản mô phỏng' },
  'payment-submissions': { VERIFY: 'Xác nhận chuyển khoản', REJECT: 'Từ chối xác nhận chuyển khoản' },
  'deposit-settlements': { REVIEW: 'Xét duyệt quyết toán cọc', REFUND: 'Ghi nhận hoàn cọc', CONFIRM_RETURN_REFUND: 'Xác nhận hoàn tiền trả kho' },
  'booking-requests': { CLAIM: 'Nhận đơn đặt kho đã xác minh' },
  'transfer-orders': { ACCEPT: 'Ký phụ lục chuyển kho' },
};

export type AuditEvent = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  targetUserId?: string | null;
  targetAccount?: { fullName: string; role: string } | null;
  facilityName?: string | null;
  route?: string;
  metadata?: { facilityId?: string; previousRole?: string; nextRole?: string; sessionId?: string; count?: number; [key: string]: unknown } | null;
  entityType?: string | null;
  actorName?: string | null;
  actorId?: string | null;
  ipAddress?: string | null;
  attemptAccountName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  createdAt: string;
  outcome: 'SUCCESS' | 'FAILURE';
};
export type AuditPage = { page: number; limit: number; total: number; items: AuditEvent[] };

export const unclassifiedActivity = 'Hoạt động chưa phân loại';
const genericVerbs: Record<string, string> = { CREATE: 'Tạo', UPDATE: 'Cập nhật', DELETE: 'Xóa' };
const modelResources = new Map([
  ['Facility', 'facilities'], ['StorageType', 'storage-types'], ['StorageUnit', 'units'], ['Unit', 'units'],
  ['User', 'users'], ['FacilityAccess', 'facility-access'], ['BusinessPolicy', 'business-policies'],
  ['BusinessRule', 'business-rules'], ['StaffShift', 'staff-shifts'], ['FacilityServiceOffering', 'facility-service-offering'],
  ['AdditionalService', 'additional-services'], ['Reservation', 'reservations'], ['Invoice', 'invoices'],
  ['RentalContract', 'contracts'], ['HandoverAppointment', 'appointments'], ['RenewalRequest', 'renewals'],
  ['ReturnRequest', 'returns'], ['TransferRequest', 'transfers'], ['MaintenanceRequest', 'maintenance'],
  ['DamageClaim', 'damage-claims'], ['SupportRequest', 'support-requests'], ['DepositSettlement', 'deposit-settlements'],
  ['Payment', 'payments'], ['PaymentSubmission', 'payment-submissions'],
]);
export function auditEntity(event: Pick<AuditEvent, 'resource' | 'entityType'>) {
  if (Object.hasOwn(auditResources, event.resource)) return event.resource;
  const entity = event.entityType || event.resource;
  return modelResources.get(entity) ?? entity;
}

export function activityActionOptions() {
  const descriptions = new Map<string, Set<string>>();
  const collect = (labels: Record<string, string>) => {
    for (const [action, title] of Object.entries(labels)) {
      if (action.startsWith('AUTH_LOGIN') || action === 'AUTH_LOGOUT' || action === 'ROLE' ||
        (action === 'REVOKE' && labels === resourceActions['facility-access'])) continue;
      const names = descriptions.get(action) ?? new Set<string>();
      names.add(title);
      descriptions.set(action, names);
    }
  };
  collect(businessActions);
  for (const labels of Object.values(resourceActions)) collect(labels);
  for (const [action, title] of Object.entries(actions)) {
    if (!descriptions.has(action)) collect({ [action]: title });
  }
  return [...descriptions].map(([action, names]): [string, string] => {
    if (Object.hasOwn(genericVerbs, action)) return [action, genericVerbs[action] + ' hồ sơ (mọi đối tượng)'];
    return [action, names.size === 1 ? [...names][0] : (actions[action] ?? [...names][0] + ' và hoạt động cùng loại')];
  }).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
}

export function auditTitle(event: AuditEvent) {
  if (event.outcome === 'FAILURE') {
    if (event.action === 'AUTH_LOGIN_ACCOUNT_DISABLED') return 'Đăng nhập thất bại do tài khoản đã khóa';
    if (event.action === 'AUTH_LOGIN') return 'Đăng nhập thất bại';
    if (event.action === 'AUTH_LOGOUT') return 'Đăng xuất thất bại';
  }
  if (event.action === 'FACILITY_LIFECYCLE' && event.metadata?.previousStatus === event.metadata?.status) {
    if (event.metadata?.statusChanged === true) return 'Điều chỉnh kế hoạch ngừng kinh doanh';
    if (typeof event.metadata?.previousBookingEnabled === 'boolean' && typeof event.metadata?.bookingEnabled === 'boolean'
      && event.metadata.previousBookingEnabled !== event.metadata.bookingEnabled) return 'Thay đổi trạng thái nhận đặt kho';
  }
  const resource = auditEntity(event);
  const entityActions = Object.hasOwn(resourceActions, resource) ? resourceActions[resource] : undefined;
  const specialized = entityActions && Object.hasOwn(entityActions, event.action) ? entityActions[event.action]
    : Object.hasOwn(businessActions, event.action) ? businessActions[event.action] : undefined;
  if (specialized) return specialized;
  if (Object.hasOwn(genericVerbs, event.action)) {
    return Object.hasOwn(auditResources, resource)
      ? genericVerbs[event.action] + ' ' + auditResources[resource].toLocaleLowerCase('vi')
      : unclassifiedActivity;
  }
  return Object.hasOwn(actions, event.action) ? actions[event.action] : unclassifiedActivity;
}

export const auditResource = (value: string) => Object.hasOwn(auditResources, value) ? auditResources[value] : 'Hồ sơ';
export const auditActor = (event: AuditEvent) => event.actorName?.trim() ||
  (event.action === 'AUTH_LOGIN' && event.outcome === 'FAILURE' ? event.attemptAccountName?.trim() : '') ||
  event.actorEmail?.trim() || (event.action === 'TASK_ASSIGNMENT' && event.route === '/system/dispatch' &&
  event.metadata?.source === 'AUTO' ? 'Hệ thống' : 'Không ghi nhận người thực hiện');

export function auditRecordPath(event: AuditEvent) {
  if (event.resource === 'users' && event.outcome === 'SUCCESS' && event.resourceId) {
    return `/admin/users/${encodeURIComponent(event.resourceId)}`;
  }
}
