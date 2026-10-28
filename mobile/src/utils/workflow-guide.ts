/** Explains responsibility without inventing a new workflow or changing permissions. */
export function workflowGuide(resource: string, status: unknown, audience: 'internal' | 'staff' | 'customer' = 'internal'): string {
  const customerGuides: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Lịch cần nhân viên kiểm tra ngoại lệ trước khi xác nhận thời gian nhận kho.',
      CONFIRMED: 'Lịch nhận kho của bạn đã được xác nhận. Bạn hãy đến kho đúng hẹn; nhân viên NestBox sẽ kiểm tra thông tin và bàn giao kho cho bạn.',
      COMPLETED: 'Bạn đã nhận kho. Bạn có thể gửi yêu cầu nhập hàng và xem số lượng hàng đang lưu trong tài khoản.',
      CANCELLED: 'Lịch nhận kho này đã hủy. Bạn có thể chọn lịch khác nếu hợp đồng vẫn đủ điều kiện nhận kho.',
    },
    'stock-movements': {
      REQUESTED: 'Yêu cầu của bạn đã được gửi. NestBox đang sắp xếp nhân viên tiếp nhận; số lượng hàng đang lưu chưa thay đổi.',
      ASSIGNED: 'Nhân viên đã được sắp xếp để hỗ trợ bạn giao nhận hàng. Số lượng thực tế sẽ được cập nhật sau khi kiểm đếm xong.',
      COMPLETED: 'Hàng của bạn đã được giao nhận và cập nhật số lượng thực tế. Bạn có thể mở Hàng đang lưu để kiểm tra.',
      CANCELLED: 'Yêu cầu giao nhận này đã hủy. Vui lòng liên hệ NestBox nếu bạn cần hỗ trợ.',
    },
    renewals: {
      PENDING: 'Yêu cầu gia hạn có ngoại lệ và đang được nhân viên kiểm tra. Kết quả sẽ được cập nhật tại đây.',
      APPROVED_PENDING_PAYMENT: 'Yêu cầu gia hạn của bạn đã được duyệt. Vui lòng thanh toán hóa đơn gia hạn để hoàn tất và cập nhật thời hạn thuê.',
      COMPLETED: 'Gia hạn của bạn đã hoàn tất. Bạn có thể xem thời hạn mới trong Kho đang thuê.',
      REJECTED: 'Yêu cầu gia hạn chưa được chấp thuận. Vui lòng xem lý do trong hồ sơ hoặc gửi yêu cầu hỗ trợ.',
    },
    returns: {
      REQUESTED: 'Yêu cầu trả kho của bạn đã được gửi. Nhân viên NestBox sẽ kiểm tra kho trước khi đối chiếu tiền cọc.',
      INSPECTION_IN_PROGRESS: 'Nhân viên đang kiểm tra kho của bạn. Kết quả và các khoản cần đối chiếu sẽ được cập nhật tại đây.',
      ISSUE_FOUND: 'Có vấn đề cần đối chiếu sau kiểm tra. Vui lòng xem ghi nhận trong hồ sơ và chờ NestBox xác nhận kết quả.',
      PENDING_SETTLEMENT: 'Kho đã được kiểm tra. NestBox đang đối chiếu tiền cọc và các khoản còn lại; bạn có thể theo dõi ở mục Trả kho & tiền cọc.',
      COMPLETED: 'Yêu cầu trả kho đã hoàn tất. Bạn có thể xem hồ sơ quyết toán để đối chiếu tiền cọc và các khoản cuối cùng.',
    },
    'support-requests': {
      OPEN: 'Yêu cầu hỗ trợ của bạn đã được gửi. NestBox sẽ tiếp nhận và cập nhật phản hồi tại đây.',
      ASSIGNED: 'NestBox đã tiếp nhận yêu cầu và sắp xếp nhân viên hỗ trợ bạn.',
      IN_PROGRESS: 'Yêu cầu của bạn đang được xử lý. Bạn có thể theo dõi phản hồi trong hồ sơ này.',
      ESCALATED: 'Yêu cầu của bạn đã được chuyển đến bộ phận phụ trách để xem xét. NestBox sẽ cập nhật kết quả sau khi xử lý.',
      RESOLVED: 'Yêu cầu của bạn đã được giải quyết. Vui lòng xem kết quả xử lý bên dưới.',
    },
  };
  if (audience === 'customer') return typeof status === 'string' ? customerGuides[resource]?.[status] ?? '' : '';
  const guides: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Lịch chưa thể xác nhận tự động. Nhân viên kiểm tra điều kiện và xử lý ngoại lệ trước khi bàn giao.',
      CONFIRMED: 'Lịch đã được xác nhận. Có thể hẹn nhận chìa khóa sớm tối đa 3 ngày; chỉ kích hoạt hợp đồng từ ngày bắt đầu thuê. Khách hàng đến kho đúng hẹn; nhân viên bàn giao thực tế và bấm Hoàn tất bàn giao. Chỉ thực hiện khi đã đến giờ hẹn và còn trong kỳ thuê.',
      COMPLETED: 'Nhân viên đã hoàn tất bàn giao, hợp đồng được kích hoạt. Khách hàng có thể tạo phiếu nhập hàng trong mục Nhập – xuất hàng.',
      CANCELLED: 'Lịch đã hủy. Khách hàng có thể đặt lại lịch khi hợp đồng còn đủ điều kiện.',
    },
    'stock-movements': {
      REQUESTED: 'Quản lý phân công nhân viên xử lý phiếu. Tồn hàng chưa thay đổi ở bước này.',
      ASSIGNED: 'Nhân viên được giao đối chiếu từng mặt hàng, nhập số lượng thực tế và hoàn tất sau khi giao nhận. Sau đó khách hàng kiểm tra Hàng đang lưu.',
      COMPLETED: 'Tồn đã được cập nhật theo số lượng thực tế. Khách hàng xem Hàng đang lưu và lịch sử phiếu để đối chiếu.',
      CANCELLED: 'Phiếu đã hủy; không có bước kiểm đếm hoặc hoàn tất tiếp theo.',
    },
    renewals: {
      PENDING: 'Hệ thống không thể duyệt tự động. Nhân viên đối chiếu hợp đồng, hạn cũ – mới và xung đột kho trước khi xử lý.',
      APPROVED_PENDING_PAYMENT: 'Đã duyệt gia hạn. Khách hàng cần thanh toán hóa đơn kích hoạt; chỉ sau khi hệ thống xác nhận thanh toán thì kỳ gia hạn mới hoàn tất.',
      COMPLETED: 'Gia hạn đã hoàn tất. Xem kỳ thuê cập nhật trong hồ sơ kho đang thuê.',
      REJECTED: 'Yêu cầu đã bị từ chối. Khách hàng xem lý do và gửi hỗ trợ nếu cần giải thích.',
    },
    returns: {
      REQUESTED: 'Nhân viên tiếp nhận kiểm tra thực tế từng kho trước khi trả.',
      INSPECTION_IN_PROGRESS: 'Nhân viên ghi kết quả từng kho và hiện trạng. Phí, khấu trừ và hoàn cọc do quản lý xử lý ở bước quyết toán.',
      ISSUE_FOUND: 'Có vấn đề cần quản lý đối chiếu. Nhân viên ghi nhận hiện trạng; không tự quyết định khoản phí hoặc tiền cọc.',
      PENDING_SETTLEMENT: 'Đã kiểm tra trả kho. Quản lý xem hồ sơ và quyết toán cọc, thu bổ sung hoặc hoàn tiền theo kết quả được duyệt.',
      COMPLETED: 'Hồ sơ trả kho đã hoàn tất. Xem quyết toán cọc để đối chiếu các khoản cuối cùng.',
    },
    maintenance: {
      OPEN: 'Quản lý giao nhân viên phụ trách; nhân viên được giao có thể bắt đầu xử lý.',
      IN_PROGRESS: 'Nhân viên xử lý và gửi kết quả sửa chữa cho nhân viên phụ trách nghiệm thu.',
      AWAITING_VERIFICATION: 'Nhân viên đã gửi kết quả. Nhân viên phụ trách cần nghiệm thu; kho chưa tự chuyển sang sẵn sàng.',
      COMPLETED: 'Nhân viên phụ trách đã nghiệm thu và hoàn tất công việc bảo trì.',
    },
    'support-requests': {
      OPEN: 'Yêu cầu đang chờ quản lý phân công người xử lý.',
      ASSIGNED: 'Nhân viên được giao bắt đầu hỗ trợ và cập nhật kết quả.',
      IN_PROGRESS: 'Nhân viên đang xử lý; có thể ghi nhận kết quả hoặc chuyển nhân viên phụ trách khi cần quyết định.',
      ESCALATED: 'Yêu cầu đã chuyển nhân viên phụ trách. Nhân viên phụ trách xem nội dung và quyết định cách giải quyết.',
      RESOLVED: 'Yêu cầu đã được giải quyết. Khách hàng có thể xem kết quả xử lý trong hồ sơ.',
    },
    transfers: {
      REQUESTED: 'Nhân viên phụ trách kiểm tra hợp đồng, kho nguồn và kho đích rồi duyệt hoặc từ chối.',
      APPROVED: 'Nhân viên phụ trách đã duyệt. Nhân viên chỉ hoàn tất sau khi thực hiện chuyển kho thực tế.',
      COMPLETED: 'Đã chuyển kho thực tế. Xem vị trí kho và lịch sử hợp đồng đã được cập nhật.',
    },
  };
  return typeof status === 'string' ? guides[resource]?.[status] ?? '' : '';
}
