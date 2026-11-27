import { isEarlyReturnRequest } from './early-return';
import { isCustomerTransferSubject } from './transfer-request';
import { transferProblem } from './transfer-problem';

type WorkRow = Record<string, unknown>;

export const staffWorkGroups = [
  {
    resource: "appointments",
    title: "Lịch bàn giao",
    description: "Xác nhận lịch khách đề xuất và bàn giao đúng giờ.",
  },
  {
    resource: "transfers",
    title: "Chuyển kho",
    description: "Ghi nhận việc chuyển kho đã được giao.",
  },
  {
    resource: "returns",
    title: "Trả kho",
    description: "Kiểm tra từng kho và ghi nhận hiện trạng thực tế.",
  },
  {
    resource: "support-requests",
    title: "Hỗ trợ khách hàng",
    description: "Giải quyết phần việc được giao và hồ sơ chuyển tiếp.",
  },
  {
    resource: "maintenance",
    title: "Bảo trì kho",
    description: "Thực hiện sửa chữa được giao và gửi kết quả chờ quản lý nghiệm thu.",
  },
] as const;

function assignee(row: WorkRow) {
  const person = row.assignedStaff;
  return person && typeof person === "object"
    ? (person as WorkRow).id
    : undefined;
}

const assignableStates: Record<string, readonly string[]> = {
  'support-requests': ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
  maintenance: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'],
  appointments: ['REQUESTED', 'CONFIRMED'],
  returns: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'],
  transfers: ['APPROVED'],
  'damage-claims': ['REPORTED', 'INVESTIGATING'],
};

export function needsStaffAssignment(resource: string) {
  return Object.hasOwn(assignableStates, resource);
}

export function canAssignWork(resource: string, row: WorkRow) {
  return !(resource === 'support-requests' && (isEarlyReturnRequest(row) || isCustomerTransferSubject(row.subject))) &&
    Boolean(assignableStates[resource]?.includes(String(row.status)));
}

export function isAssignedStaffWork(resource: string, row: WorkRow, userId: string) {
  if (resource === 'appointments' && row.canRecordCancellationRecovery === true && row.recoveryStaffId === userId && userId) return true;
  return Boolean(userId && assignee(row) === userId) &&
    !(resource === 'support-requests' && isEarlyReturnRequest(row)) &&
    (resource !== 'transfers' || ['APPROVED', 'COMPLETED'].includes(String(row.status))
      || row.status === 'REJECTED' && transferProblem(row).review.decision === 'CANCEL');
}

export function staffRecordedAt(resource: string, row: WorkRow, userId: string): string {
  const evidenceDates = (record: WorkRow) => (Array.isArray(record.evidenceSubmissions) ? record.evidenceSubmissions : [])
    .filter(item => item?.staffUserId === userId && typeof item.recordedAt === 'string')
    .map(item => item.recordedAt as string);
  if (resource === 'maintenance') return [...evidenceDates(row),
    row.source === 'MANUAL' && (row.reportedBy as WorkRow | undefined)?.id === userId ? String(row.createdAt ?? '') : '',
  ].sort().at(-1) ?? '';
  if (resource === 'returns' && Array.isArray(row.inspections)) return row.inspections
    .flatMap(item => [...evidenceDates(item), item?.inspectedBy?.id === userId ? String(item.inspectedAt ?? '') : ''])
    .sort().at(-1) ?? '';
  return '';
}

