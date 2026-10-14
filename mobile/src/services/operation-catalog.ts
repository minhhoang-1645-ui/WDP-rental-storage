import type { OperationRecord } from '@/types/management';
import { formatDate, formatMoney, statusLabel } from '@/utils/format';

type FieldKind = 'text' | 'money' | 'date' | 'datetime' | 'status';
export interface DisplayField { label: string; path: string; kind?: FieldKind }
export interface RelatedRows { title: string; path: string; fields: DisplayField[] }
export interface OperationConfig {
  title: string;
  description: string;
  code: string;
  heading: string;
  status?: string;
  search?: boolean;
  statuses?: string[];
  summary: DisplayField[];
  fields: DisplayField[];
  related?: RelatedRows[];
}
const field = (label: string, path: string, kind: FieldKind = 'text'): DisplayField => ({ label, path, kind });
const customer = [
  field('Khách hàng', 'customer.fullName|reservation.customer.fullName|rentalContract.reservation.customer.fullName'),
  field('Email', 'customer.email|reservation.customer.email'),
  field('Số điện thoại', 'customer.phone|reservation.customer.phone'),
];
const period = [field('Bắt đầu', 'startDate|reservation.startDate', 'date'), field('Kết thúc (không bao gồm)', 'endDateExclusive|effectiveEndDate|endDate|reservation.endDate', 'date')];
const invoices: RelatedRows = { title: 'Hóa đơn liên quan', path: 'invoices', fields: [field('Mã hóa đơn', 'invoiceCode'), field('Trạng thái', 'status', 'status'), field('Tổng tiền', 'totalAmount', 'money'), field('Còn phải trả', 'balanceDue', 'money')] };
const contracts: RelatedRows = { title: 'Hợp đồng', path: 'contracts', fields: [field('Mã hợp đồng', 'contractCode'), field('Trạng thái', 'status', 'status'), field('Kho', 'unit.unitCode|storageUnit.unitCode'), ...period] };
const allocations: RelatedRows = { title: 'Phân bổ kho', path: 'allocatedUnits', fields: [field('Kho', 'unitNumber|unitCode'), field('Tầng', 'floor'), field('Khu vực', 'zone'), field('Bắt đầu', 'plannedStartDate', 'date'), field('Kết thúc', 'plannedEndDate', 'date')] };

