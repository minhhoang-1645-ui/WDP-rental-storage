import assert from 'node:assert/strict';
import { activityActionOptions, auditActor, auditTitle, unclassifiedActivity } from '../src/pages/admin/audit-labels.ts';

const event = (resource, action, extra = {}) => ({ id: 'audit', resource, action, outcome: 'SUCCESS', createdAt: '2026-11-16T02:30:00Z', ...extra });
const cases = [
  ['units', 'CREATE', 'Tạo kho'],
  ['units', 'UPDATE', 'Cập nhật thông tin kho'],
  ['storage-types', 'CREATE', 'Tạo loại kho'],
  ['storage-types', 'UPDATE', 'Cập nhật loại kho'],
  ['storage-types', 'DELETE', 'Xóa loại kho'],
  ['facilities', 'CREATE', 'Tạo cơ sở mới'],
  ['facilities', 'UPDATE', 'Cập nhật thông tin cơ sở'],
  ['users', 'CREATE', 'Tạo tài khoản'],
  ['users', 'UPDATE', 'Cập nhật thông tin tài khoản'],
  ['users', 'REVOKE_SESSION', 'Thu hồi phiên đăng nhập'],
  ['facility-access', 'REVOKE', 'Thu hồi quyền truy cập cơ sở'],
  ['business-policies', 'UPDATE', 'Cập nhật chính sách thuê kho'],
  ['pricing-rules', 'CREATE', 'Công bố khung giá thuê'],
  ['pricing-rules', 'PUBLISH_GROUP_PRICE_RANGE', 'Công bố khung giá thuê'],
  ['additional-services', 'OFFERINGS', 'Cấu hình dịch vụ bổ trợ'],
  ['staff-shifts', 'CREATE_SHIFT', 'Xếp ca nhân viên'],
  ['appointments', 'TASK_ASSIGNMENT', 'Phân công nhiệm vụ'],
  ['invoices', 'ONLINE_PAYMENT', 'Mở phiên thanh toán trực tuyến'],
  ['unknown', 'CREATE', unclassifiedActivity],
  ['units', 'MYSTERY', unclassifiedActivity],
  ['units', 'toString', unclassifiedActivity],
  ['', '', unclassifiedActivity],
];
for (const [resource, action, title] of cases) assert.equal(auditTitle(event(resource, action)), title);
assert.equal(auditTitle(event('', 'CREATE', { entityType: 'StorageUnit' })), 'Tạo kho');
assert.equal(auditTitle(event('units', 'CREATE', { entityType: 'StorageType' })), 'Tạo kho');
assert.equal(auditTitle(event('facility', 'FACILITY_LIFECYCLE', { metadata: {
  previousStatus: 'OPEN', status: 'OPEN', previousBookingEnabled: true, bookingEnabled: false,
} })), 'Thay đổi trạng thái nhận đặt kho');
assert.equal(auditTitle(event('units', 'UPDATE', { outcome: 'FAILURE' })), 'Cập nhật thông tin kho');
assert.equal(auditTitle(event('auth', 'AUTH_LOGIN', { outcome: 'FAILURE' })), 'Đăng nhập thất bại');

const interceptorActions = {
  'additional-services': 'CREATE INVENTORY OFFERINGS UPDATE',
  appointments: 'ASSIGN COMPLETE_HANDOVER CONFIRM CREATE HANDOVER RESCHEDULE SCHEDULE',
  'business-policies': 'UPDATE',
  contracts: 'ACCEPT SIGNATURE_OTP',
  'damage-claims': 'ASSIGN CREATE HANDOVER UPDATE',
  'deposit-settlements': 'CONFIRM_RETURN_REFUND REFUND REVIEW',
  'early-return-requests': 'DECISION FACILITY_REVIEW FINANCIAL_REVIEW REFUND_CONFIRMATION SETTLEMENT_APPROVAL',
  facilities: 'CREATE UPDATE',
  'facility-access': 'CREATE REVOKE ROLE',
  inquiries: 'CREATE UPDATE',
  invoices: 'DEMO_PAYMENT_SUBMISSIONS ONLINE_PAYMENT PAYMENTS PAYMENT_SUBMISSIONS',
  maintenance: 'ASSIGN BOOKING_IMPACT COMPLETE_WORK CREATE DISPATCH_READY HOLD_UNSAFE_UNIT PRIORITY REJECT_VERIFICATION START VERIFY',
  'online-payment-reconciliations': 'RESOLVE',
  'payment-submissions': 'REJECT VERIFY',
  'pricing-rules': 'CREATE',
  renewals: 'ACCEPT APPROVE CANCEL CREATE REJECT SIGNATURE_OTP',
  reservations: 'CANCEL CREATE PAID_CANCELLATION STATUS',
  returns: 'ASSIGN AUTHORIZE_SAFETY CREATE FINALIZE START_INSPECTION UPDATE',
  'stock-movements': 'ASSIGN COMPLETE CREATE',
  'storage-types': 'CREATE UPDATE',
  'support-requests': 'ASSIGN CREATE ESCALATE PRIORITY RESOLVE RESUME START WAIT_CUSTOMER',
  transfers: 'APPROVE ASSIGN COMMERCIAL_REFUND COMPLETE CREATE DESTINATION_HANDOVER PROBLEM REJECT REVIEW_PROBLEM START_SOURCE_INSPECTION',
  units: 'CREATE UPDATE',
  users: 'CREATE REVOKE STATUS UPDATE',
};
for (const [resource, actions] of Object.entries(interceptorActions)) {
  for (const action of actions.split(' ')) assert.notEqual(auditTitle(event(resource, action)), unclassifiedActivity, resource + '/' + action);
}

