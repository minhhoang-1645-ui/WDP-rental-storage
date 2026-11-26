import { roleNamespace } from '../../role-names.js';
import { createHash } from 'node:crypto';
import type { PublicUser } from '../auth/auth.types.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';

export type NotificationRow = Record<string, unknown>;
export type NotificationData = Record<string, NotificationRow[]>;
export type Notice = {
  key: string; token: string; kind: string; title: string; summary: string; at: string;
  code: string; target: string; actionLabel: string; important: boolean;
};

export const noticeKinds: Record<string, string> = {
  reservations: 'Đặt kho', appointments: 'Bàn giao', contracts: 'Hợp đồng',
  invoices: 'Hóa đơn', 'payment-submissions': 'Chuyển khoản', 'stock-movements': 'Nhập – xuất hàng',
  renewals: 'Gia hạn', transfers: 'Chuyển kho', 'transfer-orders': 'Phụ lục chuyển kho',
  returns: 'Trả kho', 'early-returns': 'Trả trước hạn', 'deposit-settlements': 'Tiền cọc',
  'support-requests': 'Hỗ trợ', maintenance: 'Bảo trì', 'damage-claims': 'Sự cố hàng hóa',
  users: 'Tài khoản', 'catalog-changes': 'Danh mục bổ trợ',
  'price-range-changes': 'Khung giá thuê',
  'facility-lifecycle': 'Hoạt động cơ sở',
  'closure-relocations': 'Hỗ trợ di dời',
  'contract-expiry': 'Hợp đồng sắp hết hạn',
  'payment-due-reminder': 'Hóa đơn sắp đến hạn',
  'policy-effective': 'Chính sách kinh doanh',
  'rental-overdue': 'Nhắc trả kho và quá hạn',
};

function read(row: NotificationRow, path: string): unknown {
  let value: unknown = row;
  for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as NotificationRow)[key] : undefined;
  return value;
}
const text = (row: NotificationRow, path: string) => {
  const value = read(row, path);
  return typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : '';
};
const first = (row: NotificationRow, ...paths: string[]) => paths.map(path => text(row, path)).find(Boolean) ?? '';
const list = (value: unknown) => Array.isArray(value) ? value as NotificationRow[] : [];
const short = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 140);
export const noticeSearch = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
const ended = ['COMPLETED', 'CANCELLED', 'REJECTED', 'RESOLVED', 'EXPIRED', 'VOID'];

