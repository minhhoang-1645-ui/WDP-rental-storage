import { workflowGuide } from './workflow-guide';
import { awaitingAssignment, isOverdueInvoice, staffNeedsAction } from './work-queue';

export type ActivityRole = 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN';
export type ActivityRow = Record<string, unknown>;
export interface ActivitySource { kind: string; path: string; array?: boolean; title: string }
export interface ActivityEntry { id: string; token: string; kind: string; code: string; title: string; message: string; web: string; mobile: string; action: boolean; priority: number; at: string }
export type ActivityData = Record<string, ActivityRow[]>;
export const activityText = (row: ActivityRow, path: string): string => {
  let value: unknown = row;
  for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as ActivityRow)[key] : undefined;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};
export function activityHash(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function activitySources(role: ActivityRole): ActivitySource[] {
  if (role === 'ADMIN') return [{ kind: 'users', path: '/admin/users', title: 'Tài khoản' }];
  const kinds = role === 'CUSTOMER'
    ? ['reservations', 'invoices', 'payment-submissions', 'appointments', 'renewals', 'stock-movements', 'returns', 'deposit-settlements', 'support-requests', 'contracts']
    : role === 'STAFF' ? ['reservations', 'inquiries', 'appointments', 'renewals', 'stock-movements', 'returns', 'maintenance', 'support-requests', 'transfers']
      : ['payment-submissions', 'deposit-settlements', 'support-requests', 'maintenance', 'stock-movements', 'invoices'];
  const names: Record<string, string> = { reservations: 'Đặt kho', invoices: 'Hóa đơn', 'payment-submissions': 'Chuyển khoản', appointments: 'Lịch nhận kho', renewals: 'Gia hạn', 'stock-movements': 'Nhập – xuất hàng', returns: 'Trả kho', 'deposit-settlements': 'Tiền cọc', 'support-requests': 'Hỗ trợ', contracts: 'Hợp đồng', inquiries: 'Tư vấn', maintenance: 'Bảo trì', transfers: 'Chuyển kho' };
  return kinds.map(kind => ({ kind, title: names[kind], path: role === 'CUSTOMER' && kind === 'reservations' ? '/reservations' : `/${role.toLowerCase()}/${kind}`, array: role === 'CUSTOMER' && kind === 'reservations' }));
}
const customerStates: Record<string, string> = {
  PENDING: 'Đang chờ xét duyệt', REQUESTED: 'Yêu cầu của bạn đã được gửi', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy', REJECTED: 'Cần xem kết quả xử lý', EXPIRED: 'Yêu cầu đã hết hạn', OPEN: 'Chưa thanh toán', PARTIALLY_PAID: 'Chưa thanh toán đủ', PAID: 'Đã thanh toán đủ', PENDING_VERIFICATION: 'Đang chờ xác nhận chuyển khoản', VERIFIED: 'Đã xác nhận khoản chuyển', APPROVED_PENDING_PAYMENT: 'Gia hạn đã duyệt · cần thanh toán', ASSIGNED: 'Đã có nhân viên tiếp nhận', IN_PROGRESS: 'Đang được xử lý', ESCALATED: 'Đã chuyển bộ phận phụ trách xem xét', RESOLVED: 'Đã có kết quả hỗ trợ', COMPLETED: 'Đã hoàn tất', ACTIVE: 'Kho của bạn đã sẵn sàng sử dụng', READY_FOR_HANDOVER: 'Bạn có thể đặt lịch nhận kho', PENDING_SETTLEMENT: 'Đang đối chiếu tiền cọc', INSPECTION_IN_PROGRESS: 'Đang kiểm tra trả kho', ISSUE_FOUND: 'Có vấn đề cần đối chiếu', PENDING_REVIEW: 'Đang chờ đối chiếu tiền cọc', APPROVED: 'Đã duyệt', AWAITING_OUTSTANDING_PAYMENT: 'Còn khoản cần thanh toán', SETTLED: 'Đã hoàn tất quyết toán', VOID: 'Hóa đơn đã hủy',
};
export function buildActivity(role: ActivityRole, userId: string, data: ActivityData): ActivityEntry[] {
  const result: ActivityEntry[] = [];
  const handoverReservations = new Set<string>();
  const pendingInvoiceIds = new Set((data['payment-submissions'] ?? []).filter(row => row.status === 'PENDING_VERIFICATION').map(row => activityText(row, 'invoice.id')));
  const renewalActivationIds = new Set((data.renewals ?? []).filter(row => row.status === 'APPROVED_PENDING_PAYMENT').flatMap(row => Array.isArray(row.invoices) ? (row.invoices as ActivityRow[]).filter(invoice => Number(invoice.renewalCycle) === 1).map(invoice => activityText(invoice, 'id')) : []));
  for (const source of activitySources(role)) for (const row of data[source.kind] ?? []) {
    const get = (path: string) => activityText(row, path), kind = source.kind, status = get('status') || get('accountStatus'), id = get('id');
    if (!id) continue;
    if (kind === 'inquiries' && row.requestType !== 'INQUIRY') continue;
    const code = ['renewalCode', 'invoiceCode', 'submissionCode', 'appointmentCode', 'movementCode', 'supportCode', 'maintenanceCode', 'returnCode', 'settlementCode', 'transferCode', 'contractCode', 'reference'].map(get).find(Boolean) || id;
    let title = source.title, message = '', action = false, priority = 2;
    let web = `/${role.toLowerCase()}/${kind}/${encodeURIComponent(id)}`, mobile = web;
    if (role === 'CUSTOMER') {
      title = `${source.title} · ${customerStates[status] ?? 'Trạng thái đã cập nhật'}`;
      message = workflowGuide(kind, status, 'customer') || 'Mở hồ sơ để xem trạng thái và thông tin của bạn.';
      const pages: Record<string, string> = { invoices: 'payments', 'payment-submissions': 'payments', appointments: 'appointments', renewals: 'renewals', returns: 'returns', 'deposit-settlements': 'returns', 'support-requests': 'support', contracts: 'contracts' };
      if (pages[kind]) web = `/customer/${pages[kind]}`;
      if (kind === 'invoices') {
        web += `?invoice=${encodeURIComponent(id)}`;
        action = ['OPEN', 'PARTIALLY_PAID'].includes(status) && Number(row.balanceDue) > 0 && !pendingInvoiceIds.has(id);
        if (renewalActivationIds.has(id)) action = false;
        if (pendingInvoiceIds.has(id)) { title = 'Chuyển khoản đang chờ xác nhận'; message = 'WDP đang đối chiếu khoản bạn đã thông báo. Bạn chưa cần gửi thêm thông báo cho cùng hóa đơn.'; }
        else if (action) message = 'Mở hóa đơn để xem số tiền còn lại, hạn thanh toán và phương thức thanh toán.';
      }
      if (kind === 'payment-submissions') {
        web = `/customer/payments?invoice=${encodeURIComponent(get('invoice.id'))}&view=submissions`;
        action = status === 'REJECTED';
        if (action) message = 'Xem lý do chưa xác nhận được khoản chuyển. Nếu bạn đã chuyển tiền, hãy gửi hỗ trợ để WDP kiểm tra.';
      }
      if (kind === 'renewals' && status === 'APPROVED_PENDING_PAYMENT') {
        action = true;
        const invoices = Array.isArray(row.invoices) ? row.invoices as ActivityRow[] : [];
        const invoice = invoices.find(item => Number(item.renewalCycle) === 1);
        if (invoice?.id) { web = `/customer/payments?invoice=${encodeURIComponent(String(invoice.id))}`; mobile = `/customer/invoices/${encodeURIComponent(String(invoice.id))}`; }
        if (invoice?.status === 'PAID') { action = false; message = 'Thanh toán kỳ đầu đã được ghi nhận. Vui lòng làm mới để kiểm tra kết quả cập nhật thời hạn thuê.'; }
        if (invoice?.id && pendingInvoiceIds.has(String(invoice.id))) { action = false; title = 'Gia hạn · Đang chờ xác nhận thanh toán'; message = 'Bạn đã gửi thông báo chuyển khoản cho kỳ gia hạn này. WDP đang đối chiếu tiền thực nhận; bạn chưa cần gửi thêm thông báo cho cùng hóa đơn.'; }
      }
      if (kind === 'contracts' && status === 'READY_FOR_HANDOVER') {
        const reservationId = get('reservation.id');
        if ((data.appointments ?? []).some(item => activityText(item, 'reservation.id') === reservationId && ['REQUESTED', 'CONFIRMED'].includes(String(item.status)))) continue;
        if (handoverReservations.has(reservationId)) continue;
        handoverReservations.add(reservationId);
        const group = (data.contracts ?? []).filter(item => activityText(item, 'reservation.id') === reservationId);
        action = group.length === Number(get('reservation.quantity')) && group.every(item => item.status === 'READY_FOR_HANDOVER' && Date.parse(`${activityText(item, 'endDate').slice(0, 10)}T00:00:00+07:00`) > Date.now());
        web = '/customer/appointments'; mobile = '/customer/contracts';
        message = action ? 'Hợp đồng đã đủ điều kiện. Chọn lịch phù hợp để WDP xác nhận và bàn giao kho cho bạn.' : 'Bạn có thể đặt lịch sau khi toàn bộ hợp đồng của yêu cầu đủ điều kiện và còn trong kỳ thuê. Mở hồ sơ để xem thông tin.';
        if (!action) title = 'Nhận kho · Xem điều kiện bàn giao';
      }
      if (kind === 'contracts' && status === 'ACTIVE') {
        const unitCode = get('storageUnit.unitCode') || get('unit.unitCode');
        title = unitCode ? `Hợp đồng · Kho ${unitCode} đang sử dụng` : 'Hợp đồng · Đang sử dụng kho';
        message = 'Xem vị trí kho và thời hạn hiện tại trong hợp đồng. Thông tin được cập nhật sau khi hoàn tất gia hạn hoặc chuyển kho.';
      }
      if (kind === 'support-requests' && status === 'OPEN') title = 'Hỗ trợ · Đang chờ tiếp nhận';
      if (kind === 'deposit-settlements' && status === 'AWAITING_OUTSTANDING_PAYMENT') { action = true; message = 'Xem các khoản được đối chiếu khi trả kho và hóa đơn còn lại trước khi hoàn tất quyết toán.'; }
      if (kind === 'reservations' && status === 'PENDING') message = 'Yêu cầu đặt kho của bạn đã được gửi. WDP đang kiểm tra kho và sẽ cập nhật kết quả tại đây.';
      if (kind === 'reservations' && status === 'CONFIRMED') message = 'Yêu cầu đặt kho đã được chấp thuận. Xem hợp đồng, thanh toán và các bước nhận kho trong tài khoản.';
    } else if (role === 'ADMIN') {
      title = `${get('fullName') || 'Tài khoản'} · ${status === 'DISABLED' ? 'Đã vô hiệu hóa' : 'Đang hoạt động'}`;
      message = `${get('email')} · ${{ CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', MANAGER: 'Quản lý', ADMIN: 'Quản trị viên' }[get('role')] ?? 'Người dùng'}`;
      web = `/admin/users?search=${encodeURIComponent(get('email') || get('fullName'))}`; mobile = web;
    } else {
      if (role === 'MANAGER') {
        const simple = ['reservations', 'inquiries', 'payment-submissions'].includes(kind);
        web = simple ? `/manager/${kind}/${encodeURIComponent(id)}` : `/manager/operations/${kind}/${encodeURIComponent(id)}`;
        if (kind === 'payment-submissions') web = '/manager/payment-submissions';
        const assignment = ['support-requests', 'maintenance', 'stock-movements'].includes(kind);
        if (assignment) { web = `/manager/assignments?kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(code)}`; mobile = '/manager/assignments'; }
        action = (kind === 'payment-submissions' && status === 'PENDING_VERIFICATION') || (kind === 'deposit-settlements' && ['PENDING_REVIEW', 'APPROVED'].includes(status)) || awaitingAssignment(kind, row) || (kind === 'invoices' && isOverdueInvoice(row));
        if (kind === 'invoices' && !action) continue;
      } else action = staffNeedsAction(kind, row, userId);
      title = `${source.title} · ${action ? 'Cần xử lý' : 'Theo dõi tiến độ'}`;
      message = workflowGuide(kind, status, role === 'STAFF' ? 'staff' : 'internal') || (action ? 'Mở hồ sơ, đối chiếu thông tin và thực hiện thao tác trong phạm vi của bạn.' : 'Mở hồ sơ để xem kết quả và người phụ trách hiện tại.');
      if (kind === 'payment-submissions') message = status === 'PENDING_VERIFICATION' ? 'Khách đã gửi thông báo chuyển khoản. Đối chiếu tiền thực nhận trước khi xác nhận.' : 'Xem kết quả đối chiếu thông báo chuyển khoản.';
      if (role === 'MANAGER' && awaitingAssignment(kind, row)) message = 'Chưa có nhân viên phụ trách. Mở Phân công nhân viên để chọn người xử lý và theo dõi tiến độ.';
      if (role === 'MANAGER' && kind === 'invoices') { title = 'Hóa đơn · Quá hạn thanh toán'; message = 'Kiểm tra số dư, hạn thanh toán và lịch sử thu tiền trước khi liên hệ khách hàng.'; }
      if (role === 'STAFF' && awaitingAssignment(kind, row)) { title = `${source.title} · Chờ quản lý phân công`; message = 'Hồ sơ đã được tiếp nhận và đang chờ quản lý giao người phụ trách. Bạn có thể theo dõi; chưa thực hiện thay nhân viên được giao.'; }
      if (role === 'STAFF' && !action && get('assignedStaff.id') && !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(status)) message = `Nhân viên phụ trách: ${get('assignedStaff.fullName') || 'đã được phân công'}. Bạn có thể theo dõi trạng thái; thao tác thực hiện dành cho người được giao.`;
    }
    if (role === 'CUSTOMER' && get('rejectionReason')) message += ` Lý do: ${get('rejectionReason')}`;
    if (role === 'CUSTOMER' && kind === 'support-requests' && get('resolutionNote')) message += ` Phản hồi: ${get('resolutionNote')}`;
    if (action) priority = 1;
    if (action && (row.priority === 'HIGH' || status === 'ESCALATED' || status === 'PENDING_VERIFICATION')) priority = 0;
    const at = ['completedAt', 'verifiedAt', 'reviewedAt', 'resolvedAt', 'confirmedAt', 'assignedAt', 'updatedAt', 'submittedAt', 'requestedAt', 'createdAt'].map(get).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
    const fingerprint = JSON.stringify([status, title, message, get('assignedStaff.id'), get('assignedStaff.fullName'), get('balanceDue'), get('amountPaid'), get('resolutionNote'), get('rejectionReason'), get('requestedEndDate'), get('endDate'), get('scheduledAt'), get('completionNote'), get('workNote'), get('priority'), get('role'), get('fullName'), get('storageUnit.id'), get('storageUnit.unitCode'), get('unit.id'), get('unit.unitCode')]);
    const entryId = `${kind}:${id}`, token = activityHash(`${entryId}:${fingerprint}`);
    result.push({ id: entryId, token, kind, code, title, message, web, mobile, action, priority, at });
  }
  return result.sort((a, b) => a.priority - b.priority || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || a.id.localeCompare(b.id)).slice(0, 100);
}
