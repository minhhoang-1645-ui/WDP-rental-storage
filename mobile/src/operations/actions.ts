import { isEarlyReturnRequest } from '@/utils/early-return';
import { canAccessManagerReview } from '@/utils/manager-review-access';
import { idOf, label, options, rows, text, type Row } from './model';
import type { FormAction, FormField } from './form';
import { firstIssue as renewalReviewIssue } from './renewal-validation';
import { isFixtureUnit, isFixtureStaff } from '@/utils/staff-fixture';

const note = (name = 'note', title = 'Ghi chú', required = false, maxLength = 4000): FormField => ({ name, title, required, multiline: true, maxLength, ...(required ? { minLength: 3 } : {}) });
const select = (name: string, title: string, values: string[], initial?: string): FormField => ({ name, title, required: true, choices: options(values), initial });
const confirm = (title = 'Tôi xác nhận thực hiện thao tác này'): FormField => ({ name: '_confirmed', title, checkbox: true, required: true, clientOnly: true });
const priorities = ['LOW', 'MEDIUM', 'HIGH'];
const issueTypes = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
const serviceFields = (item?: Row): FormField[] => [
  { name: 'code', title: 'Mã dịch vụ', required: true, minLength: 2, maxLength: 50, initial: text(item ?? {}, 'code') },
  { name: 'name', title: 'Tên dịch vụ', required: true, minLength: 2, maxLength: 120, initial: text(item ?? {}, 'name') },
  { ...note('description', 'Mô tả', false, 1000), initial: text(item ?? {}, 'description') },
  { ...select('kind', 'Loại dịch vụ', ['PURCHASE', 'RENTAL'], text(item ?? {}, 'kind') || 'PURCHASE'), fixed: Boolean(item) },
  select('billingUnit', 'Đơn vị tính', ['ONE_TIME', 'DAY', 'MONTH'], text(item ?? {}, 'billingUnit') || 'ONE_TIME'),
  { name: 'unitPrice', title: 'Giá được duyệt (VND)', numeric: true, minimum: 1, required: true, initial: text(item ?? {}, 'unitPrice') },
  { name: 'imageUrl', title: 'URL ảnh dịch vụ (tùy chọn)', maxLength: 2000, initial: text(item ?? {}, 'imageUrl') },
  { name: 'imageAlt', title: 'Mô tả ảnh', maxLength: 300, initial: text(item ?? {}, 'imageAlt') },
  { name: 'isActive', title: 'Đang hoạt động', checkbox: true, initial: String(item?.isActive ?? true) },
];
function serviceValidation(input: Row) {
  if (!/^[A-Za-z0-9_]{2,50}$/.test(String(input.code))) return 'Mã dịch vụ chỉ gồm chữ, số và dấu gạch dưới.';
  if (input.kind === 'PURCHASE' ? input.billingUnit !== 'ONE_TIME' : !['DAY', 'MONTH'].includes(String(input.billingUnit))) return 'Dịch vụ mua dùng Một lần; dịch vụ thuê dùng Ngày hoặc Tháng.';
}
export function assignmentAction(resource: string, row: Row): FormAction {
  return { title: 'Phân công nhân viên', path: `/manager/${resource}/${encodeURIComponent(idOf(row))}/assign`, method: 'PATCH', idempotent: resource !== 'stock-movements', description: `${text(row, 'customer.fullName', 'reservation.customer.fullName')} · ${text(row, 'customer.phone', 'reservation.customer.phone')} · Kho ${text(row, 'unit.unitCode', 'storageUnit.unitCode')} · ${text(row, 'contract.contractCode', 'rentalContract.contractCode')}`, fields: [
    { name: 'staffUserId', title: 'Nhân viên phụ trách', required: true, optionsPath: '/manager/staff', optionsAccept: item => !isFixtureStaff(item), initial: text(row, 'assignedStaff.id'), optionLabel: item => `${text(item, 'fullName')} · ${text(item, 'email')}` }, confirm(),
  ] };
}

