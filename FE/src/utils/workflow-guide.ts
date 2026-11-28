/** Short, role-specific next steps. Permissions and state transitions are handled by the action forms. */
export function workflowGuide(resource: string, status: unknown, audience: 'internal' | 'staff' | 'customer' = 'internal'): string {
  const customer: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Nhân viên đang kiểm tra lịch nhận kho của bạn.',
      CONFIRMED: 'Đến kho đúng giờ hẹn để nhận chìa khóa và hướng dẫn sử dụng.',
      COMPLETED: 'Bạn đã nhận kho và có thể gửi yêu cầu nhập hàng.',
      CANCELLED: 'Lịch đã hủy. Bạn có thể đặt lại khi hợp đồng còn hiệu lực.',
    },
    'stock-movements': {
      REQUESTED: 'Yêu cầu đã gửi. Chờ nhân viên được phân công giao nhận hàng.',
      ASSIGNED: 'Nhân viên sẽ kiểm đếm hàng và cập nhật số lượng thực tế.',
      COMPLETED: 'Đã giao nhận xong. Xem số lượng thực tế trong phiếu.',
      CANCELLED: 'Phiếu đã hủy. Số lượng hàng trong kho không thay đổi.',
    },
    renewals: {
      PENDING: 'Yêu cầu gia hạn đang chờ kiểm tra.',
      APPROVED_PENDING_PAYMENT: 'Ký phụ lục và thanh toán hóa đơn gia hạn để cập nhật hạn thuê.',
      COMPLETED: 'Đã gia hạn. Hạn thuê mới có trong Kho của tôi.',
      REJECTED: 'Yêu cầu chưa được chấp thuận. Xem lý do bên dưới.',
    },
    returns: {
      REQUESTED: 'Nhân viên sẽ kiểm tra và hẹn nhận lại kho.',
      INSPECTION_IN_PROGRESS: 'Nhân viên đang kiểm tra tình trạng kho.',
      ISSUE_FOUND: 'Có vấn đề cần quản lý xem xét. Kết quả sẽ được cập nhật tại đây.',
      PENDING_SETTLEMENT: 'Đã nhận lại kho. Đang kiểm tra khoản khấu trừ và tiền cọc được hoàn.',
      COMPLETED: 'Đã hoàn tất trả kho. Bạn có thể xem kết quả tiền cọc.',
    },
    'support-requests': {
      OPEN: 'Yêu cầu đã gửi. Nhân viên sẽ tiếp nhận và phản hồi.',
      ASSIGNED: 'Đã có nhân viên phụ trách yêu cầu của bạn.',
      IN_PROGRESS: 'Nhân viên đang xử lý yêu cầu của bạn.',
      ESCALATED: 'Yêu cầu đang chờ quản lý xem xét.',
      RESOLVED: 'Đã xử lý xong. Xem phản hồi trong yêu cầu.',
    },
  };
  const internal: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Kiểm tra hợp đồng và thời gian nhận kho trước khi xác nhận lịch.',
      CONFIRMED: 'Nhân viên được giao kiểm tra người nhận, kho và chìa khóa trước khi bàn giao.',
      COMPLETED: 'Đã bàn giao. Xem biên bản và người nhận bên dưới.',
      CANCELLED: 'Lịch đã hủy. Khách có thể đặt lại nếu còn đủ điều kiện.',
    },
    renewals: {
      PENDING: 'Kiểm tra hạn thuê, kho trống và số tiền gia hạn trước khi duyệt.',
      APPROVED_PENDING_PAYMENT: 'Chờ khách ký phụ lục và thanh toán hóa đơn gia hạn.',
      COMPLETED: 'Đã gia hạn. Hợp đồng đã cập nhật hạn thuê mới.',
      REJECTED: 'Yêu cầu đã từ chối. Khách xem được lý do trong hồ sơ.',
    },
    returns: {
      REQUESTED: 'Nhân viên xác nhận kho đã dọn trống, kiểm tra hiện trạng và thu hồi quyền ra vào.',
      INSPECTION_IN_PROGRESS: 'Ghi tình trạng từng kho. Khoản khấu trừ và hoàn cọc do quản lý duyệt.',
      ISSUE_FOUND: 'Quản lý xem kết quả kiểm tra và quyết định khoản cần thu hoặc khấu trừ.',
      PENDING_SETTLEMENT: 'Quản lý kiểm tra và duyệt tiền cọc được hoàn.',
      COMPLETED: 'Đã hoàn tất trả kho và xử lý tiền cọc.',
    },
    maintenance: {
      OPEN: 'Quản lý phân công nhân viên kiểm tra và sửa chữa.',
      IN_PROGRESS: 'Ghi kết quả sửa chữa và gửi quản lý kiểm tra.',
      AWAITING_VERIFICATION: 'Chờ quản lý kiểm tra kết quả sửa chữa.',
      COMPLETED: 'Đã kiểm tra và hoàn tất bảo trì.',
    },
    'support-requests': {
      OPEN: 'Chờ quản lý phân công người xử lý.',
      ASSIGNED: 'Nhân viên được giao bắt đầu hỗ trợ khách.',
      IN_PROGRESS: 'Ghi kết quả xử lý; gửi quản lý nếu cần quyết định thêm.',
      ESCALATED: 'Quản lý xem yêu cầu nhân viên chuyển lên và phản hồi hướng xử lý.',
      RESOLVED: 'Đã xử lý xong và thông báo kết quả cho khách.',
    },
    transfers: {
      REQUESTED: 'Quản lý kiểm tra hợp đồng, chọn kho đích và phân công nhân viên.',
      APPROVED: 'Chuyển hàng, thu chìa khóa cũ và giao chìa khóa mới trước khi hoàn tất.',
      COMPLETED: 'Đã chuyển xong. Hợp đồng và hàng hóa ghi nhận kho mới.',
      REJECTED: 'Yêu cầu đã từ chối. Khách xem được lý do.',
    },
  };
  return typeof status === 'string' ? (audience === 'customer' ? customer : internal)[resource]?.[status] ?? '' : '';
}
