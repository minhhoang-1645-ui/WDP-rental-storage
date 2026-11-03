export const groups = [
  { title: 'Tìm và đặt kho', items: [
    { title: 'Tìm kho', path: '/customer/discover', description: 'Xem loại kho và kiểm tra khả dụng theo ngày thuê.' },
    { title: 'Tìm kích thước kho', path: '/customer/size-finder', description: 'Ước tính nhóm kho theo đồ dùng của bạn.' },
  ] },
  { title: 'Đặt kho & nhận kho', items: [
    { title: 'Yêu cầu đặt kho', path: '/customer/reservations', description: 'Xem trạng thái và kết quả duyệt yêu cầu.' },
    { title: 'Hóa đơn & thanh toán', path: '/customer/invoices', description: 'QR, VNPay và số tiền còn phải trả.' },
    { title: 'Lịch nhận kho', path: '/customer/appointments', description: 'Đặt lịch, xem xác nhận và kết quả bàn giao.' },
    { title: 'Hợp đồng', path: '/customer/contracts', description: 'Thông tin kỳ thuê và kho được cấp.' },
    { title: 'Lịch sử thanh toán', path: '/customer/payment-history', description: 'Các khoản tiền đã được ghi nhận.' },
    { title: 'Thông báo chuyển khoản', path: '/customer/payment-submissions', description: 'Xem kết quả NestBox đối chiếu tiền đã chuyển.' },
  ] },
  { title: 'Kho & hàng của tôi', items: [
    { title: 'Lịch sử đặt kho', path: '/customer/booking-history', description: 'Xem toàn bộ đơn, kho đã trả và đơn đã hủy hoặc hết hạn.' },
    { title: 'Kho đang thuê', path: '/customer/rentals', description: 'Hợp đồng hoạt động và các yêu cầu tiếp theo.' },
    { title: 'Nhập – xuất hàng', path: '/customer/stock-movements', description: 'Gửi/lấy hàng và theo dõi nhân viên kiểm đếm.' },
    { title: 'Hàng đang lưu', path: '/customer/stored-items', description: 'Số lượng thực tế theo hợp đồng.' },
  ] },
  { title: 'Thay đổi & hỗ trợ', items: [
    { title: 'Gia hạn', path: '/customer/renewals', description: 'Theo dõi duyệt, báo giá và thanh toán gia hạn.' },
    { title: 'Trả kho', path: '/customer/returns', description: 'Theo dõi kiểm tra sau khi trả kho.' },
    { title: 'Quyết toán tiền cọc', path: '/customer/deposit-settlements', description: 'Đối chiếu hoàn cọc và các khoản cần xử lý.' },
    { title: 'Yêu cầu chuyển kho', path: '/customer/transfers', description: 'Đề nghị NestBox xem xét chuyển kho qua hỗ trợ.' },
    { title: 'Hỗ trợ', path: '/customer/support-requests', description: 'Gửi câu hỏi, xem phản hồi và tiến độ xử lý.' },
  ] },
];