const states: Record<string, string> = {
  PENDING: 'đang chờ xử lý', OPEN: 'đã tiếp nhận', ASSIGNED: 'đã phân công',
  REQUESTED: 'đã gửi yêu cầu', CONFIRMED: 'đã xác nhận', COMPLETED: 'đã hoàn tất',
  IN_PROGRESS: 'đang xử lý', INSPECTION_IN_PROGRESS: 'đang kiểm tra', ESCALATED: 'đã chuyển quản lý',
  AWAITING_VERIFICATION: 'chờ nghiệm thu', RESOLVED: 'đã có kết quả', CANCELLED: 'đã hủy',
  REJECTED: 'chưa được chấp thuận', EXPIRED: 'đã hết hạn', ISSUE_FOUND: 'có vấn đề cần kiểm tra',
  ACTIVE: 'đang hiệu lực', PENDING_PAYMENT: 'chờ thanh toán', READY_FOR_HANDOVER: 'sẵn sàng bàn giao',
  PAID: 'đã thanh toán', PARTIALLY_PAID: 'đã trả một phần', VOID: 'đã hủy',
  PENDING_VERIFICATION: 'chờ xác minh', VERIFIED: 'đã xác nhận', APPROVED_PENDING_PAYMENT: 'đã duyệt gia hạn',
  APPROVED: 'đã chấp thuận', PENDING_SETTLEMENT: 'đang đối chiếu tiền cọc', PENDING_REVIEW: 'chờ đối chiếu',
  AWAITING_OUTSTANDING_PAYMENT: 'còn khoản cần thanh toán', SETTLED: 'đã quyết toán',
  REFUNDED: 'đã hoàn cọc', REPORTED: 'đã báo sự cố', INVESTIGATING: 'đang xác minh',
};
const managerAssignable: Record<string, string[]> = {
  'support-requests': ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
  maintenance: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'],
  appointments: ['REQUESTED', 'CONFIRMED'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
  transfers: ['APPROVED'],
  'damage-claims': ['REPORTED', 'INVESTIGATING'],
};
const staffActionable: Record<string, string[]> = {
  'support-requests': ['ASSIGNED', 'IN_PROGRESS'],
  maintenance: ['OPEN', 'IN_PROGRESS'],
  appointments: ['REQUESTED', 'CONFIRMED'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
  transfers: ['APPROVED'],
  'damage-claims': ['REPORTED', 'INVESTIGATING'],
};
const auditTitles: Record<string, string> = {
  CREATE: 'Đã tạo tài khoản',
  UPDATE: 'Đã cập nhật thông tin tài khoản',
  DISABLE_ACCOUNT: 'Đã vô hiệu hóa tài khoản',
  REACTIVATE_ACCOUNT: 'Đã kích hoạt lại tài khoản',
  CHANGE_ROLE: 'Đã đổi vai trò tài khoản',
  GRANT_FACILITY_ACCESS: 'Đã cấp quyền truy cập cơ sở',
  REVOKE_FACILITY_ACCESS: 'Đã thu hồi quyền truy cập cơ sở',
  REVOKE_SESSION: 'Đã thu hồi một phiên đăng nhập',
  REVOKE_SESSIONS: 'Đã thu hồi toàn bộ phiên đăng nhập',
};
const roles: Record<string, string> = { SYSTEM_ADMINISTRATOR: 'Quản trị viên', FACILITY_MANAGER: 'Quản lý', BUSINESS_OPERATIONS_MANAGER: 'Điều hành kinh doanh', FACILITY_STAFF: 'Nhân viên', STORAGE_CUSTOMER: 'Khách hàng' };
const byDate = (a: Notice, b: Notice) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key);
const queryPath = (path: string, values: Record<string, string>) => path + '?' + new URLSearchParams(values);
const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export function buildNotices(actor: PublicUser, data: NotificationData, now = Date.now()): Notice[] {
  const notices = new Map<string, Notice>();
  for (const [source, records] of Object.entries(data)) for (const row of records) {
    const notice = makeNotice(actor, source, row, data, now);
    if (notice && (!notices.has(notice.key) || byDate(notice, notices.get(notice.key)!) < 0)) notices.set(notice.key, notice);
  }
  return [...notices.values()].sort(byDate);
}

function makeNotice(actor: PublicUser, source: string, row: NotificationRow, data: NotificationData, now: number): Notice | undefined {
  const get = (field: string) => text(row, field);
  const id = get('id');
  if (!id || !Object.hasOwn(noticeKinds, source)) return;
  const key = `${source}:${id}`;
  if (source === 'policy-effective') {
    const at = get('effectiveFrom');
    const customer = actor.role === 'STORAGE_CUSTOMER';
    if ((!customer && actor.role !== 'FACILITY_MANAGER') || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now) return;
    if (customer) return { key, token: hash([key]), kind: source, at, code: '', title: 'Chính sách thuê kho đã cập nhật',
      summary: get('title') + ' · Phiên bản ' + get('version') + ' đã có hiệu lực.',
      important: false, actionLabel: '', target: '/customer/policies' };
    return { key, token: hash([key]), kind: source, at, code: '', title: 'Chính sách kinh doanh có phiên bản mới',
      summary: get('title') + ' · Phiên bản ' + get('version') + ' đã có hiệu lực. Xem quy định áp dụng trong mục Chính sách áp dụng.',
      important: false, actionLabel: 'Xem chính sách', target: '/manager/policies' };
  }
  if (source === 'rental-overdue') {
    if (actor.role === 'STORAGE_CUSTOMER' && get('reservationId')) {
      const contractEnd = get('endDate').slice(0, 10);
      const end = Date.parse(contractEnd + 'T00:00:00+07:00');
      const target = queryPath('/customer/rentals', { reservation: get('reservationId') });
      const overdue = Number(read(row, 'overdueOccupancy.days')) > 0;
      if (!overdue) {
        const days = read(row, 'returnNoticeDays');
        if (typeof days !== 'number' || days <= 0) return;
        const at = end - days * 86_400_000;
        if (!Number.isFinite(at) || at > now || now > end + 86_400_000 - 1) return;
        return { key, token: hash([key, contractEnd, 'return-reminder']), kind: source,
          title: 'Nhắc báo trước khi trả kho', summary: get('contractCode') + ' · Liên hệ NestBox để bố trí lịch trả kho.',
          code: get('contractCode'), important: true, at: new Date(at).toISOString(), actionLabel: 'Xem kho đang thuê', target };
      }
      const at = end + 86_400_000;
      if (!Number.isFinite(at) || at > now) return;
      return { key, token: hash([key, contractEnd]), kind: source, title: 'Kho đã quá hạn trả',
        summary: get('contractCode') + ' · Quá hạn ' + get('overdueOccupancy.days') + ' ngày',
        code: get('contractCode'), important: true, at: new Date(at).toISOString(),
        actionLabel: 'Xem kho đang thuê', target };
    }
    if (actor.role !== 'FACILITY_MANAGER' || read(row, 'overdueOccupancy.managerReview') !== true || !get('reservationId')) return;
    const date = get('overdueOccupancy.managerReviewOn');
    const at = Date.parse(date + 'T00:00:00+07:00');
    if (Number.isFinite(at)) return { key, token: hash([key, date]), kind: source, title: 'Kho quá hạn cần quản lý xử lý',
      summary: get('contractCode'), code: get('contractCode'), important: true, at: new Date(at).toISOString(),
      actionLabel: 'Xem kho đang thuê', target: `/manager/operations/rentals/${encodeURIComponent(get('reservationId'))}` };
    return;
  }
  if (source === 'contract-expiry') {
    if (actor.role !== 'STORAGE_CUSTOMER' || row.status !== 'ACTIVE' ||
        [get('customerId'), get('reservation.customerId'), get('reservation.customer.id')].some(owner => owner && owner !== actor.id)) return;
    const endDate = get('endDate').slice(0, 10);
    const end = Date.parse(endDate + 'T00:00:00+07:00');
    const start = end - Number(row.reminderDays) * 86_400_000;
    if (!Number.isFinite(start) || now < start || now >= end) return;
    return {
      key, token: hash([key, endDate]), kind: source, at: new Date(start).toISOString(),
      code: get('contractCode'), title: 'Hợp đồng sắp hết hạn', important: true,
      summary: [get('contractCode'), `Hạn thuê ${endDate}`].filter(Boolean).join(' · '),
      actionLabel: 'Xem hợp đồng', target: queryPath('/customer/contracts', { contract: id }),
    };
  }
  if (source === 'payment-due-reminder') {
    if (actor.role !== 'STORAGE_CUSTOMER' ||
        [get('customerId'), get('reservation.customerId'), get('reservation.customer.id')].some(owner => owner && owner !== actor.id) ||
        !['OPEN', 'PARTIALLY_PAID'].includes(get('status')) || !(Number(row.balanceDue) > 0) ||
        ['CANCELLED', 'EXPIRED', 'REJECTED'].includes(get('reservation.status'))) return;
    const reservationDeadline = row.type === 'INITIAL' ? Date.parse(get('reservation.expiresAt')) : NaN;
    const dateOnly = get('dueAt').slice(0, 10);
    const due = Number.isFinite(reservationDeadline) ? reservationDeadline : Date.parse(dateOnly + 'T00:00:00+07:00');
    const start = due - Number(row.reminderDays) * 86_400_000;
    if (!Number.isFinite(start) || now < start || now >= due ||
        row.type === 'RENEWAL' && Number(row.renewalCycle) > 1 && row.closeoutPaymentAllowed !== true ||
        data['payment-submissions']?.some(item => text(item, 'invoice.id') === id && item.status === 'PENDING_VERIFICATION')) return;
    const dueAt = new Date(due).toISOString();
    return {
      key, token: hash([key, dueAt]), kind: source, at: new Date(start).toISOString(),
      code: get('invoiceCode'), title: Number.isFinite(reservationDeadline) ? 'Đơn đặt kho sắp hết hạn giữ' : 'Hóa đơn sắp đến hạn thanh toán', important: true,
      summary: get('invoiceCode'), actionLabel: 'Xem hóa đơn', target: queryPath('/customer/payments', { invoice: id }),
    };
  }
  if (actor.role === 'SYSTEM_ADMINISTRATOR') {
    const action = get('action'), target = get('targetUserId') || (row.resource === 'users' ? get('resourceId') : ''), at = get('createdAt');
    if (source !== 'users' || row.outcome !== 'SUCCESS' || !target || (action.startsWith('REVOKE_SESSION') && row.metadata && typeof row.metadata === 'object' && 'count' in row.metadata && row.metadata.count === 0) || !Object.hasOwn(auditTitles, action) || !Number.isFinite(Date.parse(at))) return;
    const account = get('targetAccount.fullName');
    return { key, token: hash([key]), kind: source, title: auditTitles[action], at, code: '', actionLabel: '', important: false,
      summary: [account, roles[get('targetAccount.role')], get('facilityName')].filter(Boolean).join(' · '),
      target: row.targetAccount ? `/admin/users/${encodeURIComponent(target)}` : '' };
  }
  if (source === 'closure-relocations') {
    const action = get('action');
    const titles: Record<string, string> = {
      RELOCATION_ASSIGNED: 'Đã phân công hỗ trợ di dời',
      RELOCATION_PROPOSED: 'Đã có phương án kho mới',
      RELOCATION_RESERVED: 'Đã xác nhận và giữ kho mới',
      RELOCATION_RECEIVING_ASSIGNED: 'Đã phân công tiếp nhận kho mới',
      RELOCATION_DECLINED: 'Khách đã từ chối phương án',
      RELOCATION_CANCELLED: 'Đã hủy phương án di dời',
      RELOCATION_COMPLETED: 'Đã hoàn tất di dời kho',
      RELOCATION_EXCEPTION: 'Có vướng mắc khi di dời kho',
      CLOSURE_BOOKING_CANCELLED: 'Đã hủy đơn theo thỏa thuận',
      CLOSURE_BOOKING_REFUND_PENDING: 'Đã hủy đơn, chờ NestBox hoàn tiền',
      CLOSURE_BOOKING_REFUND_RECORDED: 'NestBox đã ghi nhận hoàn tiền đơn đặt kho',
    };
    if (!titles[action]) return;
    const target = actor.role === 'STORAGE_CUSTOMER' ? '' : actor.role === 'FACILITY_MANAGER' ? '/manager/operations/transfers' : '/staff/transfers';
    return { key, token: hash([key]), kind: source, title: titles[action], at: get('createdAt'), code: get('metadata.code'),
      summary: [get('metadata.sourceName'), get('metadata.destinationName')].filter(Boolean).join(' → '),
      target, actionLabel: 'Xem hồ sơ', important: ['RELOCATION_ASSIGNED', 'RELOCATION_PROPOSED', 'RELOCATION_RESERVED','CLOSURE_BOOKING_REFUND_PENDING','CLOSURE_BOOKING_REFUND_RECORDED'].includes(action) };
  }
  if (source === 'facility-lifecycle') {
    const status = get('metadata.status');
    const customer = actor.role === 'STORAGE_CUSTOMER';
    if (actor.role === 'FACILITY_MANAGER' && get('action') === 'FACILITY_SCHEDULE_IMPACT') {
      return { key, token: hash([key]), kind: source, at: get('createdAt'), code: get('metadata.facilityCode'),
        title: 'Cần rà soát lịch hẹn và ca làm tại cơ sở', important: true,
        summary: [get('metadata.facilityName'), `${read(row, 'metadata.appointments')} lịch hẹn và ${read(row, 'metadata.shifts')} ca Staff được giữ nguyên sau khi đổi giờ hoạt động.`].join(' · '),
        target: '/manager/service-calendar', actionLabel: 'Xem lịch phục vụ' };
    }
    if ((!customer && actor.role !== 'FACILITY_MANAGER') || !['OPEN', 'CLOSING', 'CLOSED'].includes(status)) return;
    const titles: Record<string,string> = { OPEN: 'Cơ sở đã mở lại', CLOSING: 'Cơ sở bắt đầu ngừng kinh doanh', CLOSED: 'Cơ sở đã ngừng hoạt động' };
    return {
      key, token: hash([key]), kind: source, at: get('createdAt'), code: get('metadata.facilityCode'),
      title: row.metadata && typeof row.metadata === 'object' && 'managerNotice' in row.metadata && row.metadata.managerNotice === true ? 'Quản lý đã tiếp nhận hỗ trợ ngừng kinh doanh' : titles[status], important: status === 'CLOSING', target: '', actionLabel: '',
      summary: [get('metadata.facilityName'), customer ? '' : get('metadata.closureReason'), status === 'CLOSING' && get('metadata.closureMode') === 'REQUIRED_RELOCATION'
        ? 'Cơ sở phải di dời. Tạm dừng ra vào và bàn giao thông thường. Liên hệ quản lý để được hỗ trợ di dời an toàn.'
        : status === 'CLOSING'
        ? customer
          ? 'Nếu đang thuê, bạn có thể sử dụng kho đến hết hạn hợp đồng. Cơ sở dừng nhận gia hạn mới. Liên hệ NestBox nếu cần hỗ trợ.'
          : 'Tiếp tục hỗ trợ khách đang thuê đến hết hạn và xử lý các hồ sơ còn mở.' : ''].filter(Boolean).join(' · '),
    };
  }
  if (source === 'price-range-changes') {
    if (actor.role !== 'FACILITY_MANAGER') return;
    const facilityId = get('resourceId'), effective = Date.parse(get('metadata.effectiveFrom'));
    if (!facilityId || !Number.isFinite(effective)) return;
    const bounds = (path: string) => {
      const min = read(row, path + '.min'), max = read(row, path + '.max');
      return typeof min === 'number' && typeof max === 'number' ? `${min.toLocaleString('vi-VN')}–${max.toLocaleString('vi-VN')} đ/tháng` : 'Chưa thiết lập';
    };
    const affected = Array.isArray(read(row, 'metadata.affected')) ? (read(row, 'metadata.affected') as unknown[])
      .filter((name): name is string => typeof name === 'string') : [];
    const date = new Date(effective).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
    return { key, token: hash([key]), kind: source, at: get('createdAt'), code: get('metadata.groupName'),
      title: 'BOM đã công bố khung giá thuê',
      summary: [get('metadata.facilityName'), get('metadata.groupName'), bounds('metadata.oldRange') + ' → ' + bounds('metadata.newRange'),
        'Hiệu lực ' + date + ' (UTC+7)', affected.length ? 'Cần kiểm tra giá: ' + affected.join(', ') : 'Giá hiện tại phù hợp tại thời điểm công bố.'].join(' · '),
      target: '/manager/catalog?' + new URLSearchParams({ facilityId }), actionLabel: 'Xem loại kho & đơn giá', important: affected.length > 0 };
  }
  if (source === 'catalog-changes') {
    if (actor.role !== 'FACILITY_MANAGER' || !get('facilityId') || !get('resourceId')) return;
    const fields: Record<string, string> = {
      name: 'Tên', description: 'Mô tả', kind: 'Phân loại', billingUnit: 'Tính phí',
      physicalUnit: 'Đơn vị tính', isActive: 'Cung cấp toàn hệ thống',
      imageUrl: 'Ảnh', imageAlt: 'Mô tả ảnh',
    };
    const values: Record<string, string> = {
      PURCHASE: 'Sản phẩm tiêu hao', RENTAL: 'Thiết bị cho thuê', ONE_TIME: 'Một lần',
      DAY: 'Theo ngày', MONTH: 'Theo tháng', true: 'Bật', false: 'Tắt',
    };
    const display = (field: string, value: unknown) => value == null ? 'Chưa thiết lập'
      : ['kind', 'billingUnit', 'isActive'].includes(field) ? values[String(value)] ?? String(value) : String(value);
    const changes = list(row.changes).map(change => {
      const field = String(change.field);
      return `${fields[field] ?? field} ${display(field, change.before)} → ${display(field, change.after)}`;
    });
    return { key, token: hash([key]), kind: source, at: get('createdAt'), code: get('code'),
      title: 'Thông tin danh mục bổ trợ đã thay đổi',
      summary: [`${get('name')} (${get('code')})`, ...changes, row.reviewRequired
        ? 'Vui lòng kiểm tra lại giá và số lượng cung cấp tại cơ sở.' : 'Thay đổi này không yêu cầu xác nhận cấu hình.'].join(' · '),
      target: queryPath('/manager/catalog/additional-services', { facilityId: get('facilityId'), offering: get('resourceId') }),
      actionLabel: 'Xem cấu hình dịch vụ', important: row.reviewRequired === true };
  }
  if (source === 'users') return;
  const status = get('status');
  if (!status) return;
  const root = '/' + roleNamespace(actor.role);
  const encoded = encodeURIComponent(id);
  const assignedId = get('assignedStaff.id');
  const customer = actor.role === 'STORAGE_CUSTOMER';
  const staff = actor.role === 'FACILITY_STAFF';
  const early = source === 'support-requests' && (row.subject === EARLY_RETURN_SUBJECT || Boolean(row.earlyReturnDecision));
  const transfer = source === 'support-requests' && !early && (row.resolutionType === 'TRANSFER_RECOMMENDED' || /chuyen (doi )?kho/.test(noticeSearch(get('subject'))));
  const linkedTransfer = transfer ? list(row.transfers)[0] : undefined;
  if (actor.role === 'FACILITY_MANAGER' && linkedTransfer) return;
  if (staff && (source === 'reservations' || assignedId !== actor.id || early || source === 'transfers' && !['APPROVED', 'COMPLETED'].includes(status))) return;
  if (staff && source === 'appointments' && staffActionable.appointments.includes(status) && row.bookingReady === false) return;
  if (staff && linkedTransfer && data.transfers?.some(item => item.id === linkedTransfer.id && text(item, 'assignedStaff.id') === actor.id)) return;
  if (customer && ['customerId', 'customerUserId', 'customer.id', 'reservation.customerId', 'reservation.customer.id'].map(get).some(owner => owner && owner !== actor.id)) return;
  if (source === 'reservations' && get('paidCancellation.state')) {
    const state = get('paidCancellation.state');
    const manager = actor.role === 'FACILITY_MANAGER';
    const dueDate = get('paidCancellation.refundDueOn');
    const due = Date.parse(dueDate + 'T00:00:00+07:00') + 86_400_000;
    const late = manager && state === 'REFUND_PENDING' && Number.isFinite(due) && now >= due;
    const title = late ? 'Quá hạn hoàn tiền hủy đơn' : state === 'REQUESTED' ? 'Có yêu cầu hủy đơn đã thanh toán'
      : state === 'REFUNDED' ? 'Đã hoàn tiền hủy đơn' : state === 'REFUND_PENDING' ? 'Đơn đã hủy, chờ hoàn tiền' : 'Đã xử lý yêu cầu hủy đơn';
    const at = late ? new Date(due).toISOString() : get('updatedAt') || get('createdAt');
    if (at) return { key, token: hash([key, state, late ? dueDate : '']), kind: source, at, title, code: get('reference') || id,
      summary: dueDate ? `Hạn hoàn tiền ${dueDate}` : get('reference'), actionLabel: 'Xem yêu cầu hủy', important: state === 'REQUESTED' || late,
      target: manager ? `/manager/reservations/${encoded}` : `/customer/reservations/${encoded}` };
  }
  if (actor.role === 'FACILITY_MANAGER' && source === 'deposit-settlements' && row.refundOverdue === true) {
    const dueDate = get('refundDueOn');
    const due = Date.parse(dueDate + 'T00:00:00+07:00');
    if (Number.isFinite(due)) return {
      key, token: hash([key, 'refund-overdue', dueDate]), kind: source, at: new Date(due + 86_400_000).toISOString(),
      code: get('settlementCode'), title: 'Hồ sơ hoàn cọc quá hạn', important: true,
      summary: [get('settlementCode'), `Hạn xử lý ${dueDate}`].filter(Boolean).join(' · '),
      actionLabel: 'Xử lý hoàn cọc', target: `/manager/operations/deposit-settlements/${encoded}`,
    };
  }
  const kind = early ? 'early-returns' : transfer ? 'transfers' : source;
  if (actor.role === 'FACILITY_MANAGER' && source === 'invoices' && read(row, 'overduePayment.managerReview') === true) {
    const reviewOn = get('overduePayment.managerReviewOn');
    const at = Date.parse(reviewOn + 'T00:00:00+07:00');
    if (Number.isFinite(at)) return { key, token: hash([key, 'payment-overdue-review', reviewOn]), kind: source,
      at: new Date(at).toISOString(), code: get('invoiceCode'), title: 'Công nợ quá hạn cần quản lý xử lý', important: true,
      summary: get('invoiceCode'), actionLabel: 'Kiểm tra công nợ', target: `/manager/operations/invoices/${encoded}` };
  }
  if (customer && source === 'invoices' && get('historicalPricing.adjustment') === 'PAYMENT_OVERDUE'
      && ['OPEN', 'PARTIALLY_PAID'].includes(status) && Number(row.balanceDue) > 0) {
    const at = get('historicalPricing.assessedAt') || get('issuedAt');
    if (Number.isFinite(Date.parse(at))) return { key, token: hash([key, 'payment-late-fee']), kind: source,
      at, title: 'Đã phát sinh phí thanh toán quá hạn', code: get('invoiceCode'), important: true,
      summary: get('invoiceCode'), actionLabel: 'Xem hóa đơn', target: queryPath('/customer/payments', { invoice: id }) };
  }
  if (customer && source === 'invoices' && Number(read(row, 'overduePayment.days')) > 0) {
    const dueDate = get('dueAt');
    const at = Date.parse(dueDate + 'T00:00:00+07:00') + 86_400_000;
    if (Number.isFinite(at)) return { key, token: hash([key, 'payment-overdue', dueDate]), kind: source,
      at: new Date(at).toISOString(), code: get('invoiceCode'), title: 'Hóa đơn quá hạn thanh toán', important: true,
      summary: get('invoiceCode'), actionLabel: 'Xem hóa đơn', target: `/customer/invoices/${encoded}` };
  }
  const label = noticeKinds[kind];
  let title = `${label} ${states[status] ?? 'đã cập nhật'}`;
  if (source === 'appointments' && status === 'COMPLETED') title = 'Bàn giao đã hoàn tất';
  if (source === 'invoices' && status === 'OPEN') title = 'Hóa đơn chưa thanh toán';
  let target = `${root}${actor.role === 'FACILITY_MANAGER' ? '/operations' : ''}/${source}/${encoded}`;
  let actionLabel = '';
  let important = row.priority === 'HIGH' || status === 'ISSUE_FOUND';
  let version = '';
  if (customer && linkedTransfer?.customerMoveAction === 'READY_TO_REPORT') {
    title = 'Đã bàn giao kho mới';
    actionLabel = 'Xem tiến độ chuyển kho';
    version = 'destination-ready';
  } else if (customer && linkedTransfer?.customerMoveAction === 'REPORTED') {
    title = 'Đã nhận thông báo chuyển đồ';
    version = 'customer-move-reported';
  }
  const affectedBookingCount = actor.role === 'FACILITY_MANAGER' && source === 'maintenance' ? Number(row.affectedBookingCount) || 0 : 0;
  const affectedAppointmentCount = affectedBookingCount ? Number(row.affectedAppointmentCount) || 0 : 0;
  if (customer && source === 'returns' && get('earlyReturnCloseout.appliedAt')) {
    const refundedAt = get('rentRefund.refundedAt');
    const approvedAt = get('rentRefund.approvedAt');
    title = refundedAt ? 'Đã hoàn tiền thuê trả trước' : approvedAt ? 'Đã duyệt quyết toán tiền thuê' : 'Đã bàn giao và tính quyết toán tiền thuê';
    version = refundedAt || approvedAt || get('earlyReturnCloseout.appliedAt');
  }
  if (source === 'damage-claims') {
    target = queryPath(root + '/damage-claims', { claim: id });
    const cash = get('compensation.status');
    if (cash === 'AWAITING_HANDOVER') title = 'Chờ giao tiền bồi thường';
    if (cash === 'HANDED_OVER') title = 'Đã giao tiền bồi thường';
  }
  if (staff) {
    const commercialReady = !row.commercial || Boolean(get('commercial.acceptedAt'));
    const actionable = staffActionable[source]?.includes(status)
      && (source !== 'transfers' || commercialReady) && (source !== 'damage-claims' || !row.staffFacts)
      && get('coordination.phase') !== 'WAITING';
    if (actionable) actionLabel = ({
      appointments: status === 'REQUESTED' ? 'Xác nhận lịch bàn giao' : 'Bàn giao kho',
      returns: 'Kiểm tra kho trả', maintenance: 'Xử lý bảo trì',
      'support-requests': 'Xử lý hỗ trợ', transfers: 'Bàn giao kho chuyển', 'damage-claims': 'Ghi nhận sự cố',
    } as Record<string, string>)[source] ?? '';
    if (source === 'transfers' && status === 'APPROVED' && get('handoverReport.customerMoveReadyAt')) {
      title = 'Khách đã báo chuyển đồ xong';
      actionLabel = 'Kiểm tra kho nguồn';
      version = get('handoverReport.customerMoveReadyAt');
    }
  }
  if (!customer && !staff) {
    const needsAssignment = !early && !transfer && managerAssignable[source]?.includes(status)
      && (!assignedId || get('assignedStaff.accountStatus') === 'DISABLED' || get('assignedStaff.role') && get('assignedStaff.role') !== 'FACILITY_STAFF');
    if (needsAssignment) {
      actionLabel = assignedId ? 'Đổi người phụ trách' : 'Phân công nhân viên';
      title = `${label} ${assignedId ? 'cần đổi người phụ trách' : 'chờ phân công'}`;
      target = queryPath('/manager/assignments', { kind: source, record: id });
    } else if (early) {
      target = queryPath('/manager/early-returns', { record: id });
      if (!row.earlyReturnDecision && !ended.includes(status)) actionLabel = 'Xem xét trả trước hạn';
    } else if (transfer && !ended.includes(status)) actionLabel = 'Xem xét chuyển kho';
    else if (source === 'support-requests' && status === 'ESCALATED') actionLabel = 'Xem xét hỗ trợ';
    else if (source === 'maintenance' && status === 'AWAITING_VERIFICATION') actionLabel = 'Nghiệm thu bảo trì';
    else if (source === 'transfers' && status === 'REQUESTED') actionLabel = 'Xem xét chuyển kho';
    else if (source === 'renewals' && status === 'PENDING') actionLabel = 'Xem xét gia hạn';
    else if (source === 'damage-claims') {
      if (status === 'INVESTIGATING' && row.staffFacts) actionLabel = 'Xem xét sự cố';
      else if (['APPROVED', 'REJECTED'].includes(status)) actionLabel = get('compensation.status') === 'AWAITING_HANDOVER' ? 'Ghi nhận giao tiền' : 'Hoàn tất xử lý sự cố';
    } else if (source === 'deposit-settlements') {
      if (status === 'PENDING_REVIEW') actionLabel = 'Duyệt quyết toán';
      if (status === 'APPROVED' && Number(row.refundAmount) > 0 && Number(row.outstandingAmount) === 0 && !row.refundedAt) actionLabel = 'Ghi nhận hoàn cọc';
    } else if (source === 'invoices') {
      if (!['OPEN', 'PARTIALLY_PAID'].includes(status) || Number(row.balanceDue) <= 0) return;
      const due = row.type === 'INITIAL' ? first(row, 'reservation.expiresAt', 'dueAt') : get('dueAt');
      if (Date.parse(due) < now) { title = 'Hóa đơn quá hạn'; important = true; actionLabel = 'Kiểm tra công nợ'; }
    }
    if (affectedBookingCount > 0) {
      title = 'Sự cố · Có hồ sơ thuê bị ảnh hưởng';
      actionLabel = 'Xem hồ sơ bị ảnh hưởng';
      target = `/manager/operations/maintenance/${encoded}`;
      important = true;
    }
    if (!actionLabel && !['deposit-settlements', 'invoices'].includes(source) &&
      !(source === 'support-requests' && !early && get('resolvedBy.role') === 'FACILITY_MANAGER') &&
      !(source === 'damage-claims' && status === 'RESOLVED')) return;
  }
  if (customer) {
    const routes: Record<string, [string, string]> = {
      appointments: ['appointments', 'appointment'], returns: ['returns', 'return'], 'deposit-settlements': ['returns', 'settlement'],
      'support-requests': [transfer ? 'transfers' : 'support', 'request'], 'transfer-orders': ['transfers', 'transfer'],
      invoices: ['payments', 'invoice'], contracts: ['contracts', 'contract'], renewals: ['renewals', 'renewal'],
    };
    if (routes[source]) {
      const [page, param] = routes[source];
      target = queryPath(`/customer/${page}`, { [param]: id });
    }
    const reservationId = first(row, 'reservation.id', 'reservationId');
    const expired = get('reservation.status') === 'EXPIRED' || Date.parse(get('reservation.expiresAt')) <= now;
    if (source === 'invoices' && ['OPEN', 'PARTIALLY_PAID'].includes(status) && Number(row.balanceDue) > 0
      && get('reservation.status') !== 'EXPIRED' && !(row.type === 'INITIAL' && expired)
      && !(row.type === 'RENEWAL' && Number(row.renewalCycle) > 1 && Date.parse(get('dueAt')) > now && row.closeoutPaymentAllowed !== true)) {
      const hasSubmission = data['payment-submissions']?.some(item => text(item, 'invoice.id') === id && item.status === 'PENDING_VERIFICATION');
      const renewalInvoice = data.renewals?.some(item => item.status === 'APPROVED_PENDING_PAYMENT' && list(item.invoices).some(invoice => invoice.id === id && Number(invoice.renewalCycle) === 1));
      if (hasSubmission) title = 'Chuyển khoản đang chờ xác nhận';
      else if (!renewalInvoice) actionLabel = read(row, 'signing.complete') === false ? 'Xem tài liệu cần ký' : 'Thanh toán hóa đơn';
    }
    if (source === 'payment-submissions') {
      const invoice = get('invoice.id');
      target = invoice ? queryPath('/customer/payments', { invoice, view: 'submissions', submission: id }) : '';
      const bill = data.invoices?.find(item => item.id === invoice);
      if (status === 'REJECTED' && bill && ['OPEN', 'PARTIALLY_PAID'].includes(String(bill.status)) && Number(bill.balanceDue) > 0
        && text(bill, 'reservation.status') !== 'EXPIRED' && !(bill.type === 'INITIAL' && Date.parse(text(bill, 'reservation.expiresAt')) <= now)) {
        actionLabel = 'Xem lý do từ chối';
      }
    }
    if (source === 'contracts' && status === 'PENDING_PAYMENT' && !get('terms.acceptedAt') && !expired) actionLabel = 'Ký hợp đồng';
    if (source === 'contracts' && status === 'READY_FOR_HANDOVER' && reservationId) {
      const group = data.contracts?.filter(item => text(item, 'reservation.id') === reservationId) ?? [];
      const appointment = data.appointments?.some(item => text(item, 'reservation.id') === reservationId && ['REQUESTED', 'CONFIRMED', 'COMPLETED'].includes(String(item.status)));
      if (!appointment && group.length === Number(read(row, 'reservation.quantity'))
        && group.every(item => item.status === 'READY_FOR_HANDOVER' && Date.parse(text(item, 'endDate').slice(0, 10) + 'T00:00:00+07:00') > now)) {
        const leading = [...group].sort((a, b) => text(a, 'id').localeCompare(text(b, 'id')))[0];
        if (leading !== row) return;
        target = queryPath('/customer/appointments', { reservation: reservationId });
        actionLabel = 'Đặt lịch nhận kho';
      }
    }
    if (source === 'renewals' && status === 'APPROVED_PENDING_PAYMENT') {
      const invoice = list(row.invoices).find(item => Number(item.renewalCycle) === 1);
      if (!get('appendix.acceptedAt')) actionLabel = 'Ký phụ lục gia hạn';
      else if (invoice && Number(invoice.balanceDue) > 0 && !data['payment-submissions']?.some(item => text(item, 'invoice.id') === invoice.id && item.status === 'PENDING_VERIFICATION')) {
        target = queryPath('/customer/payments', { invoice: text(invoice, 'id') });
        actionLabel = 'Thanh toán gia hạn';
      }
    }
    if (source === 'transfer-orders' && status === 'APPROVED' && !get('commercial.acceptedAt')) actionLabel = 'Ký phụ lục chuyển kho';
    if (source === 'deposit-settlements' && status === 'AWAITING_OUTSTANDING_PAYMENT') actionLabel = 'Xem khoản cần thanh toán';
    if (early) {
      const decision = get('earlyReturnDecision');
      title = decision === 'APPROVED' ? 'Đã chấp thuận trả trước hạn' : decision === 'REJECTED' ? 'Trả trước hạn chưa được chấp thuận' : 'Trả trước hạn chờ xem xét';
      const contractId = get('contract.id');
      const currentContracts = (data.contracts ?? []).filter(item => text(item, 'reservation.id') === reservationId && (!contractId || item.id === contractId));
      const approvalEnd = get('earlyReturnForEndDate');
      const currentApproval = approvalEnd && currentContracts.length > 0
        && currentContracts.every(item => item.status === 'ACTIVE' && text(item, 'endDate').slice(0, 10) === approvalEnd);
      const pendingRenewal = data.renewals?.some(item => text(item, 'reservation.id') === reservationId
        && (!contractId || !item.rentalContractId || item.rentalContractId === contractId)
        && ['PENDING', 'APPROVED_PENDING_PAYMENT'].includes(String(item.status)));
      if (decision === 'APPROVED' && reservationId && currentApproval && !pendingRenewal
        && !data.returns?.some(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED'
          && (!contractId || list(item.inspections).some(inspection => text(inspection, 'contract.id') === contractId)))) {
        target = queryPath('/customer/returns', contractId ? { contract: contractId } : { reservation: reservationId });
        actionLabel = 'Xem điều kiện trả kho';
      }
    }
  }
  if (linkedTransfer) {
    const linkedStatus = text(linkedTransfer, 'status');
    if (linkedStatus) title = `Chuyển kho ${states[linkedStatus] ?? 'đã cập nhật'}`;
    if (customer && linkedStatus === 'APPROVED') actionLabel = 'Kiểm tra hàng ở kho nguồn';
    version = first(linkedTransfer, 'updatedAt', 'completedAt', 'approvedAt');
  }
  const unit = first(row, 'storageUnit.unitCode', 'storageUnit.unitNumber', 'currentStorageUnit.unitNumber', 'unit.unitCode',
    'allocatedUnits.0.unitCode', 'inspections.0.unit.unitCode', 'contracts.0.unitCode', 'unitCodeSnapshot', 'fromUnit.unitCode');
  const summary = [
    affectedBookingCount ? `${affectedBookingCount} đơn đặt${affectedAppointmentCount ? ' · ' + affectedAppointmentCount + ' lịch bàn giao' : ''} có ô đang tạm chặn` : '',
    customer ? '' : first(row, 'customer.fullName', 'reservation.customer.fullName'),
    unit || first(row, 'storageType.name', 'product.name', 'reservation.storageType.name'),
    customer && linkedTransfer && text(linkedTransfer, 'status') === 'APPROVED' ? 'Kiểm tra hàng đang lưu trước khi chuyển.' : '',
  ].filter(Boolean).map(short).join(' · ');
  const code = first(row, 'reference', 'appointmentCode', 'invoiceCode', 'submissionCode', 'movementCode', 'maintenanceCode',
    'returnCode', 'settlementCode', 'supportCode', 'transferCode', 'claimCode', 'renewalCode', 'contractCode') || (source === 'reservations' ? id : '');
  const at = [version, first(row, 'activityUpdatedAt', 'updatedAt'), ...['createdAt', 'assignedAt', 'resolvedAt', 'completedAt', 'verifiedAt', 'approvedAt',
    'confirmedAt', 'requestedAt', 'submittedAt', 'terms.acceptedAt', 'appendix.acceptedAt', 'compensation.handedOverAt'].map(get)]
    .filter(date => Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (!at) return;
  const token = hash([actor.role, key, status, assignedId, at, ...(affectedBookingCount ? [affectedBookingCount, affectedAppointmentCount] : [])]);
  return { key, token, kind, code, title, summary, at, target, actionLabel, important };
}
