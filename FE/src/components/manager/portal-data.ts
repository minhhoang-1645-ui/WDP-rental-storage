export type Row = Record<string, unknown>;
export type Page<T = Row> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};
export function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}
export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(object) : [];
}
export function at(row: Row, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, key) => object(value)[key], row);
}
export function textValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
export function first(row: Row, ...paths: string[]): string {
  return paths.map((path) => textValue(at(row, path))).find(Boolean) ?? "";
}
export function code(row: Row): string {
  return first(
    row,
    "movementCode",
    "appointmentCode",
    "renewalCode",
    "invoiceCode",
    "paymentCode",
    "contractCode",
    "returnCode",
    "transferCode",
    "maintenanceCode",
    "supportCode",
    "settlementCode",
    "reservationReference",
    "reference",
    "unitCode",
    "fullName",
    "id",
  );
}
export function recordId(row: Row): string {
  return first(row, "reservationId", "id");
}
export function customer(row: Row): Row {
  return object(
    row.customer ??
      at(row, "reservation.customer") ??
      at(row, "invoice.reservation.customer"),
  );
}
export function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(value)
    : "Cần xác nhận báo giá";
}
export function date(value: unknown, withTime = false): string {
  if (
    typeof value !== "string" ||
    !value ||
    Number.isNaN(new Date(value).getTime())
  )
    return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export const labels: Record<string, string> = {
  PENDING: "Chờ xử lý",
  PENDING_CONTACT: "Chờ liên hệ",
  CONTACTED: "Đã liên hệ",
  IN_REVIEW: "Đang xem xét",
  CLOSED: "Đã đóng",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
  AVAILABLE: "Sẵn sàng",
  LIMITED: "Số lượng hạn chế",
  RESERVED: "Đã giữ kho",
  OCCUPIED: "Đang sử dụng",
  MAINTENANCE: "Bảo trì",
  ACTIVE: "Đang hoạt động",
  DISABLED: "Đã vô hiệu hóa",
  OVERDUE: "Quá hạn",
  COMPLETED: "Hoàn tất",
  REQUESTED: "Chờ xác nhận",
  APPROVED: "Đã duyệt",
  APPROVED_PENDING_PAYMENT: "Đã duyệt · chờ thanh toán",
  PENDING_PAYMENT: "Chờ thanh toán",
  READY_FOR_HANDOVER: "Sẵn sàng bàn giao",
  OPEN: "Đang mở",
  PARTIALLY_PAID: "Thanh toán một phần",
  PAID: "Đã thanh toán",
  INSPECTION_IN_PROGRESS: "Đang kiểm tra",
  ISSUE_FOUND: "Có vấn đề",
  PENDING_SETTLEMENT: "Chờ quyết toán",
  PASS: "Đạt",
  PENDING_REVIEW: "Chờ duyệt",
  AWAITING_OUTSTANDING_PAYMENT: "Chờ thu bổ sung",
  SETTLED: "Đã quyết toán",
  IN_PROGRESS: "Đang xử lý",
  AWAITING_VERIFICATION: "Chờ nghiệm thu",
  ASSIGNED: "Đã phân công",
  ESCALATED: "Chuyển bộ phận phụ trách",
  RESOLVED: "Đã giải quyết",
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  INITIAL: "Hóa đơn ban đầu",
  RECURRING: "Hóa đơn định kỳ",
  RENEWAL: "Gia hạn",
  SETTLEMENT: "Quyết toán",
  STAFF: "Nhân viên",
  MANAGER: "Quản lý",
  ADMIN: "Quản trị viên",
  CUSTOMER: "Khách hàng",
  STANDARD: "Kho thường",
  AIR_CONDITIONED: "Kho điều hòa",
  standard: "Kho thường",
  climate: "Kho điều hòa",
  PAY_MONTHLY: "Trả từng tháng",
  PREPAID: "Trả trước",
  MONTHLY: "Theo tháng",
  DAILY: "Theo ngày",
  NORMAL_WEAR: "Hao mòn thông thường",
  FACILITY_FAULT: "Lỗi cơ sở",
  CUSTOMER_DAMAGE: "Hư hỏng do khách",
  CLEANING_REQUIRED: "Cần vệ sinh",
  LOST_KEY_OR_ACCESS_ITEM: "Mất khóa / vật dụng truy cập",
  OTHER: "Khác",
  UNIT_DAMAGE: "Hư hỏng kho",
  CLEANING: "Vệ sinh",
  LOCK_OR_ACCESS: "Khóa / truy cập",
  FACILITY_EQUIPMENT: "Thiết bị cơ sở",
  UNIT_ISSUE: "Sự cố kho",
  FACILITY_EQUIPMENT_FAILURE: "Sự cố thiết bị cơ sở",
  OPERATIONAL_RELOCATION: "Điều chuyển vận hành",
  LOCK_OR_KEY_ISSUE: "Sự cố khóa / chìa",
  ACCESS_CODE_ISSUE: "Sự cố mã truy cập",
  PAYMENT_SUPPORT: "Hỗ trợ thanh toán",
  STORED_ITEM_CONCERN: "Vấn đề đồ lưu trữ",
  MANAGER_RESOLVED: "Đã xử lý sau chuyển tiếp",
  TRANSFER_RECOMMENDED: "Đề xuất chuyển kho",
  NO_ACTION_REQUIRED: "Không cần xử lý thêm",
  MANUAL: "Tạo thủ công",
  RETURN_INSPECTION: "Từ kiểm tra trả kho",
  ON_SITE_RESOLVED: "Đã xử lý tại chỗ",
  CUSTOMER_GUIDANCE: "Đã hướng dẫn khách",
  ACCESS_RESTORED: "Đã khôi phục truy cập",
  PAYMENT_GUIDANCE: "Đã hướng dẫn thanh toán",
};
export function label(value: unknown): string {
  const key = textValue(value);
  return (labels[key] ?? key) || "—";
}
export const resources: Record<
  string,
  {
    title: string;
    description: string;
    statuses?: string[];
    local?: boolean;
    filterKey?: string;
  }
> = {
  reservations: {
    title: "Yêu cầu đặt kho",
    description: "Xác nhận nhu cầu và phân bổ kho cho toàn bộ kỳ thuê.",
    statuses: ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"],
    local: true,
  },
  inquiries: {
    title: "Yêu cầu tư vấn",
    description: "Theo dõi liên hệ và báo giá. Yêu cầu tư vấn chưa giữ kho.",
    statuses: [
      "PENDING_CONTACT",
      "CONTACTED",
      "IN_REVIEW",
      "CLOSED",
      "CANCELLED",
    ],
    local: true,
  },
  units: {
    title: "Kho vật lý",
    description: "Vị trí, tình trạng sử dụng và lịch phân bổ của từng kho.",
    statuses: ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE"],
  },
  customers: {
    title: "Khách hàng",
    description: "Thông tin liên hệ và lịch sử đặt kho.",
  },
  appointments: {
    title: "Lịch bàn giao",
    description: "Xác nhận lịch nhận kho và theo dõi kết quả bàn giao.",
    statuses: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"],
  },
  renewals: {
    title: "Gia hạn kho",
    description: "Duyệt gia hạn sau khi kiểm tra lịch phân bổ tương lai.",
    statuses: ["PENDING", "APPROVED_PENDING_PAYMENT", "COMPLETED", "REJECTED"],
  },
  invoices: {
    title: "Hóa đơn",
    description: "Theo dõi kỳ thu, số tiền đã nhận và dư nợ.",
    statuses: ["OPEN", "PARTIALLY_PAID", "PAID", "VOID"],
  },
  payments: {
    title: "Lịch sử thanh toán",
    description: "Các khoản thu đã ghi nhận và người tiếp nhận.",
    statuses: ["BANK_TRANSFER", "CASH"],
    filterKey: "method",
  },
  contracts: {
    title: "Hợp đồng thuê",
    description: "Mỗi kho vật lý có một hợp đồng riêng.",
    statuses: ["PENDING_PAYMENT", "READY_FOR_HANDOVER", "ACTIVE", "COMPLETED", "CANCELLED"],
  },
  rentals: {
    title: "Kho đang thuê",
    description: "Theo dõi kỳ thuê, công nợ và nguy cơ trùng lịch.",
    statuses: ["false", "true"],
    filterKey: "overdue",
  },
  returns: {
    title: "Trả kho & kiểm tra",
    description: "Kết quả kiểm tra vật lý và tiến độ quyết toán cọc.",
    statuses: [
      "REQUESTED",
      "INSPECTION_IN_PROGRESS",
      "ISSUE_FOUND",
      "PENDING_SETTLEMENT",
      "COMPLETED",
    ],
  },
  transfers: {
    title: "Chuyển kho",
    description: "Điều chuyển sang kho cùng loại và theo dõi bàn giao.",
    statuses: ["REQUESTED", "APPROVED", "COMPLETED", "REJECTED"],
    local: true,
  },
  maintenance: {
    title: "Bảo trì kho",
    description: "Theo dõi người phụ trách, kết quả sửa chữa và nghiệm thu.",
    statuses: ["OPEN", "IN_PROGRESS", "AWAITING_VERIFICATION", "COMPLETED"],
  },
  "support-requests": {
    title: "Hỗ trợ khách hàng",
    description: "Tiếp nhận và giải quyết phần việc hỗ trợ của khách hàng.",
    statuses: ["OPEN", "ASSIGNED", "IN_PROGRESS", "ESCALATED", "RESOLVED"],
  },
  "deposit-settlements": {
    title: "Quyết toán tiền cọc",
    description: "Duyệt từng vấn đề, khấu trừ và ghi nhận hoàn cọc.",
    statuses: [
      "PENDING_REVIEW",
      "APPROVED",
      "AWAITING_OUTSTANDING_PAYMENT",
      "SETTLED",
    ],
  },
};
export function detailPath(resource: string, row: Row): string {
  const root = ["units", "customers", "reservations", "inquiries"].includes(
    resource,
  )
    ? `/manager/${resource}`
    : `/manager/operations/${resource}`;
  return `${root}/${encodeURIComponent(recordId(row))}`;
}