export function createAction(resource: string): FormAction | undefined {
  if (resource === 'additional-services') return { title: 'Tạo dịch vụ bổ sung', path: '/manager/additional-services', method: 'POST', fields: serviceFields(), validate: serviceValidation, transform: input => ({ ...input, description: input.description ?? null, imageUrl: input.imageUrl ?? null, imageAlt: input.imageAlt ?? null }) };
  if (resource === 'maintenance') return { title: 'Tạo yêu cầu bảo trì', path: '/manager/maintenance', method: 'POST', idempotent: true, description: 'Chọn kho trống cần sửa chữa. Kho đang có khách sử dụng cần báo sự cố và sắp xếp chuyển kho trước; kho đó chưa nằm trong danh sách này.', fields: [
    { name: 'storageUnitId', title: 'Kho cần bảo trì', required: true, optionsPath: '/manager/units?status=AVAILABLE', optionsAccept: row => row.status === 'AVAILABLE' && !isFixtureUnit(row), optionLabel: row => `${text(row, 'unitCode', 'unitNumber')} · ${text(row, 'storageType.name')} · ${text(row, 'floor')} ${text(row, 'zone')}` },
    select('category', 'Hạng mục', ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'], 'UNIT_DAMAGE'), select('priority', 'Ưu tiên', priorities, 'MEDIUM'), note('description', 'Mô tả tình trạng', true), confirm(),
  ] };
  if (resource === 'transfers') return { title: 'Tạo yêu cầu chuyển kho', path: '/manager/transfers', method: 'POST', idempotent: true, description: 'Chỉ hợp đồng ACTIVE và kho cùng loại. Yêu cầu mới chưa thực hiện chuyển kho.', fields: [
    { name: 'rentalContractId', title: 'Hợp đồng đang hoạt động', required: true, optionsPath: '/manager/contracts?status=ACTIVE', optionsAccept: row => row.status === 'ACTIVE', optionLabel: row => `${text(row, 'contractCode')} · ${text(row, 'reservation.customer.fullName')}` },
    select('reason', 'Lý do chuyển', ['UNIT_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'OPERATIONAL_RELOCATION', 'OTHER'], 'UNIT_ISSUE'), { name: 'supportRequestId', title: 'Mã hỗ trợ liên quan (cùng yêu cầu đặt kho, tùy chọn)', maxLength: 100 }, confirm(),
  ] };
}

export function recordActions(resource: string, row: Row, role: string): FormAction[] {
  if (!canAccessManagerReview(role, resource) || resource === 'support-requests' && isEarlyReturnRequest(row)) return [];
  const root = `/manager/${resource}/${encodeURIComponent(idOf(row))}`;
  const actions: FormAction[] = [];
  const add = (title: string, suffix: string, fields: FormField[] = [], method: 'POST' | 'PATCH' = 'POST', idempotent = false, description?: string) => actions.push({ title, path: root + suffix, method, fields: [...fields, confirm()], idempotent, description });
  if (role === 'MANAGER' && resource === 'online-payment-reconciliations') {
    if (row.status === 'PENDING_REVIEW') add('Xử lý đối soát VNPay', '/resolve', [select('resolution', 'Kết quả', ['REFUND_REQUIRED', 'RECONCILED']), note('resolutionNote', 'Căn cứ đối soát', true, 2000)], 'POST', false, 'Không tự chuyển tiền hoặc kích hoạt lại đơn đã hết hiệu lực.');
    if (row.status === 'REFUND_REQUIRED') actions.push({ title: 'Ghi nhận đã hoàn tiền VNPay', path: root + '/resolve', method: 'POST', fields: [{ name: 'refundReference', title: 'Mã giao dịch hoàn tiền thực tế', required: true, minLength: 2, maxLength: 200 }, note('resolutionNote', 'Ghi chú đối soát', true, 2000), { name: 'refundConfirmed', title: 'Tôi đã hoàn tiền và đối chiếu chứng từ thực tế', checkbox: true, required: true }], transform: input => ({ ...input, resolution: 'RECONCILED' }) });
  }
  if (resource === 'reservations' && row.status === 'PENDING') add('Xử lý yêu cầu đặt kho', '/status', [select('status', 'Quyết định', ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'])], 'PATCH', false, 'Xác nhận sẽ kiểm tra toàn kỳ và phân bổ đủ số kho.');
  if (resource === 'inquiries' && row.requestType !== 'RESERVATION') add('Cập nhật liên hệ', '', [select('status', 'Trạng thái liên hệ', ['PENDING_CONTACT', 'CONTACTED', 'IN_REVIEW', 'CLOSED', 'CANCELLED'], text(row, 'status')), { ...note('internalNotes', 'Ghi chú nội bộ', false, 2000), initial: text(row, 'internalNotes') }], 'PATCH');
  if (resource === 'appointments' && row.status === 'REQUESTED') add('Xác nhận lịch bàn giao', '/confirm', [], 'PATCH');
  if (resource === 'renewals' && row.status === 'PENDING') {
    if (!renewalReviewIssue(row)) {
      add('Duyệt gia hạn', '/approve', [], 'POST', false, 'Đối chiếu khách hàng, hợp đồng, hạn cũ–mới và tổng báo giá trước khi duyệt. Hóa đơn được tạo khi duyệt; thời hạn chỉ cập nhật sau khi thanh toán đủ hóa đơn kích hoạt.');
      actions[actions.length - 1].fields[0].title = 'Tôi đã đối chiếu thông tin và báo giá gia hạn';
      actions[actions.length - 1].validate = () => renewalReviewIssue(row) || undefined;
    }
    add('Từ chối gia hạn', '/reject', [note('reason', 'Lý do từ chối', true, 2000)]);
  }
  if (resource === 'invoices' && ['OPEN', 'PARTIALLY_PAID'].includes(String(row.status)) && Number(row.balanceDue) > 0) {
    const amount = { name: 'amount', title: 'Số tiền thực nhận (VND)', numeric: true, required: true, minimum: 1, maximum: Number(row.balanceDue), initial: String(row.balanceDue) } as FormField;
    actions.push({ title: 'Ghi nhận chuyển khoản', path: root + '/payments', method: 'POST', idempotent: true, fields: [amount, { name: 'reference', title: 'Mã giao dịch ngân hàng đã đối soát', required: true, minLength: 2, maxLength: 200 }, note('note', 'Ghi chú', false, 2000)], transform: input => ({ ...input, method: 'BANK_TRANSFER' }), description: 'Chỉ ghi nhận sau khi đối soát sao kê thực nhận. Mã do Customer khai báo không phải căn cứ xác nhận.' });
    actions.push({ title: 'Ghi nhận tiền mặt', path: root + '/payments', method: 'POST', idempotent: true, fields: [amount, note('note', 'Ghi chú', false, 2000)], transform: input => ({ ...input, method: 'CASH' }), description: 'Hệ thống sẽ sinh mã phiếu thu duy nhất và lưu Manager ghi nhận từ phiên đăng nhập.' });
  }
  if (resource === 'payment-submissions' && row.status === 'PENDING_VERIFICATION') {
    if (!row.isDemo) add('Xác nhận đã nhận chuyển khoản', '/verify', [{ name: 'reference', title: 'Mã giao dịch ngân hàng đã đối chiếu', required: true, minLength: 2, maxLength: 200 }, note('note', 'Ghi chú', false, 1000)], 'POST', false, 'Chỉ xác nhận sau khi đã đối chiếu và nhận đủ khoản gửi.');
    add('Từ chối thông báo chuyển khoản', '/reject', [note('reason', 'Lý do từ chối', true, 1000)]);
  }
  if (role === 'MANAGER' && ['maintenance', 'support-requests'].includes(resource) && !['COMPLETED', 'RESOLVED'].includes(String(row.status))) {
    add('Đổi mức ưu tiên', '/priority', [select('priority', 'Ưu tiên', priorities, text(row, 'priority'))], 'PATCH', true);
  }
  if (role === 'MANAGER' && resource === 'maintenance' && row.status === 'AWAITING_VERIFICATION') {
    add('Nghiệm thu bảo trì', '/verify', [note()], 'POST', true, 'Xác nhận sửa chữa thực tế; Kho trở lại trạng thái sẵn sàng sau nghiệm thu.');
    add('Yêu cầu sửa lại', '/reject-verification', [note('note', 'Yêu cầu sửa lại', true)], 'POST', true);
  }
  if (role === 'MANAGER' && resource === 'support-requests' && row.status === 'ESCALATED') add('Giải quyết hỗ trợ', '/resolve', [select('resolutionType', 'Hướng xử lý', ['MANAGER_RESOLVED', 'TRANSFER_RECOMMENDED', 'NO_ACTION_REQUIRED', 'OTHER'], 'MANAGER_RESOLVED'), note('resolutionNote', 'Nội dung xử lý', true)], 'POST', true);
  if (resource === 'transfers' && row.status === 'REQUESTED') {
    add('Duyệt chuyển kho', '/approve', [{ name: 'toStorageUnitId', title: 'Kho đích cùng loại', required: true, optionsPath: `/manager/units?status=AVAILABLE&storageType=${encodeURIComponent(text(row, 'fromUnit.storageType.id'))}`, optionsAccept: item => item.status === 'AVAILABLE' && idOf(item) !== text(row, 'fromUnit.id'), optionLabel: item => `${text(item, 'unitCode')} · ${text(item, 'floor')} · ${text(item, 'zone')}` }]);
    add('Từ chối chuyển kho', '/reject');
  }
  if (resource === 'additional-services') {
    actions.push({ title: 'Chỉnh sửa dịch vụ', path: root, method: 'PATCH', fields: serviceFields(row), validate: serviceValidation, transform: input => ({ ...input, description: input.description ?? null, imageUrl: input.imageUrl ?? null, imageAlt: input.imageAlt ?? null }) });
    const purchase = row.kind === 'PURCHASE';
    add('Cập nhật tồn kho', '/inventory', [{ name: purchase ? 'stockOnHand' : 'rentalCapacity', title: purchase ? 'Tồn kho thực tế' : 'Công suất cho thuê', numeric: true, minimum: 0, required: true, initial: text(row, purchase ? 'inventory.stockOnHand' : 'inventory.rentalCapacity') }], 'PATCH', false, 'Không được giảm dưới số lượng đang giữ hoặc các đặt thuê đã có.');
  }
  if (resource === 'deposit-settlements' && row.status === 'APPROVED' && Number(row.refundAmount) > 0 && Number(row.outstandingAmount) === 0) add('Ghi nhận hoàn tiền cọc', '/refund', [select('method', 'Phương thức', ['BANK_TRANSFER', 'CASH'], 'BANK_TRANSFER'), { name: 'reference', title: 'Mã giao dịch hoàn tiền thực tế', required: true, minLength: 2, maxLength: 200 }, note('note', 'Ghi chú', false, 2000)], 'POST', true, 'Chỉ lưu sau khi đã hoàn tiền thực tế. Thao tác này không chuyển tiền ngân hàng.');
  if (resource === 'deposit-settlements' && row.status === 'PENDING_REVIEW') {
    const inspections = rows(row.physicalInspections).filter(item => item.result === 'ISSUE_FOUND');
    if (inspections.length) actions.push({ title: 'Duyệt quyết toán cọc', path: root + '/review', method: 'POST', idempotent: true, fields: inspections.flatMap((item, index) => [
      select(`type${index}`, `Trách nhiệm ${text(item, 'unit.unitCode') || index + 1}`, issueTypes, text(item, 'issueType')),
      { name: `amount${index}`, title: `Phí được duyệt cho ${text(item, 'unit.unitCode') || index + 1}`, required: true, numeric: true, minimum: 0, initial: ['NORMAL_WEAR', 'FACILITY_FAULT'].includes(String(item.issueType)) ? '0' : item.issueType === 'LOST_KEY_OR_ACCESS_ITEM' ? '200000' : '' },
      note(`reason${index}`, `Căn cứ duyệt ${index + 1}`, false, 2000),
    ] as FormField[]).concat([note('note', 'Ghi chú duyệt', false, 2000), confirm()]), transform: input => ({ note: input.note, issues: inspections.map((item, index) => ({ inspectionId: item.id, issueType: input[`type${index}`], approvedChargeAmount: input[`amount${index}`], reason: input[`reason${index}`] })) }), validate: input => {
      for (const item of rows(input.issues)) {
        if (['NORMAL_WEAR', 'FACILITY_FAULT'].includes(String(item.issueType)) && item.approvedChargeAmount !== 0) return `${label(item.issueType)} không thu phí khách.`;
        if (item.issueType === 'LOST_KEY_OR_ACCESS_ITEM' && item.approvedChargeAmount !== 200000) return 'Phí mất khóa hiện tại là 200.000 VND.';
        if ((Number(item.approvedChargeAmount) > 0 || item.issueType === 'OTHER') && String(item.reason ?? '').length < 3) return 'Cần nhập căn cứ duyệt ít nhất 3 ký tự cho vấn đề có phí hoặc loại Khác.';
      }
    } });
  }
  return actions;
}

export function userCreation(): FormAction {
  return { title: 'Tạo tài khoản nội bộ', path: '/admin/users', method: 'POST', fields: [
    { name: 'fullName', title: 'Họ và tên', required: true, minLength: 2, maxLength: 120 }, { name: 'email', title: 'Email', required: true, minLength: 5, maxLength: 254 }, { name: 'phone', title: 'Số điện thoại', required: true, minLength: 8, maxLength: 25 }, { name: 'password', title: 'Mật khẩu ban đầu', required: true, secure: true, minLength: 8, maxLength: 128 }, select('role', 'Vai trò', ['STAFF', 'MANAGER'], 'STAFF'), confirm(),
  ], transform: input => ({ ...input, email: String(input.email).toLowerCase() }), validate: input => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email)) ? 'Email không hợp lệ.' : !/^\+?[\d\s().-]{8,25}$/.test(String(input.phone)) ? 'Số điện thoại không hợp lệ.' : undefined };
}
