/** Management destinations only. Daily customer operations belong to Staff. */
export const managerSections = {
  reviews: {
    title: 'Phê duyệt ngoại lệ', description: 'Chỉ xử lý đề nghị cần quyết định của quản lý và kết quả nhân viên gửi nghiệm thu.',
    items: [
      { title: 'Đề nghị trả trước hạn', description: 'Đối chiếu công nợ và quyết định trước khi nhân viên tiếp nhận trả kho.', web: '/manager/early-returns', mobile: '/manager/early-returns' },
      { title: 'Hỗ trợ cần quyết định', description: 'Chỉ những hồ sơ nhân viên chuyển lên, không tiếp nhận thay nhân viên.', web: '/manager/operations/support-requests?status=ESCALATED', mobile: '/manager/support-requests?status=ESCALATED' },
      { title: 'Nghiệm thu bảo trì', description: 'Duyệt kết quả sửa chữa hoặc yêu cầu làm lại; nhân viên thực hiện bảo trì.', web: '/manager/operations/maintenance?status=AWAITING_VERIFICATION', mobile: '/manager/maintenance?status=AWAITING_VERIFICATION' },
    ],
  },
  finance: {
    title: 'Tài chính', description: 'Quản lý các khoản thu, công nợ, đối soát và tiền cọc; không thực hiện bàn giao hoặc kiểm đếm.',
    items: [
      { title: 'Hóa đơn & công nợ', description: 'Đối chiếu số phải thu và ghi nhận khoản tiền thực sự đã nhận.', web: '/manager/operations/invoices', mobile: '/manager/invoices' },
      { title: 'Xác nhận chuyển khoản', description: 'Kiểm tra thông báo khách gửi với tiền thực nhận.', web: '/manager/payment-submissions', mobile: '/manager/payment-submissions' },
      { title: 'Quyết toán tiền cọc', description: 'Duyệt khấu trừ và ghi nhận hoàn tiền theo kết quả kiểm tra của nhân viên.', web: '/manager/operations/deposit-settlements', mobile: '/manager/deposit-settlements' },
      { title: 'Đối soát VNPay', description: 'Xử lý giao dịch bất thường hoặc cần hoàn tiền.', web: '/manager/online-payment-reconciliations', mobile: '/manager/online-payment-reconciliations' },
      { title: 'Lịch sử thu tiền', description: 'Tra cứu các khoản thu đã ghi nhận.', web: '/manager/operations/payments', mobile: '/manager/payments' },
    ],
  },
  'rental-records': {
    title: 'Hồ sơ thuê', description: 'Tra cứu hợp đồng, kho đang thuê và thông tin khách để quản lý; các yêu cầu vận hành do nhân viên xử lý.',
    items: [
      { title: 'Hợp đồng thuê', description: 'Tra cứu thời hạn, chữ ký và các hồ sơ liên quan.', web: '/manager/operations/contracts', mobile: '/manager/contracts' },
      { title: 'Kho đang thuê', description: 'Giám sát thời hạn và công nợ, không bàn giao thay nhân viên.', web: '/manager/operations/rentals', mobile: '/manager/rentals' },
      { title: 'Khách hàng thuê kho', description: 'Tra cứu liên hệ và lịch sử thuê để đối chiếu hồ sơ.', web: '/manager/customers', mobile: '/manager/customers' },
    ],
  },
  facility: {
    title: 'Kho & bảng giá', description: 'Tra cứu tình trạng kho và giá thuê; quản lý vật tư, thiết bị bổ sung. Nhân viên tiếp nhận sự cố và thực hiện bảo trì.',
    items: [
      { title: 'Kho vật lý', description: 'Xem vị trí, phân bổ và tình trạng kho.', web: '/manager/units', mobile: '/manager/units' },
      { title: 'Loại kho & bảng giá', description: 'Tra cứu kích thước, loại kho và giá thuê đang áp dụng.', web: '/manager/catalog', mobile: '/manager/catalog' },
      { title: 'Vật tư & thiết bị', description: 'Quản lý danh mục dịch vụ và giá theo lần, ngày, tháng.', web: '/manager/catalog/additional-services', mobile: '/manager/additional-services' },
    ],
  },
} as const;
export type ManagerSection = keyof typeof managerSections;
export const managerPrimaryMenu = [
  { title: 'Tổng quan', key: '' }, { title: 'Phân công nhân viên', key: 'assignments' },
  { title: 'Phê duyệt ngoại lệ', key: 'reviews' }, { title: 'Tài chính', key: 'finance' },
  { title: 'Hồ sơ thuê', key: 'rental-records' }, { title: 'Kho & bảng giá', key: 'facility' },
  { title: 'Báo cáo', key: 'reports' },
] as const;
