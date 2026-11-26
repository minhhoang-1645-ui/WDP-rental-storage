import { isTransferRequest } from '../utils/transfer-request';
import { EARLY_RETURN_SUBJECT, isEarlyReturnRequest, isCurrentEarlyReturnApproval } from '@/utils/early-return';
import { idOf, object, options, rows, text, type Row } from '@/operations/model';
import type { FormAction, FormField } from '@/operations/form';
import { formatDate } from '@/utils/format';
import { keyCollectionStartDate } from '@/utils/handover';
import { vietnamCalendarDate } from '@/utils/calendar-date';

const confirmation = (title = 'Tôi xác nhận thông tin và thao tác này'): FormField => ({ name: '_confirmed', title, checkbox: true, required: true, clientOnly: true });
const note = (name = 'note', title = 'Ghi chú', required = false, limit = 2000): FormField => ({ name, title, required, multiline: true, maxLength: limit, ...(required ? { minLength: 3 } : {}) });
const choice = (name: string, title: string, values: string[], initial?: string): FormField => ({ name, title, choices: options(values), required: true, initial });
const issues = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
/** Balance carried by the existing invoices. Early return closeout has its own estimate. */
export function returnSettlementAmount(row: Row) {
  const value = text(row, 'returnReadiness.totalOutstanding', 'paymentDetails.totalOutstanding', 'billingSummary.totalOutstanding');
  const amount = value.trim() ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
}
export function returnSettlementReady(row: Row) {
  const readiness = object(row.returnReadiness);
  if (readiness.requiresFullSettlement === false) return readiness.canReturn === true;
  return readiness.canReturn !== false && returnSettlementAmount(row) === 0;
}
export function handoverWindowIssue(row: Row, now: number) {
  const today = new Date(now + 25200000).toISOString().slice(0, 10);
  return rows(row.allocatedUnits).some(item => (text(item, 'contractStartDate') && today < keyCollectionStartDate(text(item, 'contractStartDate'))) || (text(item, 'contractEndDate') && today >= text(item, 'contractEndDate')));
}
export function staffRecordActions(resource: string, row: Row, userId: string, now: number): FormAction[] {
  const root = `/staff/${resource}/${encodeURIComponent(idOf(row))}`, result: FormAction[] = [];
  const add = (title: string, suffix: string, fields: FormField[] = [], idempotent = false, description?: string) => result.push({ title, path: root + suffix, method: 'POST', fields: [...fields, confirmation()], idempotent, description });
  const assigned = Boolean(userId) && text(row, 'assignedStaff.id') === userId;
  if (resource === 'appointments' && assigned && row.canRecordCancellationRecovery === true) {
    result.push({ title: 'Xác nhận thu hồi khi khách hủy đặt kho', method: 'POST',
      path: '/reservations/' + encodeURIComponent(text(row, 'reservation.id')) + '/paid-cancellation',
      fields: [note('note', 'Biên bản hoặc căn cứ kiểm tra', true, 500),
        ...([['neverUsed', 'Đã xác minh kho chưa từng sử dụng'], ['unitEmpty', 'Đã kiểm tra kho trống'],
          ['accessRevoked', 'Đã thu hồi toàn bộ chìa khóa, thẻ và quyền truy cập'], ['equipmentReturned', 'Đã kiểm tra thiết bị đã được thu hồi hoặc chưa giao']] as const)
          .map(([name, title]) => ({ name, title, checkbox: true, required: true }))],
      transform: input => ({ ...input, action: 'RECOVER' }),
    });
  }
  if (resource === 'appointments' && assigned && row.cancellationPending !== true && row.status === 'CONFIRMED' && typeof row.scheduledAt === 'string' && Number.isFinite(Date.parse(row.scheduledAt)) && Date.parse(row.scheduledAt) <= now && !handoverWindowIssue(row, now)) {
    add('Hoàn tất bàn giao', '/complete-handover', [
      { name: 'recipientType', title: 'Người nhận bàn giao', required: true, initial: 'CUSTOMER', choices: [{ value: 'CUSTOMER', label: `Khách đứng tên: ${text(row, 'reservation.customer.fullName')}` }, { value: 'AUTHORIZED', label: 'Người được ủy quyền' }] },
      { name: 'recipientName', title: 'Tên người được ủy quyền', required: true, minLength: 2, maxLength: 120, visibleWhen: values => values.recipientType === 'AUTHORIZED' },
      { name: 'authorizationBasis', title: 'Căn cứ ủy quyền đã đối chiếu', required: true, minLength: 3, maxLength: 500, multiline: true, visibleWhen: values => values.recipientType === 'AUTHORIZED' },
      note('condition', 'Hiện trạng cửa, khóa, tường, sàn và thiết bị', true, 500),
      { name: 'accessItemCount', title: 'Số chìa khóa/thẻ đã giao', required: true, numeric: true, minimum: 0, maximum: 50 },
      { name: 'identityVerified', title: 'Đã đối chiếu người nhận kho', checkbox: true, required: true },
      { name: 'unitInspected', title: 'Đã kiểm tra đúng mã kho và hiện trạng từng kho', checkbox: true, required: true },
      { name: 'accessDelivered', title: 'Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập', checkbox: true, required: true },
      { name: 'documentsDelivered', title: 'Đã giao giấy tờ cho khách', checkbox: true, required: true },
      note('note', 'Ghi chú bàn giao', false, 1000),
    ], false, 'Chỉ xác nhận sau khi đã bàn giao thực tế đầy đủ mọi kho trong lịch hẹn.');
    result[result.length - 1].transform = input => ({ note: input.note, handoverReport: { recipientType: input.recipientType, recipientName: input.recipientType === 'AUTHORIZED' ? input.recipientName : text(row, 'reservation.customer.fullName'), authorizationBasis: input.authorizationBasis, condition: input.condition, accessItemCount: input.accessItemCount, identityVerified: input.identityVerified, unitInspected: input.unitInspected, accessDelivered: input.accessDelivered, documentsDelivered: input.documentsDelivered } });
    result[result.length - 1].validate = () => handoverWindowIssue(row, Date.now()) || Date.parse(String(row.scheduledAt)) > Date.now() ? 'Thời điểm bàn giao nằm ngoài kỳ thuê hoặc chưa đến giờ hẹn. Tải lại hồ sơ.' : undefined;
  }
  if (resource === 'maintenance' && assigned) {
    if (row.status === 'OPEN') add('Bắt đầu bảo trì', '/start', [], true);
    if (row.status === 'IN_PROGRESS') add('Gửi kết quả để nghiệm thu', '/complete-work', [note('workNote', 'Kết quả sửa chữa', true, 4000)], true, 'Kho vẫn bảo trì cho đến khi quản lý nghiệm thu.');
  }
  if (resource === 'support-requests' && !isEarlyReturnRequest(row) && !isTransferRequest(row) && assigned) {
    if (row.status === 'ASSIGNED') add('Bắt đầu hỗ trợ', '/start', [], true);
    if (row.status === 'IN_PROGRESS') {
      add('Hoàn tất hỗ trợ', '/resolve', [choice('resolutionType', 'Kết quả hỗ trợ', ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'], 'ON_SITE_RESOLVED'), note('resolutionNote', 'Nội dung xử lý', true, 4000)], true);
      add('Chuyển bộ phận phụ trách xem xét', '/escalate', [note('reason', 'Lý do chuyển bộ phận phụ trách', true, 4000)], true);
    }
  }
  if (resource === 'transfers' && row.status === 'APPROVED') add('Hoàn tất chuyển kho', '/complete', [
    { name: 'recipientName', title: 'Người nhận kho mới', required: true, minLength: 2, maxLength: 120 },
    { name: 'returnedKeyCount', title: 'Số chìa khóa/thẻ kho cũ đã thu', required: true, numeric: true, minimum: 0, maximum: 50 },
    { name: 'deliveredKeyCount', title: 'Số chìa khóa/thẻ kho mới đã giao', required: true, numeric: true, minimum: 0, maximum: 50 },
    { name: 'destinationReady', title: 'Đã kiểm tra kho đích và xác nhận sẵn sàng', checkbox: true, required: true },
    { name: 'goodsMoved', title: 'Đã kiểm tra kho cũ và xác nhận kho trống', checkbox: true, required: true },
    { name: 'oldKeysReturned', title: 'Đã thu chìa khóa/thẻ hoặc thu hồi mã truy cập kho cũ', checkbox: true, required: true },
    { name: 'newKeysDelivered', title: 'Đã giao chìa khóa/thẻ hoặc cấp mã truy cập kho mới', checkbox: true, required: true },
    note('note', 'Ghi chú bàn giao; nếu không có chìa khóa vật lý, ghi cách thu hồi/cấp mã truy cập'),
  ], false, 'Đối chiếu kho nguồn, kho đích và hợp đồng. Chỉ xác nhận sau khi đã chuyển hàng và đổi chìa khóa thực tế.');
  if (resource === 'returns') {
    if (!assigned) return result;
    if (row.status === 'REQUESTED') add('Bắt đầu kiểm tra', '/start-inspection');
    if (['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(String(row.status))) {
      const inspections = rows(row.inspections);
      for (const inspection of inspections) {
        const unit = text(inspection, 'unit.unitCode', 'storageUnit.unitCode');
        const base = `${root}/inspections/${encodeURIComponent(idOf(inspection))}`;
        if (inspection.result !== 'ISSUE_FOUND') result.push({ title: `Ghi nhận kho ${unit} đạt`, path: base, method: 'PATCH', fields: [note('conditionNote', 'Hiện trạng kho'), confirmation('Tôi đã kiểm tra kho thực tế')], transform: input => ({ ...input, result: 'PASS' }) });
        result.push({ title: `Ghi nhận vấn đề kho ${unit}`, path: base, method: 'PATCH', fields: [choice('issueType', 'Phân loại vấn đề', issues, text(inspection, 'issueType') || undefined), note('issueNote', 'Mô tả vấn đề', true), note('conditionNote', 'Hiện trạng kho'), confirmation('Tôi đã kiểm tra kho thực tế')], transform: input => ({ ...input, result: 'ISSUE_FOUND' }), description: 'Chỉ ghi hiện trạng; quản lý xác định trách nhiệm và phí.' });
      }
      if (object(row.returnReadiness).canReturn === true && inspections.length && inspections.every(item => ['PASS', 'ISSUE_FOUND'].includes(String(item.result)) && (item.result !== 'ISSUE_FOUND' || item.issueType))) {
        result.push({ title: 'Hoàn tất nhận kho trả', path: root + '/finalize', method: 'POST',
          fields: [
            { name: 'unitsEmpty', title: 'Đã kiểm tra và xác nhận kho đã dọn trống', checkbox: true, required: true },
            { name: 'accessRevoked', title: 'Đã thu hồi chìa khóa, thẻ hoặc quyền truy cập', checkbox: true, required: true },
            ...(row.servicesConfirmationRequired === true ? [{ name: 'servicesReturned', title: 'Đã thu hồi thiết bị và đối chiếu dịch vụ', checkbox: true, required: true }] : []),
            ...(row.overdueReturnDateRequired === true ? [
              { name: 'physicalReturnDate', title: 'Ngày nhận kho thực tế (YYYY-MM-DD)', required: true },
              note('physicalReturnEvidence', 'Căn cứ nếu nhận kho vào ngày trước', false, 500),
            ] : []),
          ] });
      }
    }
  }
  return result;
}
export function staffMaintenanceCreate(): FormAction {
  return { title: 'Báo tình trạng cần bảo trì', path: '/staff/maintenance', method: 'POST', idempotent: true, description: 'Dùng mã dữ liệu kho do quản lý cung cấp. Chỉ báo thủ công cho kho đang sẵn sàng; kho đang thuê báo qua hỗ trợ.', fields: [{ name: 'storageUnitId', title: 'Mã dữ liệu kho', required: true, maxLength: 100 }, choice('category', 'Hạng mục', ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'], 'UNIT_DAMAGE'), choice('priority', 'Ưu tiên', ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM'), note('description', 'Mô tả tình trạng', true, 4000), confirmation()] };
}
export function customerSupportAction(reservationId: string, context: { contractId?: string; unitId?: string; invoiceId?: string; transfer?: boolean; operational?: boolean } = {}): FormAction {
  const operational = context.operational ?? !context.invoiceId;
  return { title: context.transfer ? 'Yêu cầu chuyển kho' : 'Gửi yêu cầu hỗ trợ', path: '/customer/support-requests', method: 'POST', idempotent: true, description: context.transfer ? 'Yêu cầu chuyển kho của bạn sẽ được NestBox xem xét. Chỉ chuyển hàng sau khi NestBox xác nhận kho mới.' : 'Mô tả vấn đề để NestBox hỗ trợ bạn.', fields: [choice('category', 'Loại hỗ trợ', operational ? ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'STORED_ITEM_CONCERN', 'OTHER'] : ['PAYMENT_SUPPORT', 'OTHER'], context.transfer ? 'UNIT_ISSUE' : operational ? 'OTHER' : 'PAYMENT_SUPPORT'), { name: 'subject', title: 'Bạn cần hỗ trợ gì?', required: true, minLength: 3, maxLength: 200, ...(context.transfer ? { initial: 'Yêu cầu chuyển kho', fixed: true } : {}) }, note('description', 'Chi tiết vấn đề', true, 4000), confirmation()], transform: input => ({ ...input, reservationId, rentalContractId: context.contractId, storageUnitId: context.unitId, invoiceId: context.invoiceId }) };
}
export function customerRentalActions(row: Row, returns: Row[], now: number, requests: Row[] = [], selectedContractId?: string): FormAction[] {
  const reservationId = text(row, 'reservationId'), actions: FormAction[] = [];
  if (!reservationId) return actions;
  const contracts = rows(row.contracts);
  const pendingReturns = returns.filter(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED');
  for (const contract of contracts) {
    const rentalContractId = idOf(contract);
    if ((!('pendingRenewal' in contract) && row.pendingRenewal) || contract.pendingRenewal || contract.returnInProgress
      || selectedContractId && rentalContractId !== selectedContractId || text(contract, 'unit.status') !== 'OCCUPIED') continue;
    if (pendingReturns.some(item => rows(item.inspections).some(inspection => text(inspection, 'contract.id') === rentalContractId))) continue;
    const endDate = text(contract, 'endDate');
    const pendingOrApproved = requests.filter(item => isEarlyReturnRequest(item) && text(item, 'reservation.id') === reservationId
      && (!text(item, 'contract.id') || text(item, 'contract.id') === rentalContractId));
    const approved = text(contract, 'returnReadiness.policy') === 'PERIOD_CLOSEOUT_V1' || pendingOrApproved.some(item => isCurrentEarlyReturnApproval(item, endDate));
    const unit = text(contract, 'unit.unitCode');
    if (text(row, 'historicalPricing.billingMode') === 'MONTHLY') {
      actions.push({ title: `Gia hạn kho ${unit}`, renewal: { name: text(contract, 'unit.storageType.name') || text(row, 'storageType.name'), endDate, quantity: '1' }, path: '/customer/renewals', method: 'POST', idempotent: true,
        description: `Hợp đồng ${text(contract, 'contractCode')} · Hạn hiện tại ${formatDate(endDate)}. Ký phụ lục và thanh toán kỳ đầu để cập nhật thời hạn.`,
        fields: [choice('termMonths', 'Số tháng gia hạn', ['1', '3', '6', '12'], '3'), choice('paymentPlan', 'Kế hoạch thanh toán', ['PAY_MONTHLY', 'PREPAID'], 'PREPAID'), confirmation()],
        transform: input => ({ ...input, reservationId, rentalContractId, termMonths: Number(input.termMonths) }) });
    }
    const otherUnits = contracts.filter(item => idOf(item) !== rentalContractId).map(item => text(item, 'unit.unitCode')).filter(Boolean);
    const scope = `Kho ${unit} · Hợp đồng ${text(contract, 'contractCode')}.${otherUnits.length ? ` Kho tiếp tục thuê: ${otherUnits.join(', ')}.` : ''}`;
    const noticeDays = typeof contract.returnNoticeDays === 'number' ? contract.returnNoticeDays : 0;
    const returnNotice = noticeDays > 0 ? ` Báo trước ${noticeDays} ngày để NestBox bố trí lịch trả kho.` : '';
    const early = endDate > vietnamCalendarDate(now);
    const legacyApproval = early && approved && text(contract, 'returnReadiness.policy') !== 'PERIOD_CLOSEOUT_V1'
      && !text(contract, 'returnReadiness.earlyReturnBlockReason');
    if (endDate && (!early || approved) && (legacyApproval || returnSettlementReady(contract))) {
      actions.push({ title: `Trả kho ${unit}`, path: '/customer/returns', method: 'POST', idempotent: true,
        fields: [note(), confirmation(`Tôi xác nhận muốn trả kho ${unit}`)], transform: input => ({ ...input, reservationId, rentalContractId }),
        description: scope + (early ? ' Quản lý đã chấp thuận trả trước hạn.' : '') + returnNotice });
    }
    if (early && !approved && !pendingOrApproved.some(item => item.status !== 'RESOLVED')) {
      actions.push({ title: `Đề nghị trả trước hạn kho ${unit}`, path: '/customer/support-requests', method: 'POST', idempotent: true,
        fields: [note('description', 'Lý do trả trước hạn', true, 3000), confirmation()],
        transform: input => ({ ...input, reservationId, rentalContractId, category: 'OTHER', subject: EARLY_RETURN_SUBJECT }),
        description: scope + ' Quản lý cần chấp thuận trước khi bạn gửi yêu cầu trả kho.' + returnNotice });
    }
  }
  actions.push(customerSupportAction(reservationId));
  for (const contract of contracts) {
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
  return { title: 'Đặt lịch nhận kho', path: '/customer/appointments', method: 'POST', idempotent: true, description: `Giờ cơ sở UTC+7. Từ ${formatDate(pickupStart)} đến trước ${formatDate(end)}. Lịch được xác nhận theo khung phục vụ. Nếu cần xem xét thêm, quản lý sẽ xác nhận. Bạn được sử dụng kho từ ${formatDate(start)}; nhập ngày giờ dạng YYYY-MM-DD HH:mm, ví dụ ${start} 10:00.`, fields: [{ name: 'scheduledAt', title: 'Ngày giờ nhận kho (YYYY-MM-DD HH:mm)', required: true, maxLength: 16, minLength: 16 }, note(), confirmation()], validateValues: input => {
    const value = String(input.scheduledAt ?? '');
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(value)) return 'Nhập ngày giờ theo dạng YYYY-MM-DD HH:mm.';
    const instant = Date.parse(`${value.replace(' ', 'T')}+07:00`), normalized = new Date(instant + 25200000);
    if (!Number.isFinite(instant) || normalized.toISOString().slice(0, 16) !== value.replace(' ', 'T')) return 'Ngày giờ không hợp lệ.';
    if (instant <= Date.now()) return 'Lịch hẹn phải ở tương lai.';
    if (value.slice(0, 10) < pickupStart || value.slice(0, 10) >= end) return 'Chỉ đặt sớm tối đa 3 ngày trước kỳ thuê và trước ngày kết thúc.';
  }, transform: input => ({ ...input, reservationId: id, scheduledAt: new Date(`${String(input.scheduledAt).replace(' ', 'T')}+07:00`).toISOString() }) };
}

export function customerAppointmentReschedule(row: Row, now: number): FormAction | undefined {
  const id = idOf(row), expectedScheduledAt = text(row, 'scheduledAt');
  if (!id || !['REQUESTED', 'CONFIRMED'].includes(String(row.status)) || !(Date.parse(expectedScheduledAt) > now)) return;
  const timestamp = (value: unknown) => String(value ?? '').replace(' ', 'T');
  return {
    title: 'Đổi lịch nhận kho', method: 'PATCH', path: '/customer/appointments/' + encodeURIComponent(id) + '/reschedule',
    description: 'Giờ Việt Nam (UTC+7). Lịch hiện tại được giữ nếu khung giờ mới không còn chỗ.',
    fields: [{ name: 'scheduledAt', title: 'Giờ hẹn mới (YYYY-MM-DD HH:mm)', minLength: 16, maxLength: 16, required: true }],
    validateValues(input) {
      const value = timestamp(input.scheduledAt), instant = Date.parse(value + '+07:00');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(instant)
        || new Date(instant + 25200000).toISOString().slice(0, 16) !== value || instant <= Date.now()) {
        return 'Nhập ngày giờ hợp lệ trong tương lai theo định dạng YYYY-MM-DD HH:mm.';
      }
    },
    transform: input => ({ scheduledAt: timestamp(input.scheduledAt) + '+07:00', expectedScheduledAt }),
  };
}