/** Receiving a request does not grant an employee authority to assign it. */
export function staffNeedsAction(
  resource: string,
  row: WorkRow,
  userId: string,
) {
  const status = String(row.status ?? "");
  if (needsStaffAssignment(resource) && !isAssignedStaffWork(resource, row, userId)) return false;
  switch (resource) {
    case "inquiries":
      return (
        row.requestType === "INQUIRY" &&
        ["PENDING_CONTACT", "CONTACTED", "IN_REVIEW"].includes(status)
      );
    case "appointments":
      if (row.canRecordCancellationRecovery === true && row.recoveryStaffId) return row.recoveryStaffId === userId;
      return ["REQUESTED", "CONFIRMED"].includes(status) && assignee(row) === userId && row.bookingReady !== false && row.cancellationPending !== true;
    case "transfers":
      return status === "APPROVED";
    case "returns":
      return ["REQUESTED", "INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
        status,
      );
    case "support-requests":
      return ["ASSIGNED", "IN_PROGRESS"].includes(status);
    case "maintenance":
      return ["OPEN", "IN_PROGRESS"].includes(status);
    default:
      return false;
  }
}

export function awaitingAssignment(resource: string, row: WorkRow) {
  return canAssignWork(resource, row) && !assignee(row);
}

/** Disabled assignees need an explicit replacement; their work is never silently reassigned. */
export function assignmentNeedsAttention(resource: string, row: WorkRow) {
  if (resource === 'support-requests' && (row.status === 'ESCALATED' || hasLinkedTransfer(row))
    || resource === 'maintenance' && row.status === 'AWAITING_VERIFICATION'
    || resource === 'damage-claims' && Boolean(row.staffFacts)) return false;
  if (awaitingAssignment(resource, row)) return true;
  const person = row.assignedStaff;
  const disabled = person && typeof person === "object" && ((person as WorkRow).accountStatus === "DISABLED" || ((person as WorkRow).role && (person as WorkRow).role !== 'FACILITY_STAFF'));
  return Boolean(disabled && canAssignWork(resource, row));
}

export function hasLinkedTransfer(row: WorkRow) {
  return Array.isArray(row.transfers) && row.transfers.some(transfer =>
    transfer && ['REQUESTED', 'APPROVED', 'COMPLETED'].includes(String(transfer.status)));
}

export function managerNeedsAction(resource: string, row: WorkRow) {
  if ((resource === 'appointments' || resource === 'returns') && row.waitingForManager === true) return true;
  if (resource === 'support-requests' && isCustomerTransferSubject(row.subject)) {
    return row.status !== 'RESOLVED' && (!Array.isArray(row.transfers) || row.transfers.length === 0);
  }
  return assignmentNeedsAttention(resource, row)
    || resource === "support-requests" && row.status === "ESCALATED" && !isEarlyReturnRequest(row)
    || resource === "maintenance" && row.status === "AWAITING_VERIFICATION"
    || resource === "transfers" && (row.status === "REQUESTED" || transferProblem(row).pending)
    || resource === "renewals" && row.status === "PENDING"
    || resource === "deposit-settlements" && (row.status === "PENDING_REVIEW" ||
      (row.status === "APPROVED" && typeof row.refundAmount === "number" && row.refundAmount > 0 &&
        row.outstandingAmount === 0 && row.refundedAt === null))
    || resource === "invoices" && isOverdueInvoice(row);
}

export function staffWorkRank(
  resource: string,
  row: WorkRow,
  now = Date.now(),
) {
  if (row.priority === "HIGH" || row.status === "ESCALATED") return 0;
  if (resource === "appointments" && row.status === "CONFIRMED")
    return Date.parse(String(row.scheduledAt)) <= now ? 1 : 3;
  return 2;
}

export function isOverdueInvoice(row: WorkRow, now = Date.now()) {
  return (
    ["OPEN", "PARTIALLY_PAID"].includes(String(row.status)) &&
    Number(row.balanceDue) > 0 &&
    Date.parse(String(row.type === "INITIAL" && row.reservation && typeof row.reservation === "object" && (row.reservation as WorkRow).expiresAt || row.dueAt)) < now
  );
}

export function assignmentWorkRank(row: WorkRow) {
  if (["COMPLETED", "RESOLVED", "CANCELLED"].includes(String(row.status)))
    return 30;
  return (
    (assignee(row) ? 10 : 0) +
    (row.priority === "HIGH" ? 0 : row.priority === "LOW" ? 2 : 1)
  );
}
