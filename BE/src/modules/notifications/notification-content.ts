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
  users: 'Tài khoản',
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
  'stock-movements': ['REQUESTED', 'ASSIGNED'],
  appointments: ['REQUESTED', 'CONFIRMED'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
  transfers: ['APPROVED'],
  'damage-claims': ['REPORTED', 'INVESTIGATING'],
};
const staffActionable: Record<string, string[]> = {
  'support-requests': ['ASSIGNED', 'IN_PROGRESS'],
  maintenance: ['OPEN', 'IN_PROGRESS'],
  'stock-movements': ['ASSIGNED'],
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
};
const roles: Record<string, string> = { ADMIN: 'Quản trị viên', MANAGER: 'Quản lý', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng' };
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
  if (actor.role === 'ADMIN') {
    const action = get('action'), target = get('resourceId'), at = get('createdAt');
    if (source !== 'users' || row.resource !== 'users' || row.outcome !== 'SUCCESS' || !target || !Object.hasOwn(auditTitles, action) || !Number.isFinite(Date.parse(at))) return;
    const account = get('targetAccount.fullName');
    return { key, token: hash([key]), kind: source, title: auditTitles[action], at, code: '', actionLabel: '', important: false,
      summary: [account, roles[get('targetAccount.role')]].filter(Boolean).join(' · '),
      target: row.targetAccount ? `/admin/users/${encodeURIComponent(target)}` : '' };
  }
  if (source === 'users') return;
  const status = get('status');
  if (!status) return;
  const root = '/' + actor.role.toLowerCase();
  const encoded = encodeURIComponent(id);
  const assignedId = get('assignedStaff.id');
  const customer = actor.role === 'CUSTOMER';
  const staff = actor.role === 'STAFF';
  const early = source === 'support-requests' && (row.subject === EARLY_RETURN_SUBJECT || Boolean(row.earlyReturnDecision));
  const transfer = source === 'support-requests' && !early && (row.resolutionType === 'TRANSFER_RECOMMENDED' || /chuyen (doi )?kho/.test(noticeSearch(get('subject'))));
  const linkedTransfer = transfer ? list(row.transfers)[0] : undefined;
  if (actor.role === 'MANAGER' && linkedTransfer) return;
  if (staff && (source === 'reservations' || assignedId !== actor.id || early || source === 'transfers' && !['APPROVED', 'COMPLETED'].includes(status))) return;
  if (staff && source === 'appointments' && staffActionable.appointments.includes(status) && row.bookingReady === false) return;
  if (staff && linkedTransfer && data.transfers?.some(item => item.id === linkedTransfer.id && text(item, 'assignedStaff.id') === actor.id)) return;
  if (customer && ['customerId', 'customerUserId', 'customer.id', 'reservation.customerId', 'reservation.customer.id'].map(get).some(owner => owner && owner !== actor.id)) return;
  const kind = early ? 'early-returns' : transfer ? 'transfers' : source;
  const label = noticeKinds[kind];
  let title = `${label} ${states[status] ?? 'đã cập nhật'}`;
  if (source === 'appointments' && status === 'COMPLETED') title = 'Bàn giao đã hoàn tất';
  if (source === 'invoices' && status === 'OPEN') title = 'Hóa đơn chưa thanh toán';
  let target = `${root}${actor.role === 'MANAGER' ? '/operations' : ''}/${source}/${encoded}`;
  let actionLabel = '';
  let important = row.priority === 'HIGH' || status === 'ISSUE_FOUND';
  let version = '';
  if (source === 'damage-claims') {
    target = queryPath(root + '/damage-claims', { claim: id });
    const cash = get('compensation.status');
    if (cash === 'AWAITING_HANDOVER') title = 'Chờ giao tiền bồi thường';
    if (cash === 'HANDED_OVER') title = 'Đã giao tiền bồi thường';
  }
  if (staff) {
    const commercialReady = !row.commercial || Boolean(get('commercial.acceptedAt'));
    const actionable = staffActionable[source]?.includes(status)
      && (source !== 'transfers' || commercialReady) && (source !== 'damage-claims' || !row.staffFacts);
    if (actionable) actionLabel = ({
      appointments: status === 'REQUESTED' ? 'Xác nhận lịch bàn giao' : 'Bàn giao kho',
      'stock-movements': 'Kiểm đếm hàng', returns: 'Kiểm tra kho trả', maintenance: 'Xử lý bảo trì',
      'support-requests': 'Xử lý hỗ trợ', transfers: 'Bàn giao kho chuyển', 'damage-claims': 'Ghi nhận sự cố',
    } as Record<string, string>)[source] ?? '';
  }
  if (!customer && !staff) {
    const needsAssignment = !early && !transfer && managerAssignable[source]?.includes(status)
      && (!assignedId || get('assignedStaff.accountStatus') === 'DISABLED' || get('assignedStaff.role') && get('assignedStaff.role') !== 'STAFF');
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
    if (!actionLabel && !['deposit-settlements', 'invoices'].includes(source) &&
      !(source === 'support-requests' && !early && get('resolvedBy.role') === 'MANAGER') &&
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
    version = first(linkedTransfer, 'updatedAt', 'completedAt', 'approvedAt');
  }
  const unit = first(row, 'storageUnit.unitCode', 'storageUnit.unitNumber', 'currentStorageUnit.unitNumber', 'unit.unitCode',
    'allocatedUnits.0.unitCode', 'inspections.0.unit.unitCode', 'contracts.0.unitCode', 'unitCodeSnapshot', 'fromUnit.unitCode');
  const summary = [
    customer ? '' : first(row, 'customer.fullName', 'reservation.customer.fullName'),
    unit || first(row, 'storageType.name', 'product.name', 'reservation.storageType.name'),
  ].filter(Boolean).map(short).join(' · ');
  const code = first(row, 'reference', 'appointmentCode', 'invoiceCode', 'submissionCode', 'movementCode', 'maintenanceCode',
    'returnCode', 'settlementCode', 'supportCode', 'transferCode', 'claimCode', 'renewalCode', 'contractCode') || (source === 'reservations' ? id : '');
  const at = [version, first(row, 'activityUpdatedAt', 'updatedAt'), ...['createdAt', 'assignedAt', 'resolvedAt', 'completedAt', 'verifiedAt', 'approvedAt',
    'confirmedAt', 'requestedAt', 'submittedAt', 'terms.acceptedAt', 'appendix.acceptedAt', 'compensation.handedOverAt'].map(get)]
    .filter(date => Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (!at) return;
  const token = hash([actor.role, key, status, assignedId, at]);
  return { key, token, kind, code, title, summary, at, target, actionLabel, important };
}
