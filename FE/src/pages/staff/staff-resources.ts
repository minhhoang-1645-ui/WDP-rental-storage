export const staffResources = {
  appointments: {
    title: "Lịch bàn giao",
    description: "Xem lịch đã xác nhận và ghi nhận bàn giao kho thực tế.",
    statuses: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"],
  },
  rentals: {
    title: "Kho đang thuê",
    description: "Theo dõi kho đang sử dụng, quá hạn và vị trí kho.",
    statuses: ["ACTIVE", "OVERDUE"],
  },
  returns: {
    title: "Yêu cầu trả kho",
    description: "Kiểm tra từng kho và hoàn tất việc nhận kho trả.",
    statuses: [
      "REQUESTED",
      "INSPECTION_IN_PROGRESS",
      "ISSUE_FOUND",
      "PENDING_SETTLEMENT",
      "COMPLETED",
    ],
  },
  maintenance: {
    title: "Bảo trì kho",
    description: "Báo sự cố và xử lý công việc bảo trì được phân công.",
    statuses: ["OPEN", "IN_PROGRESS", "AWAITING_VERIFICATION", "COMPLETED"],
  },
  "support-requests": {
    title: "Hỗ trợ khách hàng",
    description:
      "Xử lý yêu cầu được giao hoặc chuyển vấn đề cần quản lý xem xét.",
    statuses: ["OPEN", "ASSIGNED", "IN_PROGRESS", "ESCALATED", "RESOLVED"],
  },
} as const;
export type StaffResource = keyof typeof staffResources;

export function staffDay(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(instant);
}
