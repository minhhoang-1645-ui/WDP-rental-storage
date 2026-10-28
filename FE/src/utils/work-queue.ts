import { isEarlyReturnRequest } from './early-return';

type WorkRow = Record<string, unknown>;

export const staffWorkGroups = [
  {
    resource: "reservations",
    title: "Yêu cầu đặt kho",
    description: "Theo dõi đặt kho tự xác nhận; kiểm tra hồ sơ chưa đủ điều kiện.",
  },
  {
    resource: "inquiries",
    title: "Yêu cầu tư vấn",
    description: "Liên hệ khách và cập nhật kết quả tư vấn.",
  },
  {
    resource: "appointments",
    title: "Lịch bàn giao",
    description: "Xác nhận lịch khách đề xuất và bàn giao đúng giờ.",
  },
  {
    resource: "stock-movements",
    title: "Nhập – xuất hàng",
    description: "Kiểm đếm phiếu được giao; tồn chỉ đổi sau khi hoàn tất.",
  },
  {
    resource: "renewals",
    title: "Gia hạn kho",
    description: "Đối chiếu hạn cũ – mới và báo giá trước khi duyệt.",
  },
  {
    resource: "transfers",
    title: "Chuyển kho",
    description: "Duyệt kho đích và ghi nhận chuyển kho thực tế.",
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
    description: "Thực hiện sửa chữa được giao và nghiệm thu kết quả.",
  },
] as const;

function assignee(row: WorkRow) {
  const person = row.assignedStaff;
  return person && typeof person === "object"
    ? (person as WorkRow).id
    : undefined;
}

/** Receiving a request does not grant an employee authority to assign it. */
export function staffNeedsAction(
  resource: string,
  row: WorkRow,
  userId: string,
) {
  const status = String(row.status ?? "");
  switch (resource) {
    case "reservations":
      return status === "PENDING";
    case "inquiries":
      return (
        row.requestType === "INQUIRY" &&
        ["PENDING_CONTACT", "CONTACTED", "IN_REVIEW"].includes(status)
      );
    case "appointments":
      return ["REQUESTED", "CONFIRMED"].includes(status);
    case "renewals":
      return status === "PENDING";
    case "transfers":
      return ["REQUESTED", "APPROVED"].includes(status);
    case "returns":
      return ["REQUESTED", "INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
        status,
      );
    case "stock-movements":
      return status === "ASSIGNED" && assignee(row) === userId;
    case "support-requests":
      return !isEarlyReturnRequest(row) && (
        status === "ESCALATED" ||
        (["ASSIGNED", "IN_PROGRESS"].includes(status) &&
          assignee(row) === userId)
      );
    case "maintenance":
      return (
        status === "AWAITING_VERIFICATION" ||
        (["OPEN", "IN_PROGRESS"].includes(status) && assignee(row) === userId)
      );
    default:
      return false;
  }
}

export function awaitingAssignment(resource: string, row: WorkRow) {
  return (
    !(resource === "support-requests" && isEarlyReturnRequest(row)) &&
    ["support-requests", "maintenance", "stock-movements"].includes(resource) &&
    ["OPEN", "REQUESTED"].includes(String(row.status)) &&
    !assignee(row)
  );
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
