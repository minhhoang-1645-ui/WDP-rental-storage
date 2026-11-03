/** Short labels for navigation chrome; never rewrite record data or consent text. */
const labels: Record<string, string> = {
  'Làm mới danh sách': 'Làm mới', 'Bộ lọc trạng thái': 'Trạng thái',
  'Đặt lịch từ hợp đồng đủ điều kiện': 'Đặt lịch nhận kho',
  'Gửi yêu cầu cho kho đang thuê': 'Chọn kho để gửi yêu cầu',
  'Xem quyết toán tiền cọc': 'Xem tiền cọc',
  'Chờ xác nhận thanh toán': 'Duyệt chuyển khoản',
  'Chờ nghiệm thu bảo trì': 'Nghiệm thu bảo trì',
  'Hộp thư quyết định': 'Hồ sơ chờ duyệt',
  'Dịch vụ thêm (tùy chọn)': 'Dịch vụ thêm',
  'Hóa đơn & thanh toán': 'Thanh toán', 'Yêu cầu đặt kho': 'Đơn đặt kho',
  'Tìm kích thước kho': 'Chọn kích thước', 'Thông báo chuyển khoản': 'Xác nhận chuyển khoản',
  'Yêu cầu chuyển kho': 'Chuyển kho', 'Quyết toán tiền cọc': 'Tiền cọc',
  'Quản lý tài khoản người dùng': 'Người dùng', 'Tài khoản và đăng xuất': 'Tài khoản',
  'Về tổng quan quản trị': 'Tổng quan', 'Về danh sách tài khoản': 'Danh sách tài khoản',
  'Mở hóa đơn để thanh toán': 'Xem & thanh toán', 'Làm mới tổng quan': 'Làm mới',
  'Làm mới công việc': 'Làm mới', 'Làm mới tài khoản': 'Làm mới',
  'Làm mới thông tin thanh toán': 'Làm mới', 'Đóng thông báo': 'Đóng',
  'Xem thêm việc & cập nhật': 'Xem thêm', 'Cần thực hiện & cập nhật mới': 'Việc cần làm',
  'Thông báo & việc cần làm': 'Thông báo', 'Các nhóm công việc': 'Công việc',
  'Chọn việc cần xử lý': 'Công việc', 'Tìm tên, email hoặc số điện thoại': 'Tìm người dùng',
};
export const shortLabel = (value: string) => labels[value] ?? value;
