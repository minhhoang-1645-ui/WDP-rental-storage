import { paymentWindowClosed } from './payment-state';
import { workflowGuide } from './workflow-guide';
import { assignmentNeedsAttention, awaitingAssignment, managerNeedsAction, staffNeedsAction } from './work-queue';
import { isTransferRequest } from './transfer-request';
import { isEarlyReturnRequest } from './early-return';

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
      : ['payment-submissions', 'support-requests', 'maintenance', 'stock-movements', 'invoices', 'deposit-settlements', 'online-payment-reconciliations'];
  const names: Record<string, string> = { reservations: 'Đặt kho', invoices: 'Hóa đơn', 'payment-submissions': 'Chuyển khoản', appointments: 'Lịch nhận kho', renewals: 'Gia hạn', 'stock-movements': 'Nhập – xuất hàng', returns: 'Trả kho', 'deposit-settlements': 'Tiền cọc', 'support-requests': 'Hỗ trợ', contracts: 'Hợp đồng', inquiries: 'Tư vấn', maintenance: 'Bảo trì', transfers: 'Chuyển kho' };
  names['online-payment-reconciliations'] = 'Đối soát VNPay';
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
    const code = ['reconciliationCode', 'renewalCode', 'invoiceCode', 'submissionCode', 'appointmentCode', 'movementCode', 'supportCode', 'maintenanceCode', 'returnCode', 'settlementCode', 'transferCode', 'contractCode', 'reference'].map(get).find(Boolean) || id;
    let title = source.title, message = '', action = false, priority = 2;
    let web = `/${role.toLowerCase()}/${kind}/${encodeURIComponent(id)}`, mobile = web;
    if (role === 'CUSTOMER') {
      title = `${source.title} · ${customerStates[status] ?? 'Trạng thái đã cập nhật'}`;
      message = workflowGuide(kind, status, 'customer') || 'Mở hồ sơ để xem trạng thái và thông tin của bạn.';
      const pages: Record<string, string> = { invoices: 'payments', 'payment-submissions': 'payments', appointments: 'appointments', renewals: 'renewals', returns: 'returns', 'deposit-settlements': 'returns', 'support-requests': 'support', contracts: 'contracts' };
      if (pages[kind]) web = `/customer/${pages[kind]}`;
      if (kind === 'invoices') {
        web += `?invoice=${encodeURIComponent(id)}`;
        action = ['OPEN', 'PARTIALLY_PAID'].includes(status) && Number(row.balanceDue) > 0 && !pendingInvoiceIds.has(id) && !paymentWindowClosed({ type: row.type, reservation: { status: get('reservation.status'), expiresAt: get('reservation.expiresAt') } });
        if (renewalActivationIds.has(id)) action = false;
        if (pendingInvoiceIds.has(id)) { title = 'Chuyển khoản đang chờ xác nhận'; message = 'NestBox đang đối chiếu khoản bạn đã thông báo. Bạn chưa cần gửi thêm thông báo cho cùng hóa đơn.'; }
        else if (paymentWindowClosed({ type: row.type, reservation: { status: get('reservation.status'), expiresAt: get('reservation.expiresAt') } })) message = 'Đã hết hạn giữ kho. Kiểm tra lại trạng thái và gửi hỗ trợ nếu bạn đã chuyển tiền.';
        else if (action) message = 'Mở hóa đơn để xem số tiền còn lại, hạn thanh toán và phương thức thanh toán.';
      }
      if (kind === 'payment-submissions') {
        web = `/customer/payments?invoice=${encodeURIComponent(get('invoice.id'))}&view=submissions`;
        action = status === 'REJECTED';
        if (action) message = 'Xem lý do chưa xác nhận được khoản chuyển. Nếu bạn đã chuyển tiền, hãy gửi hỗ trợ để NestBox kiểm tra.';
      }
      if (kind === 'renewals' && status === 'APPROVED_PENDING_PAYMENT') {
        action = true;
        const invoices = Array.isArray(row.invoices) ? row.invoices as ActivityRow[] : [];
        const invoice = invoices.find(item => Number(item.renewalCycle) === 1);
        if (invoice?.id) { web = `/customer/payments?invoice=${encodeURIComponent(String(invoice.id))}`; mobile = `/customer/invoices/${encodeURIComponent(String(invoice.id))}`; }
        if (invoice?.status === 'PAID') { action = false; message = 'Thanh toán kỳ đầu đã được ghi nhận. Vui lòng làm mới để kiểm tra kết quả cập nhật thời hạn thuê.'; }
        if (invoice?.id && pendingInvoiceIds.has(String(invoice.id))) { action = false; title = 'Gia hạn · Đang chờ xác nhận thanh toán'; message = 'Bạn đã gửi thông báo chuyển khoản cho kỳ gia hạn này. NestBox đang đối chiếu tiền thực nhận; bạn chưa cần gửi thêm thông báo cho cùng hóa đơn.'; }
      }
      if (kind === 'contracts' && status === 'READY_FOR_HANDOVER') {
        const reservationId = get('reservation.id');
        if ((data.appointments ?? []).some(item => activityText(item, 'reservation.id') === reservationId && ['REQUESTED', 'CONFIRMED'].includes(String(item.status)))) continue;
        if (handoverReservations.has(reservationId)) continue;
        handoverReservations.add(reservationId);
        const group = (data.contracts ?? []).filter(item => activityText(item, 'reservation.id') === reservationId);
        action = group.length === Number(get('reservation.quantity')) && group.every(item => item.status === 'READY_FOR_HANDOVER' && Date.parse(`${activityText(item, 'endDate').slice(0, 10)}T00:00:00+07:00`) > Date.now());
        web = '/customer/appointments'; mobile = '/customer/contracts';
        message = action ? 'Hợp đồng đã đủ điều kiện. Đặt lịch nhận kho; lịch hợp lệ được xác nhận tự động. Bạn có thể hẹn nhận chìa khóa sớm tối đa 3 ngày trước kỳ thuê.' : 'Bạn có thể đặt lịch sau khi toàn bộ hợp đồng của yêu cầu đủ điều kiện và còn trong kỳ thuê. Mở hồ sơ để xem thông tin.';
        if (!action) title = 'Nhận kho · Xem điều kiện bàn giao';
      }
      if (kind === 'contracts' && status === 'ACTIVE') {
        const unitCode = get('storageUnit.unitCode') || get('unit.unitCode');
        title = unitCode ? `Hợp đồng · Kho ${unitCode} đang sử dụng` : 'Hợp đồng · Đang sử dụng kho';
        message = 'Xem vị trí kho và thời hạn hiện tại trong hợp đồng. Thông tin được cập nhật sau khi hoàn tất gia hạn hoặc chuyển kho.';
      }
      if (kind === 'support-requests' && status === 'OPEN') title = 'Hỗ trợ · Đang chờ tiếp nhận';
      if (kind === 'deposit-settlements' && status === 'AWAITING_OUTSTANDING_PAYMENT') { action = true; message = 'Xem các khoản được đối chiếu khi trả kho và hóa đơn còn lại trước khi hoàn tất quyết toán.'; }
      if (kind === 'reservations' && status === 'PENDING') message = 'Yêu cầu đặt kho của bạn đã được gửi. NestBox đang kiểm tra kho và sẽ cập nhật kết quả tại đây.';
      if (kind === 'reservations' && status === 'CONFIRMED') message = get('expiresAt') ? `Đặt kho đã xác nhận. Thanh toán trước ${new Date(get('expiresAt')).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })} (UTC+7) để tiếp tục giữ kho.` : 'Đặt kho đã xác nhận. Xem hợp đồng, thanh toán và các bước nhận kho trong tài khoản.';
      if (kind === 'reservations' && status === 'EXPIRED') message = 'Thời hạn giữ kho đã kết thúc. Kiểm tra hóa đơn và đặt kho mới nếu bạn vẫn có nhu cầu; nếu đã chuyển tiền, hãy gửi hỗ trợ.';
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
        if (assignment && (kind === 'stock-movements' || assignmentNeedsAttention(kind, row))) { web = `/manager/assignments?kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(code)}`; mobile = '/manager/assignments'; }
        action = managerNeedsAction(kind, row);
        if (kind === 'invoices' && (!['OPEN', 'PARTIALLY_PAID'].includes(status) || Number(row.balanceDue) <= 0)) continue;
      } else action = staffNeedsAction(kind, row, userId);
      title = `${source.title} · ${action ? 'Cần xử lý' : 'Theo dõi tiến độ'}`;
      message = workflowGuide(kind, status, role === 'STAFF' ? 'staff' : 'internal') || (action ? 'Mở hồ sơ, đối chiếu thông tin và thực hiện thao tác trong phạm vi của bạn.' : 'Mở hồ sơ để xem kết quả và người phụ trách hiện tại.');
      if (kind === 'payment-submissions') message = status === 'PENDING_VERIFICATION' ? 'Khách đã gửi thông báo chuyển khoản. Đối chiếu tiền thực nhận trước khi xác nhận.' : 'Xem kết quả đối chiếu thông báo chuyển khoản.';
      if (role === 'MANAGER' && awaitingAssignment(kind, row)) message = 'Chưa có nhân viên phụ trách. Mở Phân công nhân viên để chọn người xử lý và theo dõi tiến độ.';
      if (role === 'MANAGER' && assignmentNeedsAttention(kind, row) && !awaitingAssignment(kind, row)) message = 'Tài khoản nhân viên phụ trách đã bị vô hiệu hóa. Chọn người thay thế để hồ sơ tiếp tục được xử lý.';
      if (role === 'MANAGER' && kind === 'maintenance' && status === 'AWAITING_VERIFICATION') { title = 'Bảo trì · Chờ quản lý nghiệm thu'; message = 'Kiểm tra hiện trạng và kết quả nhân viên đã gửi, rồi nghiệm thu hoặc yêu cầu làm tiếp.'; }
      if (role === 'MANAGER' && kind === 'support-requests' && status === 'ESCALATED') { title = 'Hỗ trợ · Cần quản lý quyết định'; message = 'Nhân viên đã chuyển hồ sơ lên. Đọc nội dung, lý do chuyển và ghi kết quả xử lý cho khách.'; }
      if (role === 'MANAGER' && kind === 'online-payment-reconciliations') { web = '/manager/online-payment-reconciliations'; mobile = web; title = `Đối soát VNPay · ${status === 'REFUND_REQUIRED' ? 'Cần theo dõi hoàn tiền' : status === 'PENDING_REVIEW' ? 'Cần kiểm tra' : 'Đã xử lý'}`; message = 'Đối chiếu giao dịch thực nhận trước khi quyết định. Chỉ ghi đã hoàn sau khi thực sự hoàn tiền, có tham chiếu.'; }
      if (role === 'MANAGER' && kind === 'invoices') { title = action ? 'Hóa đơn · Quá hạn thanh toán' : 'Hóa đơn · Đang chờ thanh toán'; message = action ? 'Kiểm tra số dư, hạn thanh toán và lịch sử thu tiền trước khi liên hệ khách hàng.' : 'Theo dõi hóa đơn khách chưa thanh toán. Nếu thu tại cơ sở, chỉ ghi nhận sau khi thực tế đã nhận tiền.'; }
      if (role === 'STAFF' && awaitingAssignment(kind, row)) { title = `${source.title} · Chờ quản lý phân công`; message = 'Hồ sơ đã được tiếp nhận và đang chờ quản lý giao người phụ trách. Bạn có thể theo dõi; chưa thực hiện thay nhân viên được giao.'; }
      if (role === 'STAFF' && !action && get('assignedStaff.id') && !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(status)) message = `Nhân viên phụ trách: ${get('assignedStaff.fullName') || 'đã được phân công'}. Bạn có thể theo dõi trạng thái; thao tác thực hiện dành cho người được giao.`;
    }
    if (role === 'CUSTOMER' && kind === 'contracts' && status === 'PENDING_PAYMENT' && !activityText(row, 'terms.acceptedAt') && !paymentWindowClosed({ type: 'INITIAL', reservation: { status: get('reservation.status'), expiresAt: get('reservation.expiresAt') } })) {
      title = 'Hợp đồng · Cần bạn đọc và ký'; message = 'Ký hợp đồng này cùng các hợp đồng còn lại của đơn trước khi thanh toán.'; action = true;
      web = '/customer/contracts?contract=' + encodeURIComponent(id); mobile = '/customer/contracts/' + encodeURIComponent(id);
    }
    if (role === 'CUSTOMER' && kind === 'renewals' && status === 'APPROVED_PENDING_PAYMENT' && !activityText(row, 'appendix.acceptedAt')) {
      title = 'Gia hạn · Cần ký phụ lục'; message = 'Gia hạn đã được duyệt. Bạn cần đọc và ký phụ lục trước khi thanh toán.'; action = true;
      web = '/customer/renewals?renewal=' + encodeURIComponent(id); mobile = '/customer/renewals/' + encodeURIComponent(id);
    }
    if (role === 'CUSTOMER' && kind === 'invoices' && action && row.signing && (row.signing as ActivityRow).complete === false) {
      action = true; title = 'Hóa đơn · Cần ký tài liệu trước'; message = 'Mở hóa đơn để đi đến hợp đồng hoặc phụ lục cần ký; chưa chuyển tiền ở bước này.';
    }
    if (kind === 'support-requests' && isTransferRequest(row)) {
      const transfer = Array.isArray(row.transfers) ? row.transfers[0] as ActivityRow | undefined : undefined;
      const transferStatus = transfer ? activityText(transfer, 'status') : '';
      const state = ({ REQUESTED: 'Chờ chọn kho mới', APPROVED: 'Đã duyệt · Chờ chuyển thực tế', COMPLETED: 'Đã chuyển kho', REJECTED: 'Chuyển kho chưa được chấp thuận' } as Record<string,string>)[transferStatus] || 'Đang chờ tiếp nhận';
      title = `Chuyển kho · ${state}`;
      if (role === 'CUSTOMER') { web = '/customer/transfers'; mobile = web; }
      if (role === 'STAFF') { web = transfer ? `/staff/transfers/${encodeURIComponent(activityText(transfer, 'id'))}` : '/staff/transfers'; mobile = web; action = transfer ? ['REQUESTED', 'APPROVED'].includes(transferStatus) : !['RESOLVED', 'CANCELLED'].includes(status); }
      if (!transfer && ['RESOLVED', 'CANCELLED'].includes(status)) { title = 'Chuyển kho · Đã có kết quả xử lý'; message = get('resolutionNote') || 'Yêu cầu đã đóng. Mở hồ sơ để xem kết quả; chưa có lệnh chuyển kho liên kết.'; }
      if (transfer) message = `${activityText(transfer, 'transferCode')} · Kho ${activityText(transfer, 'fromUnit.unitCode')} → ${activityText(transfer, 'toUnit.unitCode') || 'đang lựa chọn'}. ${transferStatus === 'COMPLETED' ? 'Đã bàn giao kho đích; hợp đồng và kho đang dùng đã cập nhật.' : 'Theo dõi xác nhận và bàn giao thực tế trước khi chuyển hàng.'}`;
    }
    if (kind === 'support-requests' && isEarlyReturnRequest(row)) {
      const decision = get('earlyReturnDecision');
      title = `Trả trước hạn · ${decision === 'APPROVED' ? 'Đã chấp thuận' : decision === 'REJECTED' ? 'Chưa được chấp thuận' : 'Chờ quản lý xem xét'}`;
      message = get('resolutionNote') || 'Quản lý đối chiếu công nợ và điều kiện trước khi cho phép trả kho trước hạn.';
      action = role === 'MANAGER' && !decision && !['RESOLVED', 'CANCELLED'].includes(status) || role === 'CUSTOMER' && decision === 'APPROVED';
      if (role === 'MANAGER') { web = '/manager/early-returns'; mobile = web; }
      if (role === 'CUSTOMER') { web = '/customer/returns'; mobile = web; }
      if (role === 'STAFF') action = false;
      const returnRecord = (data.returns ?? []).find(item => activityText(item, 'reservation.id') === get('reservation.id') && item.status !== 'CANCELLED');
      if (role === 'CUSTOMER' && returnRecord) { action = false; message = returnRecord.status === 'COMPLETED' ? 'Bạn đã hoàn tất trả kho. Mở hồ sơ để xem kết quả kiểm tra và tiền cọc.' : 'Hồ sơ trả kho đã được gửi. Theo dõi kiểm tra và quyết toán trong Trả kho & tiền cọc.'; }
    }
    if (role === 'CUSTOMER' && get('rejectionReason')) message += ` Lý do: ${get('rejectionReason')}`;
    if (role === 'CUSTOMER' && kind === 'support-requests' && get('resolutionNote')) message += ` Phản hồi: ${get('resolutionNote')}`;
    const context = [role !== 'CUSTOMER' ? get('customer.fullName') || get('reservation.customer.fullName') : '', get('reservation.reference'), get('storageUnit.unitCode') || get('unit.unitCode'), ['support-requests', 'inquiries'].includes(kind) ? get('subject').slice(0, 160) : ''].filter(Boolean);
    if (context.length) message = context.join(' · ') + '. ' + message;
    if (action) priority = 1;
    if (action && (row.priority === 'HIGH' || status === 'ESCALATED' || status === 'PENDING_VERIFICATION')) priority = 0;
    const at = ['completedAt', 'verifiedAt', 'reviewedAt', 'resolvedAt', 'confirmedAt', 'assignedAt', 'updatedAt', 'submittedAt', 'requestedAt', 'createdAt'].map(get).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
    const fingerprint = JSON.stringify([code, status, title, message, get('assignedStaff.id'), get('assignedStaff.fullName'), get('balanceDue'), get('amountPaid'), get('expiresAt'), get('resolutionNote'), get('rejectionReason'), get('requestedEndDate'), get('endDate'), get('scheduledAt'), get('completionNote'), get('workNote'), get('priority'), get('role'), get('fullName'), get('storageUnit.id'), get('storageUnit.unitCode'), get('unit.id'), get('unit.unitCode')]);
    const entryId = `${kind}:${id}`, token = activityHash(`${entryId}:${fingerprint}`);
    result.push({ id: entryId, token, kind, code, title, message, web, mobile, action, priority, at });
  }
  return [...new Map(result.map(item => [item.id, item])).values()].sort((a, b) => a.priority - b.priority || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || a.id.localeCompare(b.id));
}
