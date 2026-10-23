import { idOf, object, options, rows, text, type Row } from '@/operations/model';
import type { FormAction, FormField } from '@/operations/form';
import { formatDate } from '@/utils/format';

const confirmation = (title = 'Tôi xác nhận thông tin và thao tác này'): FormField => ({ name: '_confirmed', title, checkbox: true, required: true, clientOnly: true });
const note = (name = 'note', title = 'Ghi chú', required = false, limit = 2000): FormField => ({ name, title, required, multiline: true, maxLength: limit, ...(required ? { minLength: 3 } : {}) });
const choice = (name: string, title: string, values: string[], initial?: string): FormField => ({ name, title, choices: options(values), required: true, initial });
const issues = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
export function handoverWindowIssue(row: Row, now: number) {
  const today = new Date(now + 25200000).toISOString().slice(0, 10);
  return rows(row.allocatedUnits).some(item => (text(item, 'contractStartDate') && today < text(item, 'contractStartDate')) || (text(item, 'contractEndDate') && today >= text(item, 'contractEndDate')));
}
export function staffRecordActions(resource: string, row: Row, userId: string, now: number): FormAction[] {
  const root = `/staff/${resource}/${encodeURIComponent(idOf(row))}`, result: FormAction[] = [];
  const add = (title: string, suffix: string, fields: FormField[] = [], idempotent = false, description?: string) => result.push({ title, path: root + suffix, method: 'POST', fields: [...fields, confirmation()], idempotent, description });
  const assigned = Boolean(userId) && text(row, 'assignedStaff.id') === userId;
  if (resource === 'appointments' && row.status === 'CONFIRMED' && typeof row.scheduledAt === 'string' && Number.isFinite(Date.parse(row.scheduledAt)) && Date.parse(row.scheduledAt) <= now && !handoverWindowIssue(row, now)) {
    add('Hoàn tất bàn giao', '/complete-handover', [note('note', 'Ghi chú bàn giao')], false, 'Chỉ xác nhận sau khi đã bàn giao thực tế đầy đủ mọi kho trong lịch hẹn.');
    result[result.length - 1].validate = () => handoverWindowIssue(row, Date.now()) || Date.parse(String(row.scheduledAt)) > Date.now() ? 'Thời điểm bàn giao nằm ngoài kỳ thuê hoặc chưa đến giờ hẹn. Tải lại hồ sơ.' : undefined;
  }
  if (resource === 'maintenance' && assigned) {
    if (row.status === 'OPEN') add('Bắt đầu bảo trì', '/start', [], true);
    if (row.status === 'IN_PROGRESS') add('Gửi kết quả để nghiệm thu', '/complete-work', [note('workNote', 'Kết quả sửa chữa', true, 4000)], true, 'Kho vẫn bảo trì cho đến khi Manager nghiệm thu.');
  }
  if (resource === 'support-requests' && assigned) {
    if (row.status === 'ASSIGNED') add('Bắt đầu hỗ trợ', '/start', [], true);
    if (row.status === 'IN_PROGRESS') {
      add('Hoàn tất hỗ trợ', '/resolve', [choice('resolutionType', 'Kết quả hỗ trợ', ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'], 'ON_SITE_RESOLVED'), note('resolutionNote', 'Nội dung xử lý', true, 4000)], true);
      add('Chuyển quản lý xem xét', '/escalate', [note('reason', 'Lý do chuyển quản lý', true, 4000)], true);
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
        result.push({ title: `Ghi nhận vấn đề kho ${unit}`, path: base, method: 'PATCH', fields: [choice('issueType', 'Phân loại vấn đề', issues, text(inspection, 'issueType') || undefined), note('issueNote', 'Mô tả vấn đề', true), note('conditionNote', 'Hiện trạng kho'), confirmation('Tôi đã kiểm tra kho thực tế')], transform: input => ({ ...input, result: 'ISSUE_FOUND' }), description: 'Chỉ ghi hiện trạng; Manager xác định trách nhiệm và phí.' });
      }
      if (inspections.length && inspections.every(item => ['PASS', 'ISSUE_FOUND'].includes(String(item.result)) && (item.result !== 'ISSUE_FOUND' || item.issueType))) add('Hoàn tất nhận kho trả', '/finalize', [], false, 'Đã nhận lại toàn bộ kho thực tế và ghi đủ kết quả kiểm tra. Tiền cọc được quyết toán riêng.');
    }
  }
  return result;
}
export function staffMaintenanceCreate(): FormAction {
  return { title: 'Báo tình trạng cần bảo trì', path: '/staff/maintenance', method: 'POST', idempotent: true, description: 'Dùng mã dữ liệu kho do Manager cung cấp. Chỉ báo thủ công cho kho đang sẵn sàng; kho đang thuê báo qua hỗ trợ.', fields: [{ name: 'storageUnitId', title: 'Mã dữ liệu kho', required: true, maxLength: 100 }, choice('category', 'Hạng mục', ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'], 'UNIT_DAMAGE'), choice('priority', 'Ưu tiên', ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM'), note('description', 'Mô tả tình trạng', true, 4000), confirmation()] };
}
export function customerSupportAction(reservationId: string, context: { contractId?: string; invoiceId?: string; transfer?: boolean; operational?: boolean } = {}): FormAction {
  const operational = context.operational ?? !context.invoiceId;
  return { title: context.transfer ? 'Yêu cầu chuyển kho qua hỗ trợ' : 'Gửi yêu cầu hỗ trợ', path: '/customer/support-requests', method: 'POST', idempotent: true, description: context.transfer ? 'WDP kiểm tra yêu cầu; Manager chọn kho đích và Staff thực hiện. Bạn không tự đổi kho trực tiếp.' : 'Thông tin được gửi đến WDP để tiếp nhận và phân công.', fields: [choice('category', 'Loại hỗ trợ', operational ? ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'STORED_ITEM_CONCERN', 'OTHER'] : ['PAYMENT_SUPPORT', 'OTHER'], context.transfer ? 'UNIT_ISSUE' : operational ? 'OTHER' : 'PAYMENT_SUPPORT'), { name: 'subject', title: 'Tiêu đề', required: true, minLength: 3, maxLength: 200, ...(context.transfer ? { initial: 'Yêu cầu chuyển kho' } : {}) }, note('description', 'Mô tả yêu cầu', true, 4000), confirmation()], transform: input => ({ ...input, reservationId, rentalContractId: context.contractId, invoiceId: context.invoiceId }) };
}
export function customerRentalActions(row: Row, returns: Row[], now: number): FormAction[] {
  const reservationId = text(row, 'reservationId'), actions: FormAction[] = [];
  if (!reservationId) return actions;
  if (!row.pendingRenewal) {
    if (text(row, 'historicalPricing.billingMode') === 'MONTHLY') actions.push({ title: 'Yêu cầu gia hạn', path: '/customer/renewals', method: 'POST', idempotent: true, description: `Hạn hiện tại ${formatDate(text(row, 'effectiveEndDate'))} (không bao gồm). Gia hạn có hiệu lực sau duyệt và thanh toán hóa đơn kích hoạt; không thu cọc lần nữa.`, fields: [choice('termMonths', 'Số tháng gia hạn', ['1', '3', '6', '12'], '1'), choice('paymentPlan', 'Kế hoạch thanh toán', ['PAY_MONTHLY', 'PREPAID'], 'PAY_MONTHLY'), confirmation()], transform: input => ({ ...input, reservationId, termMonths: Number(input.termMonths) }) });
    if (Date.parse(text(row, 'effectiveEndDate')) <= now && !returns.some(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED')) actions.push({ title: 'Yêu cầu trả kho', path: '/customer/returns', method: 'POST', idempotent: true, fields: [note(), confirmation('Tôi xác nhận muốn trả toàn bộ kho của yêu cầu này')], transform: input => ({ ...input, reservationId }), description: 'Trả kho từ ngày kết thúc kỳ thuê. Staff sẽ kiểm tra thực tế; quyết toán cọc được xử lý sau.' });
  }
  actions.push(customerSupportAction(reservationId), customerSupportAction(reservationId, { transfer: true }));
  return actions;
}
export function customerAppointmentAction(contract: Row, contracts: Row[], appointments: Row[], now: number): FormAction | undefined {
  const reservation = object(contract.reservation), id = text(reservation, 'id');
  const group = contracts.filter(item => text(item, 'reservation.id') === id);
  if (!id || !group.length || group.length !== reservation.quantity || group.some(item => item.status !== 'READY_FOR_HANDOVER') || appointments.some(item => text(item, 'reservation.id') === id && ['REQUESTED', 'CONFIRMED'].includes(String(item.status)))) return;
  const start = group.map(item => text(item, 'startDate')).sort().at(-1)!, end = group.map(item => text(item, 'endDate')).sort()[0];
  if (!start || !end || start >= end || Date.parse(`${end}T00:00:00+07:00`) <= now) return;
  return { title: 'Yêu cầu lịch bàn giao', path: '/customer/appointments', method: 'POST', idempotent: true, description: `Giờ cơ sở UTC+7. Từ ${formatDate(start)} đến trước ${formatDate(end)}; nhập ngày giờ dạng YYYY-MM-DD HH:mm, ví dụ ${start} 10:00.`, fields: [{ name: 'scheduledAt', title: 'Ngày giờ nhận kho (YYYY-MM-DD HH:mm)', required: true, maxLength: 16, minLength: 16 }, note(), confirmation()], validateValues: input => {
    const value = String(input.scheduledAt ?? '');
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(value)) return 'Nhập ngày giờ theo dạng YYYY-MM-DD HH:mm.';
    const instant = Date.parse(`${value.replace(' ', 'T')}+07:00`), normalized = new Date(instant + 25200000);
    if (!Number.isFinite(instant) || normalized.toISOString().slice(0, 16) !== value.replace(' ', 'T')) return 'Ngày giờ không hợp lệ.';
    if (instant <= Date.now()) return 'Lịch hẹn phải ở tương lai.';
    if (value.slice(0, 10) < start || value.slice(0, 10) >= end) return 'Ngày bàn giao phải nằm trong kỳ thuê, không bao gồm ngày kết thúc.';
  }, transform: input => ({ ...input, reservationId: id, scheduledAt: new Date(`${String(input.scheduledAt).replace(' ', 'T')}+07:00`).toISOString() }) };
}