export const operationCatalog: Record<string, OperationConfig> = {
  reservations: {
    title: 'Yêu cầu đặt kho', description: 'Xem hồ sơ và xác nhận hoặc từ chối yêu cầu.', code: 'reference', heading: 'product.name', status: 'status',
    summary: [customer[0], field('Số kho', 'quantity'), ...period],
    fields: [...customer, field('Loại kho', 'product.name'), field('Số kho', 'quantity'), ...period, field('Tiền thuê cả kỳ', 'quote.rentalAmount', 'money'), field('Tiền cọc', 'quote.depositAmount', 'money'), field('Tổng giá trị báo giá', 'quote.quotedTotalAmount|quote.grandTotal', 'money'), field('Ghi chú khách hàng', 'customerNotes')],
    related: [allocations],
  },
  units: {
    title: 'Kho vật lý', description: 'Theo dõi kho trống, kho đang thuê và lịch phân bổ.', code: 'unitCode', heading: 'storageType.name', status: 'status', search: true,
    statuses: ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE'],
    summary: [field('Kích thước', 'dimensions.display'), field('Tầng', 'floor'), field('Khu vực', 'zone')],
    fields: [field('Loại kho', 'storageType.name'), field('Kích thước', 'dimensions.display'), field('Tầng', 'floor'), field('Khu vực', 'zone'), field('Khách đang thuê', 'currentAllocation.customer.fullName'), field('Yêu cầu bảo trì', 'activeMaintenance.maintenanceCode')],
    related: [{ title: 'Lịch phân bổ', path: 'allocations', fields: [field('Mã đặt kho', 'reservationReference'), field('Khách hàng', 'customer.fullName'), ...period, field('Đã trả kho lúc', 'releasedAt', 'datetime')] }],
  },
  customers: {
    title: 'Khách hàng', description: 'Thông tin liên hệ và lịch sử đặt kho.', code: 'email', heading: 'fullName', status: 'accountStatus', search: true,
    summary: [field('Số điện thoại', 'phone'), field('Số yêu cầu đặt kho', 'reservationCount')],
    fields: [field('Họ tên', 'fullName'), field('Email', 'email'), field('Số điện thoại', 'phone'), field('Số yêu cầu đặt kho', 'reservationCount'), field('Ngày đăng ký', 'createdAt', 'datetime')],
    related: [{ title: 'Lịch sử đặt kho', path: 'reservations', fields: [field('Mã đặt kho', 'reference'), field('Loại kho', 'storageType.name'), field('Trạng thái', 'status', 'status'), ...period] }],
  },
  appointments: {
    title: 'Lịch bàn giao', description: 'Xem lịch hẹn và xác nhận lịch khách hàng đã yêu cầu.', code: 'appointmentCode', heading: 'customer.fullName|reservation.reference', status: 'status', search: true,
    statuses: ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
    summary: [field('Lịch hẹn', 'scheduledAt', 'datetime'), field('Đặt kho', 'reservation.reference')],
    fields: [...customer, field('Lịch hẹn', 'scheduledAt', 'datetime'), field('Đặt kho', 'reservation.reference'), field('Ghi chú', 'note'), field('Người xác nhận', 'confirmedBy.fullName'), field('Người bàn giao', 'completedBy.fullName')],
    related: [allocations],
  },
  rentals: {
    title: 'Kho đang thuê', description: 'Hợp đồng đang hoạt động, ngày hết hạn và công nợ.', code: 'reservationReference', heading: 'storageType.name', status: 'rentalState',
    summary: [customer[0], field('Ngày hết hạn', 'effectiveEndDate', 'date'), field('Còn phải trả', 'billingSummary.totalOutstanding', 'money')],
    fields: [...customer, ...period, field('Số kho', 'quantity'), field('Còn phải trả', 'billingSummary.totalOutstanding', 'money')],
    related: [contracts, invoices],
  },
  contracts: {
    title: 'Hợp đồng', description: 'Theo dõi hợp đồng và kho được cấp.', code: 'contractCode', heading: 'storageType.name', status: 'status',
    summary: [customer[0], ...period],
    fields: [...customer, field('Đặt kho', 'reservation.reference'), field('Kho', 'storageUnit.unitCode'), ...period, field('Kích hoạt lúc', 'activatedAt', 'datetime')],
  },
  invoices: {
    title: 'Hóa đơn', description: 'Số tiền theo từng hóa đơn và lịch sử thanh toán.', code: 'invoiceCode', heading: 'reservation.customer.fullName', status: 'status', search: true,
    statuses: ['OPEN', 'PARTIALLY_PAID', 'PAID'],
    summary: [field('Tổng hóa đơn', 'totalAmount', 'money'), field('Còn phải trả', 'balanceDue', 'money'), field('Hạn thanh toán', 'dueAt', 'date')],
    fields: [...customer, field('Đặt kho', 'reservation.reference'), field('Kỳ thanh toán từ', 'billingPeriodStart', 'date'), field('Đến (không bao gồm)', 'billingPeriodEnd', 'date'), field('Tiền thuê trên hóa đơn', 'rentalAmount', 'money'), field('Tiền cọc trên hóa đơn', 'depositAmount', 'money'), field('Dịch vụ', 'serviceAmount', 'money'), field('Tổng hóa đơn', 'totalAmount', 'money'), field('Đã thanh toán', 'amountPaid', 'money'), field('Còn phải trả', 'balanceDue', 'money'), field('Hạn thanh toán', 'dueAt', 'date')],
    related: [{ title: 'Thanh toán đã ghi nhận', path: 'payments', fields: [field('Mã thanh toán', 'paymentCode'), field('Số tiền', 'amount', 'money'), field('Phương thức', 'method', 'status'), field('Mã giao dịch', 'reference'), field('Ngày nhận', 'receivedAt', 'datetime')] }],
  },
  'payment-submissions': {
    title: 'Xác minh chuyển khoản', description: 'Đối chiếu giao dịch trước khi ghi nhận thanh toán.', code: 'submissionCode', heading: 'customer.fullName', status: 'status', search: true,
    statuses: ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
    summary: [field('Hóa đơn', 'invoice.invoiceCode'), field('Khách báo đã chuyển', 'amount', 'money')],
    fields: [...customer, field('Hóa đơn', 'invoice.invoiceCode'), field('Khách báo đã chuyển', 'amount', 'money'), field('Hóa đơn còn phải trả', 'invoice.balanceDue', 'money'), field('Mã chuyển khoản khách cung cấp', 'transferReference'), field('Ghi chú khách', 'customerNote'), field('Gửi lúc', 'submittedAt', 'datetime'), field('Người đối soát', 'reviewedBy.fullName'), field('Lý do từ chối', 'rejectionReason'), field('Thanh toán đã xác minh', 'verifiedPayment.paymentCode')],
  },
  renewals: {
    title: 'Gia hạn', description: 'Xem và xét duyệt yêu cầu gia hạn.', code: 'renewalCode', heading: 'customer.fullName|reservation.reference', status: 'status', search: true,
    statuses: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED'],
    summary: [field('Hết hạn hiện tại', 'previousEndDate', 'date'), field('Gia hạn đến', 'requestedEndDate', 'date')],
    fields: [...customer, field('Đặt kho', 'reservation.reference'), field('Hết hạn hiện tại', 'previousEndDate', 'date'), field('Gia hạn đến', 'requestedEndDate', 'date'), field('Số tháng', 'termMonths'), field('Hình thức trả tiền', 'paymentPlan', 'status'), field('Lý do từ chối', 'rejectionReason')],
    related: [contracts, invoices],
  },
  maintenance: {
    title: 'Bảo trì', description: 'Theo dõi công việc và nghiệm thu kết quả sửa chữa.', code: 'maintenanceCode', heading: 'unit.unitCode', status: 'status', search: true,
    statuses: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'],
    summary: [field('Ưu tiên', 'priority', 'status'), field('Nhân viên', 'assignedStaff.fullName'), field('Mô tả', 'description')],
    fields: [field('Kho', 'unit.unitCode'), field('Ưu tiên', 'priority', 'status'), field('Nhân viên', 'assignedStaff.fullName'), field('Mô tả', 'description'), field('Kết quả sửa chữa', 'workNote'), field('Ghi chú nghiệm thu', 'verificationNote'), field('Đặt kho tiếp theo', 'nextConfirmedAllocation.reservationReference')],
  },
  'support-requests': {
    title: 'Hỗ trợ khách hàng', description: 'Theo dõi yêu cầu và nhân viên đang xử lý.', code: 'supportCode', heading: 'subject', status: 'status', search: true,
    statuses: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
    summary: [customer[0], field('Ưu tiên', 'priority', 'status'), field('Nhân viên', 'assignedStaff.fullName')],
    fields: [...customer, field('Tiêu đề', 'subject'), field('Nội dung', 'description'), field('Kho', 'unit.unitCode'), field('Ưu tiên', 'priority', 'status'), field('Nhân viên', 'assignedStaff.fullName'), field('Lý do chuyển quản lý', 'escalationReason'), field('Kết quả', 'resolutionNote')],
  },
  transfers: {
    title: 'Chuyển kho', description: 'Theo dõi kho nguồn, kho đích và trạng thái chuyển.', code: 'transferCode', heading: 'rentalContract.contractCode|contract.contractCode', status: 'status', search: true,
    statuses: ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'],
    summary: [field('Kho nguồn', 'fromUnit.unitCode|fromStorageUnit.unitNumber'), field('Kho đích', 'toUnit.unitCode|toStorageUnit.unitNumber')],
    fields: [...customer, field('Hợp đồng', 'contract.contractCode|rentalContract.contractCode'), field('Kho nguồn', 'fromUnit.unitCode|fromStorageUnit.unitNumber'), field('Kho đích', 'toUnit.unitCode|toStorageUnit.unitNumber'), field('Lý do', 'reason'), field('Người duyệt', 'approvedBy.fullName')],
  },
  returns: {
    title: 'Trả kho', description: 'Tiến độ kiểm tra và kết quả trả kho.', code: 'returnCode', heading: 'reservation.reference', status: 'status',
    summary: [customer[0], field('Ngày yêu cầu', 'requestedAt', 'datetime')],
    fields: [...customer, field('Đặt kho', 'reservation.reference'), field('Ngày yêu cầu', 'requestedAt', 'datetime'), field('Ghi chú', 'note'), field('Đã kiểm tra đạt', 'inspectionSummary.passed'), field('Có vấn đề', 'inspectionSummary.issues'), field('Còn phải trả', 'billingSummary.totalOutstanding', 'money')],
    related: [{ title: 'Kết quả kiểm tra', path: 'inspections', fields: [field('Kho', 'unit.unitCode'), field('Kết quả', 'result'), field('Ghi chú hiện trạng', 'conditionNote'), field('Vấn đề', 'issueNote')] }],
  },
  'deposit-settlements': {
    title: 'Quyết toán cọc', description: 'Theo dõi các khoản khấu trừ, hoàn cọc và còn thiếu.', code: 'settlementCode', heading: 'returnRequest.returnCode', status: 'status',
    summary: [field('Hoàn lại', 'refundAmount', 'money'), field('Còn thiếu', 'outstandingAmount', 'money')],
    fields: [...customer, field('Tiền cọc ban đầu', 'initialDepositAmount', 'money'), field('Tổng khấu trừ', 'totalCharges', 'money'), field('Hoàn lại', 'refundAmount', 'money'), field('Còn thiếu', 'outstandingAmount', 'money'), field('Mã hoàn tiền', 'refundPayment.paymentCode')],
  },
};

export function readField(record: OperationRecord, paths: string): unknown {
  for (const path of paths.split('|')) {
    let value: unknown = record;
    for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as OperationRecord)[key] : undefined;
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function displayField(record: OperationRecord, definition: DisplayField): string {
  const value = readField(record, definition.path);
  if (value === undefined) return definition.kind === 'money' ? 'Chưa có dữ liệu giá' : '—';
  if (definition.kind === 'money') {
    const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(amount) ? formatMoney(amount) : 'Chưa có dữ liệu giá';
  }
  if (definition.kind === 'date' || definition.kind === 'datetime') return formatDate(String(value), definition.kind === 'datetime');
  if (definition.kind === 'status') return statusLabel(String(value));
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
}

export function recordId(record: OperationRecord) {
  return String(record.id ?? record.reservationId ?? '');
}
export function recordStatus(record: OperationRecord, config: OperationConfig) {
  const status = String(readField(record, config.status ?? 'status') ?? '');
  return config.status === 'accountStatus' && status === 'ACTIVE' ? 'ACCOUNT_ACTIVE' : status;
}
