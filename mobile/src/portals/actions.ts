import { EARLY_RETURN_SUBJECT, isEarlyReturnRequest, isCurrentEarlyReturnApproval } from '@/utils/early-return';
import { idOf, object, options, rows, text, type Row } from '@/operations/model';
import type { FormAction, FormField } from '@/operations/form';
import { formatDate } from '@/utils/format';
import { keyCollectionStartDate } from '@/utils/handover';

const confirmation = (title = 'Tôi xác nhận thông tin và thao tác này'): FormField => ({ name: '_confirmed', title, checkbox: true, required: true, clientOnly: true });
const note = (name = 'note', title = 'Ghi chú', required = false, limit = 2000): FormField => ({ name, title, required, multiline: true, maxLength: limit, ...(required ? { minLength: 3 } : {}) });
const choice = (name: string, title: string, values: string[], initial?: string): FormField => ({ name, title, choices: options(values), required: true, initial });
const issues = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
export function handoverWindowIssue(row: Row, now: number) {
  const today = new Date(now + 25200000).toISOString().slice(0, 10);
  return rows(row.allocatedUnits).some(item => (text(item, 'contractStartDate') && today < keyCollectionStartDate(text(item, 'contractStartDate'))) || (text(item, 'contractEndDate') && today >= text(item, 'contractEndDate')));
}
export function staffRecordActions(resource: string, row: Row, userId: string, now: number): FormAction[] {
  const root = `/staff/${resource}/${encodeURIComponent(idOf(row))}`, result: FormAction[] = [];
  const add = (title: string, suffix: string, fields: FormField[] = [], idempotent = false, description?: string) => result.push({ title, path: root + suffix, method: 'POST', fields: [...fields, confirmation()], idempotent, description });
  const assigned = Boolean(userId) && text(row, 'assignedStaff.id') === userId;
  if (resource === 'appointments' && row.status === 'CONFIRMED' && typeof row.scheduledAt === 'string' && Number.isFinite(Date.parse(row.scheduledAt)) && Date.parse(row.scheduledAt) <= now && !handoverWindowIssue(row, now)) {
    add('Hoàn tất bàn giao', '/complete-handover', [
      { name: 'recipientName', title: 'Người nhận kho', required: true, minLength: 2, maxLength: 120 },
      note('condition', 'Hiện trạng cửa, khóa, tường, sàn và thiết bị', true, 500),
      { name: 'accessItemCount', title: 'Số chìa khóa/thẻ đã giao', required: true, numeric: true, minimum: 0, maximum: 50 },
      { name: 'identityVerified', title: 'Đã đối chiếu người nhận kho', checkbox: true, required: true },
      { name: 'unitInspected', title: 'Đã kiểm tra đúng mã kho và hiện trạng từng kho', checkbox: true, required: true },
      { name: 'accessDelivered', title: 'Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập', checkbox: true, required: true },
      note('note', 'Ghi chú bàn giao', false, 1000),
    ], false, 'Chỉ xác nhận sau khi đã bàn giao thực tế đầy đủ mọi kho trong lịch hẹn.');
    result[result.length - 1].transform = input => ({ note: input.note, handoverReport: { recipientName: input.recipientName, condition: input.condition, accessItemCount: input.accessItemCount, identityVerified: input.identityVerified, unitInspected: input.unitInspected, accessDelivered: input.accessDelivered } });
    result[result.length - 1].validate = () => handoverWindowIssue(row, Date.now()) || Date.parse(String(row.scheduledAt)) > Date.now() ? 'Thời điểm bàn giao nằm ngoài kỳ thuê hoặc chưa đến giờ hẹn. Tải lại hồ sơ.' : undefined;
  }
  if (resource === 'maintenance' && assigned) {
    if (row.status === 'OPEN') add('Bắt đầu bảo trì', '/start', [], true);
    if (row.status === 'IN_PROGRESS') add('Gửi kết quả để nghiệm thu', '/complete-work', [note('workNote', 'Kết quả sửa chữa', true, 4000)], true, 'Kho vẫn bảo trì cho đến khi quản lý nghiệm thu.');
  }
  if (resource === 'support-requests' && !isEarlyReturnRequest(row) && assigned) {
    if (row.status === 'ASSIGNED') add('Bắt đầu hỗ trợ', '/start', [], true);
    if (row.status === 'IN_PROGRESS') {
      add('Hoàn tất hỗ trợ', '/resolve', [choice('resolutionType', 'Kết quả hỗ trợ', ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'], 'ON_SITE_RESOLVED'), note('resolutionNote', 'Nội dung xử lý', true, 4000)], true);
      add('Chuyển bộ phận phụ trách xem xét', '/escalate', [note('reason', 'Lý do chuyển bộ phận phụ trách', true, 4000)], true);
    }
  }
  if (resource === 'transfers' && row.status === 'APPROVED') add('Hoàn tất chuyển kho', '/complete', [], false, 'Đối chiếu kho nguồn, kho đích và hợp đồng. Chỉ xác nhận sau khi đã chuyển thực tế.');
  if (resource === 'returns') {
    if (row.status === 'REQUESTED') add('Bắt đầu kiểm tra', '/start-inspection');
    if (['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(String(row.status))) {
      const inspections = rows(row.inspections);
      for (const inspection of inspections) {
        const unit = text(inspection, 'unit.unitCode', 'storageUnit.unitCode');
        const base = `${root}/inspections/${encodeURIComponent(idOf(inspection))}`;
        if (inspection.result !== 'ISSUE_FOUND') result.push({ title: `Ghi nhận kho ${unit} đạt`, path: base, method: 'PATCH', fields: [note('conditionNote', 'Hiện trạng kho'), confirmation('Tôi đã kiểm tra kho thực tế')], transform: input => ({ ...input, result: 'PASS' }) });
        result.push({ title: `Ghi nhận vấn đề kho ${unit}`, path: base, method: 'PATCH', fields: [choice('issueType', 'Phân loại vấn đề', issues, text(inspection, 'issueType') || undefined), note('issueNote', 'Mô tả vấn đề', true), note('conditionNote', 'Hiện trạng kho'), confirmation('Tôi đã kiểm tra kho thực tế')], transform: input => ({ ...input, result: 'ISSUE_FOUND' }), description: 'Chỉ ghi hiện trạng; quản lý xác định trách nhiệm và phí.' });
      }
      if (Number(text(row, 'inventory.remainingItemTypes') || 0) === 0 && Number(text(row, 'inventory.pendingMovements') || 0) === 0 && inspections.length && inspections.every(item => ['PASS', 'ISSUE_FOUND'].includes(String(item.result)) && (item.result !== 'ISSUE_FOUND' || item.issueType))) add('Hoàn tất nhận kho trả', '/finalize', [], false, 'Đã nhận lại toàn bộ kho thực tế và ghi đủ kết quả kiểm tra. Tiền cọc được quyết toán riêng.');
    }
  }
  return result;
}
export function staffMaintenanceCreate(): FormAction {
  return { title: 'Báo tình trạng cần bảo trì', path: '/staff/maintenance', method: 'POST', idempotent: true, description: 'Dùng mã dữ liệu kho do quản lý cung cấp. Chỉ báo thủ công cho kho đang sẵn sàng; kho đang thuê báo qua hỗ trợ.', fields: [{ name: 'storageUnitId', title: 'Mã dữ liệu kho', required: true, maxLength: 100 }, choice('category', 'Hạng mục', ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'], 'UNIT_DAMAGE'), choice('priority', 'Ưu tiên', ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM'), note('description', 'Mô tả tình trạng', true, 4000), confirmation()] };
}
export function customerSupportAction(reservationId: string, context: { contractId?: string; unitId?: string; invoiceId?: string; transfer?: boolean; operational?: boolean } = {}): FormAction {
  const operational = context.operational ?? !context.invoiceId;
  return { title: context.transfer ? 'Yêu cầu chuyển kho' : 'Gửi yêu cầu hỗ trợ', path: '/customer/support-requests', method: 'POST', idempotent: true, description: context.transfer ? 'Yêu cầu chuyển kho của bạn sẽ được NestBox xem xét. Vui lòng chờ xác nhận kho mới trước khi chuyển hàng.' : 'Thông tin được gửi đến NestBox để tiếp nhận và phân công.', fields: [choice('category', 'Loại hỗ trợ', operational ? ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'STORED_ITEM_CONCERN', 'OTHER'] : ['PAYMENT_SUPPORT', 'OTHER'], context.transfer ? 'UNIT_ISSUE' : operational ? 'OTHER' : 'PAYMENT_SUPPORT'), { name: 'subject', title: 'Tiêu đề', required: true, minLength: 3, maxLength: 200, ...(context.transfer ? { initial: 'Yêu cầu chuyển kho', fixed: true } : {}) }, note('description', 'Mô tả yêu cầu', true, 4000), confirmation()], transform: input => ({ ...input, reservationId, rentalContractId: context.contractId, storageUnitId: context.unitId, invoiceId: context.invoiceId }) };
}
export function customerRentalActions(row: Row, returns: Row[], now: number, requests: Row[] = []): FormAction[] {
  const reservationId = text(row, 'reservationId'), actions: FormAction[] = [];
  if (!reservationId) return actions;
  if (!row.pendingRenewal) {
    if (text(row, 'historicalPricing.billingMode') === 'MONTHLY') actions.push({ title: 'Yêu cầu gia hạn', path: '/customer/renewals', method: 'POST', idempotent: true, description: `Hạn hiện tại ${formatDate(text(row, 'effectiveEndDate'))} (không bao gồm). Yêu cầu hợp lệ được duyệt tự động; thanh toán hóa đơn kích hoạt để cập nhật thời hạn; không thu cọc lần nữa.`, fields: [choice('termMonths', 'Số tháng gia hạn', ['1', '3', '6', '12'], '1'), choice('paymentPlan', 'Kế hoạch thanh toán', ['PAY_MONTHLY', 'PREPAID'], 'PAY_MONTHLY'), confirmation()], transform: input => ({ ...input, reservationId, termMonths: Number(input.termMonths) }) });
    const activeReturn = returns.some(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED');
    const approved = requests.some(item => text(item, 'reservation.id') === reservationId && isCurrentEarlyReturnApproval(item, text(row, 'effectiveEndDate')));
    if ((Date.parse(text(row, 'effectiveEndDate')) <= now || approved) && !activeReturn) actions.push({ title: 'Yêu cầu trả kho', path: '/customer/returns', method: 'POST', idempotent: true, fields: [note(), confirmation('Tôi xác nhận muốn trả toàn bộ kho của yêu cầu này')], transform: input => ({ ...input, reservationId }), description: 'Kho đã đến hạn hoặc được quản lý chấp thuận trả sớm. Nhân viên kiểm tra và nhận kho thực tế; cọc quyết toán riêng.' });
  }
  const hasActiveReturn = returns.some(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED');
  const hasProposal = requests.some(item => isEarlyReturnRequest(item) && text(item, 'reservation.id') === reservationId && (item.status !== 'RESOLVED' || isCurrentEarlyReturnApproval(item, text(row, 'effectiveEndDate'))));
  if (!row.pendingRenewal && !hasActiveReturn && !hasProposal && Date.parse(text(row, 'effectiveEndDate')) > now) actions.push({ title: 'Đề nghị trả trước hạn', path: '/customer/support-requests', method: 'POST', idempotent: true, description: 'Quản lý xem xét công nợ và điều kiện trước khi cho phép trả sớm. Bước đề nghị không tự hoàn tiền thuê hoặc cọc.', fields: [note('description', 'Lý do trả trước hạn', true, 3000), confirmation()], transform: input => ({ ...input, reservationId, category: 'OTHER', subject: EARLY_RETURN_SUBJECT }) });
  actions.push(customerSupportAction(reservationId));
  for (const contract of rows(row.contracts)) {
    const action = customerSupportAction(reservationId, { transfer: true, contractId: idOf(contract), unitId: text(contract, 'unit.id') });
    action.title = `Yêu cầu chuyển kho ${text(contract, 'unit.unitCode')}`;
    action.description = `Kho ${text(contract, 'unit.unitCode')} · ${text(contract, 'contractCode')}. ` + action.description;
    actions.push(action);
  }
  return actions;
}
export function customerAppointmentAction(contract: Row, contracts: Row[], appointments: Row[], now: number): FormAction | undefined {
  const reservation = object(contract.reservation), id = text(reservation, 'id');
  const group = contracts.filter(item => text(item, 'reservation.id') === id);
  if (!id || !group.length || group.length !== reservation.quantity || group.some(item => item.status !== 'READY_FOR_HANDOVER') || appointments.some(item => text(item, 'reservation.id') === id && ['REQUESTED', 'CONFIRMED'].includes(String(item.status)))) return;
  const start = group.map(item => text(item, 'startDate')).sort().at(-1)!, end = group.map(item => text(item, 'endDate')).sort()[0];
  if (!start || !end || start >= end || Date.parse(`${end}T00:00:00+07:00`) <= now) return;
  const pickupStart = keyCollectionStartDate(start.slice(0, 10));
  return { title: 'Đặt lịch nhận kho', path: '/customer/appointments', method: 'POST', idempotent: true, description: `Giờ cơ sở UTC+7. Từ ${formatDate(pickupStart)} đến trước ${formatDate(end)}. Lịch hợp lệ được xác nhận tự động; chỉ sử dụng kho từ ${formatDate(start)}; nhập ngày giờ dạng YYYY-MM-DD HH:mm, ví dụ ${start} 10:00.`, fields: [{ name: 'scheduledAt', title: 'Ngày giờ nhận kho (YYYY-MM-DD HH:mm)', required: true, maxLength: 16, minLength: 16 }, note(), confirmation()], validateValues: input => {
    const value = String(input.scheduledAt ?? '');
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(value)) return 'Nhập ngày giờ theo dạng YYYY-MM-DD HH:mm.';
    const instant = Date.parse(`${value.replace(' ', 'T')}+07:00`), normalized = new Date(instant + 25200000);
    if (!Number.isFinite(instant) || normalized.toISOString().slice(0, 16) !== value.replace(' ', 'T')) return 'Ngày giờ không hợp lệ.';
    if (instant <= Date.now()) return 'Lịch hẹn phải ở tương lai.';
    if (value.slice(0, 10) < pickupStart || value.slice(0, 10) >= end) return 'Chỉ đặt sớm tối đa 3 ngày trước kỳ thuê và trước ngày kết thúc.';
  }, transform: input => ({ ...input, reservationId: id, scheduledAt: new Date(`${String(input.scheduledAt).replace(' ', 'T')}+07:00`).toISOString() }) };
}
