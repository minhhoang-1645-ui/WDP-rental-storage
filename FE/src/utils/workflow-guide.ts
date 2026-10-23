/** Explains responsibility without inventing a new workflow or changing permissions. */
export function workflowGuide(resource: string, status: unknown, audience: 'internal' | 'staff' | 'customer' = 'internal'): string {
  const customerGuides: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Yêu cầu đặt lịch của bạn đã được gửi. WDP sẽ xác nhận thời gian nhận kho và cập nhật tại đây.',
      CONFIRMED: 'Lịch nhận kho của bạn đã được xác nhận. Bạn hãy đến kho đúng hẹn; nhân viên WDP sẽ kiểm tra thông tin và bàn giao kho cho bạn.',
      COMPLETED: 'Bạn đã nhận kho. Bạn có thể gửi yêu cầu nhập hàng và xem số lượng hàng đang lưu trong tài khoản.',
      CANCELLED: 'Lịch nhận kho này đã hủy. Bạn có thể chọn lịch khác nếu hợp đồng vẫn đủ điều kiện nhận kho.',
    },
    'stock-movements': {
      REQUESTED: 'Yêu cầu của bạn đã được gửi. WDP đang sắp xếp nhân viên tiếp nhận; số lượng hàng đang lưu chưa thay đổi.',
      ASSIGNED: 'Nhân viên đã được sắp xếp để hỗ trợ bạn giao nhận hàng. Số lượng thực tế sẽ được cập nhật sau khi kiểm đếm xong.',
      COMPLETED: 'Hàng của bạn đã được giao nhận và cập nhật số lượng thực tế. Bạn có thể mở Hàng đang lưu để kiểm tra.',
      CANCELLED: 'Yêu cầu giao nhận này đã hủy. Vui lòng liên hệ WDP nếu bạn cần hỗ trợ.',
    },
    renewals: {
      PENDING: 'Yêu cầu gia hạn của bạn đã được gửi và đang chờ xét duyệt. Kết quả sẽ được cập nhật tại đây.',
      APPROVED_PENDING_PAYMENT: 'Yêu cầu gia hạn của bạn đã được duyệt. Vui lòng thanh toán hóa đơn gia hạn để hoàn tất và cập nhật thời hạn thuê.',
      COMPLETED: 'Gia hạn của bạn đã hoàn tất. Bạn có thể xem thời hạn mới trong Kho đang thuê.',
      REJECTED: 'Yêu cầu gia hạn chưa được chấp thuận. Vui lòng xem lý do trong hồ sơ hoặc gửi yêu cầu hỗ trợ.',
    },
    returns: {
      REQUESTED: 'Yêu cầu trả kho của bạn đã được gửi. Nhân viên WDP sẽ kiểm tra kho trước khi đối chiếu tiền cọc.',
      INSPECTION_IN_PROGRESS: 'Nhân viên đang kiểm tra kho của bạn. Kết quả và các khoản cần đối chiếu sẽ được cập nhật tại đây.',
      ISSUE_FOUND: 'Có vấn đề cần đối chiếu sau kiểm tra. Vui lòng xem ghi nhận trong hồ sơ và chờ WDP xác nhận kết quả.',
      PENDING_SETTLEMENT: 'Kho đã được kiểm tra. WDP đang đối chiếu tiền cọc và các khoản còn lại; bạn có thể theo dõi ở mục Trả kho & tiền cọc.',
      COMPLETED: 'Yêu cầu trả kho đã hoàn tất. Bạn có thể xem hồ sơ quyết toán để đối chiếu tiền cọc và các khoản cuối cùng.',
    },
    'support-requests': {
      OPEN: 'Yêu cầu hỗ trợ của bạn đã được gửi. WDP sẽ tiếp nhận và cập nhật phản hồi tại đây.',
      ASSIGNED: 'WDP đã tiếp nhận yêu cầu và sắp xếp nhân viên hỗ trợ bạn.',
      IN_PROGRESS: 'Yêu cầu của bạn đang được xử lý. Bạn có thể theo dõi phản hồi trong hồ sơ này.',
      ESCALATED: 'Yêu cầu của bạn đã được chuyển đến quản lý để xem xét. WDP sẽ cập nhật kết quả sau khi xử lý.',
      RESOLVED: 'Yêu cầu của bạn đã được giải quyết. Vui lòng xem kết quả xử lý bên dưới.',
    },
  };
  if (audience === 'customer') return typeof status === 'string' ? customerGuides[resource]?.[status] ?? '' : '';
  if (audience === 'staff') {
    const staffGuides: Record<string, Record<string, string>> = {
      appointments: {
        REQUESTED: 'Lịch đang chờ quản lý xác nhận. Bạn thực hiện bàn giao sau khi lịch được xác nhận và đã đến giờ hẹn.',
        CONFIRMED: 'Đối chiếu thông tin khách và kho được cấp. Bàn giao kho thực tế rồi bấm Hoàn tất bàn giao khi đã đến giờ hẹn và còn trong kỳ thuê.',
        COMPLETED: 'Bàn giao đã hoàn tất. Hợp đồng được kích hoạt; khách có thể gửi yêu cầu nhập hàng.',
        CANCELLED: 'Lịch đã hủy. Bạn không cần thực hiện bàn giao theo lịch này.',
      },
      'stock-movements': {
        REQUESTED: 'Phiếu đang chờ phân công. Bạn có thể kiểm đếm và hoàn tất sau khi phiếu được giao cho mình.',
        ASSIGNED: 'Nếu phiếu được giao cho bạn, hãy đối chiếu từng mặt hàng, nhập số lượng thực tế và hoàn tất sau khi giao nhận xong.',
        COMPLETED: 'Phiếu đã hoàn tất. Số lượng hàng đang lưu đã được cập nhật theo kết quả kiểm đếm.',
        CANCELLED: 'Phiếu đã hủy. Bạn không cần tiếp tục kiểm đếm hoặc giao nhận theo phiếu này.',
      },
      returns: {
        REQUESTED: 'Tiếp nhận kiểm tra từng kho khách trả và ghi nhận hiện trạng thực tế.',
        INSPECTION_IN_PROGRESS: 'Ghi đủ kết quả kiểm tra từng kho trước khi hoàn tất nhận kho trả. Quản lý sẽ đối chiếu phí và tiền cọc.',
        ISSUE_FOUND: 'Ghi rõ hiện trạng và vấn đề phát hiện. Quản lý sẽ xem xét trách nhiệm và chi phí phát sinh.',
        PENDING_SETTLEMENT: 'Phần kiểm tra đã hoàn tất. Hồ sơ đang chờ quản lý quyết toán tiền cọc.',
        COMPLETED: 'Hồ sơ trả kho đã hoàn tất. Bạn có thể xem lại kết quả kiểm tra trong lịch sử.',
      },
      maintenance: {
        OPEN: 'Nếu được giao việc này, bạn hãy kiểm tra kho và bấm Bắt đầu bảo trì khi bắt đầu thực hiện.',
        IN_PROGRESS: 'Thực hiện sửa chữa, ghi kết quả và gửi quản lý nghiệm thu sau khi làm xong.',
        AWAITING_VERIFICATION: 'Kết quả đã được gửi và đang chờ quản lý nghiệm thu. Kho vẫn ở trạng thái bảo trì.',
        COMPLETED: 'Quản lý đã nghiệm thu. Công việc bảo trì đã hoàn tất.',
      },
      'support-requests': {
        OPEN: 'Yêu cầu đang chờ phân công. Bạn xử lý sau khi được giao phụ trách.',
        ASSIGNED: 'Nếu được giao yêu cầu này, bạn hãy xem nội dung và bấm Bắt đầu hỗ trợ khi tiếp nhận.',
        IN_PROGRESS: 'Hỗ trợ khách và ghi nhận kết quả. Chuyển quản lý nếu cần quyết định ngoài phạm vi xử lý của bạn.',
        ESCALATED: 'Yêu cầu đã được chuyển quản lý xem xét. Bạn có thể theo dõi kết quả trong hồ sơ.',
        RESOLVED: 'Yêu cầu đã được giải quyết. Kết quả hỗ trợ được lưu trong hồ sơ.',
      },
      transfers: {
        APPROVED: 'Đối chiếu kho nguồn và kho đích đã được duyệt. Chỉ bấm hoàn tất sau khi đã chuyển kho thực tế.',
        COMPLETED: 'Chuyển kho đã hoàn tất. Vị trí kho và lịch sử hợp đồng đã được cập nhật.',
      },
    };
    return typeof status === 'string' ? staffGuides[resource]?.[status] ?? '' : '';
  }
  const guides: Record<string, Record<string, string>> = {
    appointments: {
      REQUESTED: 'Khách hàng đã đề xuất lịch. Quản lý xác nhận lịch trước khi nhân viên thực hiện bàn giao.',
      CONFIRMED: 'Quản lý đã xác nhận. Khách hàng đến kho đúng hẹn; nhân viên bàn giao thực tế và bấm Hoàn tất bàn giao. Chỉ thực hiện khi đã đến giờ hẹn và còn trong kỳ thuê.',
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
      PENDING: 'Quản lý đối chiếu hợp đồng, hạn cũ – mới và báo giá trước khi duyệt hoặc từ chối.',
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
      IN_PROGRESS: 'Nhân viên xử lý và gửi kết quả sửa chữa cho quản lý nghiệm thu.',
      AWAITING_VERIFICATION: 'Nhân viên đã gửi kết quả. Quản lý cần nghiệm thu; kho chưa tự chuyển sang sẵn sàng.',
      COMPLETED: 'Quản lý đã nghiệm thu và hoàn tất công việc bảo trì.',
    },
    'support-requests': {
      OPEN: 'Quản lý tiếp nhận và phân công người xử lý yêu cầu của khách hàng.',
      ASSIGNED: 'Nhân viên được giao bắt đầu hỗ trợ và cập nhật kết quả.',
      IN_PROGRESS: 'Nhân viên đang xử lý; có thể ghi nhận kết quả hoặc chuyển quản lý khi cần quyết định.',
      ESCALATED: 'Yêu cầu đã chuyển quản lý. Quản lý xem nội dung và quyết định cách giải quyết.',
      RESOLVED: 'Yêu cầu đã được giải quyết. Khách hàng có thể xem kết quả xử lý trong hồ sơ.',
    },
    transfers: {
      REQUESTED: 'Quản lý kiểm tra hợp đồng, kho nguồn và kho đích rồi duyệt hoặc từ chối.',
      APPROVED: 'Quản lý đã duyệt. Nhân viên chỉ hoàn tất sau khi thực hiện chuyển kho thực tế.',
      COMPLETED: 'Đã chuyển kho thực tế. Xem vị trí kho và lịch sử hợp đồng đã được cập nhật.',
    },
  };
  return typeof status === 'string' ? guides[resource]?.[status] ?? '' : '';
}
