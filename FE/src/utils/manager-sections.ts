export const managerStorageLabels = {
  units: { title: 'Kho vật lý', description: 'Quản lý vị trí và trạng thái từng kho.' },
  catalog: { title: 'Loại kho & đơn giá', description: 'Quản lý loại kho, kích thước và giá thuê.' },
} as const;

/** Management destinations only. Daily customer operations belong to Staff. */
export const managerSections = {
  reviews: {
    title: 'Việc cần duyệt', description: 'Chỉ xử lý đề nghị cần quyết định của quản lý và kết quả nhân viên gửi nghiệm thu.',
    items: [
      { title: 'Sự cố hàng hóa', description: 'Xem ghi nhận thực tế và quyết định hướng xử lý, không tự tính bồi thường.', web: '/manager/damage-claims', mobile: '/manager/damage-claims' },
      { title: 'Đề nghị trả trước hạn', description: 'Đối chiếu công nợ và quyết định trước khi nhân viên tiếp nhận trả kho.', web: '/manager/early-returns', mobile: '/manager/early-returns' },
      { title: 'Hỗ trợ cần quyết định', description: 'Chỉ những hồ sơ nhân viên chuyển lên, không tiếp nhận thay nhân viên.', web: '/manager/operations/support-requests?status=ESCALATED', mobile: '/manager/support-requests?status=ESCALATED' },
      { title: 'Nghiệm thu bảo trì', description: 'Duyệt kết quả sửa chữa hoặc yêu cầu làm lại; nhân viên thực hiện bảo trì.', web: '/manager/operations/maintenance?status=AWAITING_VERIFICATION', mobile: '/manager/maintenance?status=AWAITING_VERIFICATION' },
    ],
  },
  finance: {
    title: 'Tài chính', description: 'Quản lý hóa đơn, công nợ, khoản thu và tiền cọc.',
    items: [
      { title: 'Hóa đơn & công nợ', description: 'Đối chiếu số phải thu và ghi nhận khoản tiền thực sự đã nhận.', web: '/manager/operations/invoices', mobile: '/manager/invoices' },
      { title: 'Quyết toán tiền cọc', description: 'Duyệt khấu trừ và ghi nhận hoàn tiền theo kết quả kiểm tra của nhân viên.', web: '/manager/operations/deposit-settlements', mobile: '/manager/deposit-settlements' },
      { title: 'Lịch sử thu tiền', description: 'Tra cứu các khoản thu đã ghi nhận.', web: '/manager/operations/payments', mobile: '/manager/payments' },
    ],
  },
  'rental-records': {
    title: 'Hợp đồng & khách hàng', description: 'Tra cứu hợp đồng, kho đang thuê và thông tin khách để quản lý; các yêu cầu vận hành do nhân viên xử lý.',
    items: [
      { title: 'Hợp đồng thuê', description: 'Tra cứu thời hạn, chữ ký và các hồ sơ liên quan.', web: '/manager/operations/contracts', mobile: '/manager/contracts' },
      { title: 'Kho đang thuê', description: 'Giám sát thời hạn và công nợ, không bàn giao thay nhân viên.', web: '/manager/operations/rentals', mobile: '/manager/rentals' },
      { title: 'Khách hàng', description: 'Tra cứu liên hệ và lịch sử thuê để đối chiếu hồ sơ.', web: '/manager/customers', mobile: '/manager/customers' },
    ],
  },
  facility: {
    title: 'Kho & hàng hóa', description: 'Quản lý loại kho, kho vật lý, giá thuê, vật tư và thiết bị. Nhân viên tiếp nhận sự cố và thực hiện bảo trì.',
    items: [
      { ...managerStorageLabels.units, web: '/manager/units', mobile: '/manager/units' },
      { title: 'Hàng đang lưu theo kho', description: 'Tra cứu kho hiện tại, tồn thực tế và phiếu Staff kiểm đếm.', web: '/manager/stored-items', mobile: '/manager/stock-movements' },
    ],
  },
} as const;
export type ManagerSection = keyof typeof managerSections;
export const managerPrimaryMenu = [
  { title: 'Tổng quan', key: '' }, { title: 'Việc cần duyệt', key: 'reviews' },
  { title: 'Phân công nhân viên', key: 'assignments' }, { title: 'Tài chính', key: 'finance' },
  { title: 'Kho & hàng hóa', key: 'facility' }, { title: 'Hợp đồng & khách hàng', key: 'rental-records' },
  { title: 'Dịch vụ & bảng giá', key: 'catalog' }, { title: 'Báo cáo', key: 'reports' },
] as const;