const options = new Map(activityActionOptions());
assert(!options.has('AUTH_LOGIN'));
assert.equal(options.get('CREATE'), 'Tạo hồ sơ (mọi đối tượng)');
assert.equal(options.get('UPDATE'), 'Cập nhật hồ sơ (mọi đối tượng)');
for (const [resource, action, title] of cases.filter(([, action]) => ['CREATE_SHIFT', 'PUBLISH_GROUP_PRICE_RANGE', 'REVOKE_SESSION'].includes(action))) {
  assert.equal(options.get(action), auditTitle(event(resource, action)));
  assert.equal(options.get(action), title);
}
assert.equal(options.get('RELOCATE_FACILITY_ACCESS'), 'Điều chuyển cơ sở');
assert.equal(auditTitle(event('users', 'RELOCATE_FACILITY_ACCESS')), 'Điều chuyển cơ sở');
assert.equal(auditTitle(event('facility-access', 'RELOCATE')), 'Điều chuyển cơ sở');
const coordination = [
  ['CLAIM', 'FACILITY_STAFF', { source: 'SELF_CLAIM', previousStaffUserId: null, assignedStaffUserId: 'staff' }, 'Tự nhận nhiệm vụ'],
  ['ASSIGN', 'FACILITY_MANAGER', { previousStaffUserId: null, assignedStaffUserId: 'staff' }, 'Phân công nhiệm vụ'],
  ['REASSIGN', 'FACILITY_MANAGER', { previousStaffUserId: 'old', assignedStaffUserId: 'other' }, 'Thay đổi người phụ trách'],
  ['RELEASE', 'FACILITY_MANAGER', { source: 'MANAGER_QUEUE', previousStaffUserId: 'staff', assignedStaffUserId: null }, 'Đưa nhiệm vụ về hàng chờ'],
];
for (const [variant, actorRole, metadata, title] of coordination) {
  assert.equal(auditTitle(event('appointments', 'TASK_ASSIGNMENT', { actorRole, metadata })), title);
  assert.equal(options.get('TASK_ASSIGNMENT:' + variant), title);
}
assert.equal(auditTitle(event('returns', 'TASK_STAFF_COMPLETED')), 'Hoàn thành nhiệm vụ');
assert.equal(auditTitle(event('support-requests', 'TASK_ESCALATED')), 'Chuyển yêu cầu lên quản lý');
assert.equal(auditActor(event('units', 'CREATE', { actorId: 'id-only', targetAccount: { fullName: 'Đối tượng' } })), 'Không ghi nhận người thực hiện');
assert.equal(auditActor(event('units', 'CREATE', { actorName: '  ', actorEmail: 'actor@example.test' })), 'actor@example.test');
assert.equal(auditActor(event('appointments', 'TASK_ASSIGNMENT', { route: '/system/dispatch', metadata: { source: 'AUTO' } })), 'Hệ thống');
assert.equal(auditActor(event('appointments', 'TASK_ASSIGNMENT', { metadata: { source: 'AUTO' } })), 'Không ghi nhận người thực hiện');
console.log('PASS: audit action classification, inventory coverage, filter options, and actor fallbacks.');
