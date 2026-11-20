export const managerStorageLabels = {
  units: { title: 'Danh sách kho', description: 'Quản lý vị trí và trạng thái từng kho.' },
  catalog: { title: 'Loại kho & đơn giá', description: 'Quản lý loại kho, kích thước và giá thuê.' },
} as const;

/** Management destinations only. Daily customer operations belong to Staff. */
export const managerSections = {
  reviews: {
    title: 'Hồ sơ cần xử lý', description: 'Các hồ sơ cần quản lý xem xét hoặc xác nhận.',
    items: [
      { title: 'Sự cố hàng hóa', description: 'Xem tình trạng hàng và quyết định cách giải quyết.', web: '/manager/damage-claims', mobile: '/manager/damage-claims' },
      { title: 'Đề nghị trả trước hạn', description: 'Kiểm tra tiền còn phải trả và duyệt thời điểm trả sớm.', web: '/manager/early-returns', mobile: '/manager/early-returns' },
      { title: 'Hỗ trợ cần quyết định', description: 'Quyết định cách xử lý các yêu cầu nhân viên chuyển lên.', web: '/manager/operations/support-requests?status=ESCALATED', mobile: '/manager/support-requests?status=ESCALATED' },
      { title: 'Kiểm tra bảo trì', description: 'Xem kết quả sửa chữa và xác nhận hoặc yêu cầu làm lại.', web: '/manager/operations/maintenance?status=AWAITING_VERIFICATION', mobile: '/manager/maintenance?status=AWAITING_VERIFICATION' },
    ],
  },
  finance: {
    title: 'Tài chính', description: 'Theo dõi hóa đơn, khoản đã thu, tiền còn thiếu và tiền cọc.',
    items: [
      { title: 'Hóa đơn & khoản phải thu', description: 'Xem tiền còn thiếu và ghi nhận khoản đã nhận.', web: '/manager/operations/invoices', mobile: '/manager/invoices' },
      { title: 'Xử lý tiền cọc', description: 'Duyệt khoản khấu trừ và tiền hoàn sau khi kiểm tra kho.', web: '/manager/operations/deposit-settlements', mobile: '/manager/deposit-settlements' },
      { title: 'Lịch sử thu tiền', description: 'Tra cứu các khoản thu đã ghi nhận.', web: '/manager/operations/payments', mobile: '/manager/payments' },
    ],
  },
  'rental-records': {
    title: 'Hợp đồng & khách hàng', description: 'Tra cứu hợp đồng, kho đang thuê và thông tin khách hàng.',
    items: [
      { title: 'Hợp đồng thuê', description: 'Tra cứu thời hạn, chữ ký và các hồ sơ liên quan.', web: '/manager/operations/contracts', mobile: '/manager/contracts' },
      { title: 'Kho đang thuê', description: 'Theo dõi hạn thuê và các khoản chưa thanh toán.', web: '/manager/operations/rentals', mobile: '/manager/rentals' },
      { title: 'Khách hàng', description: 'Tra cứu liên hệ và lịch sử thuê để đối chiếu hồ sơ.', web: '/manager/customers', mobile: '/manager/customers' },
    ],
  },
  facility: {
    title: 'Kho & hàng hóa', description: 'Quản lý danh sách kho, giá thuê, vật tư và thiết bị.',
    items: [
      { ...managerStorageLabels.units, web: '/manager/units', mobile: '/manager/units' },
      { title: 'Hàng đang lưu theo kho', description: 'Xem vị trí, số lượng hàng và kết quả nhân viên kiểm đếm.', web: '/manager/stored-items', mobile: '/manager/stock-movements' },
    ],
  },
} as const;
export type ManagerSection = keyof typeof managerSections;
export const managerPrimaryMenu = [
  { title: 'Tổng quan', key: '' }, { title: managerSections.reviews.title, key: 'reviews' },
  { title: 'Phân công nhân viên', key: 'assignments' }, { title: 'Tài chính', key: 'finance' },
  { title: 'Kho & hàng hóa', key: 'facility' }, { title: 'Hợp đồng & khách hàng', key: 'rental-records' },
  { title: 'Dịch vụ & bảng giá', key: 'catalog' }, { title: 'Báo cáo', key: 'reports' },
] as const;
