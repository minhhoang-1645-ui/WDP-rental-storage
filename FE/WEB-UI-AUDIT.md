# Rà soát giao diện Web NestBox RV3 · Đợt 4

Các đường dẫn lấy từ router Web và danh sách phân hệ mà router thực sự cho phép. Dấu `{…}` nhóm các đường dẫn dùng chung một màn hình. Mức độ phản ánh mã nguồn trước khi chỉnh. Phạm vi kiểm thử trên trình duyệt được ghi riêng bên dưới.

| Route | Vai trò | Vấn đề phát hiện | Mức độ | Xử lý |
|---|---|---|---|---|
| `/`, `/storage`, `/size-guide` | Công khai | Typography của trang danh mục và các màn khác được khai báo riêng | MINOR FIX | Tiêu đề dùng cùng thang chữ; ảnh, bộ lọc và so sánh tiếp tục dùng bố cục hiện có |
| `/storage/:id` | Công khai | Trang chi tiết đã có tên kho, trạng thái, giá và điều kiện thuê | GOOD | Áp dụng thang chữ dùng chung |
| `/booking` | Công khai, Customer | Số lượng lặp trong thẻ tóm tắt và phần thông tin kỳ thuê | MINOR FIX | Hiển thị số lượng một lần trong thẻ; giữ điều kiện thuê, tiền cọc và dịch vụ |
| `/claim-booking`, `/booking/confirmation/:id`, `/reservation/:id` | Công khai | Phiếu xác nhận và xác minh đã tách khỏi luồng khôi phục mật khẩu; thang chữ riêng | MINOR FIX | Dùng chung typography cho khung xác nhận; rà riêng trạng thái và thao tác của từng luồng |
| `/reservation/confirmation`, `/login`, `/register`, `/account/reservations`, `*` | Công khai | Chuyển hướng tương thích hoặc đường dẫn dự phòng | GOOD | Giữ đích chuyển hướng |
| `/account/login`, `/account/register`, `/portal/login`, `/forgot-password`, `/reset-password` | Xác thực | Khung form đã dùng theme, nhưng nhãn và khoảng cách khai báo giá trị riêng | MINOR FIX | Tiêu đề, nhãn, chữ phụ và khoảng cách form lấy từ token chung |
| `/customer`, `/customer/sections/:section`, `/customer/booking-history`, `/customer/rentals` | Customer | Thanh trên chỉ ghi tên khu vực, thiếu tên trang đang mở | MINOR FIX | Dùng breadcrumb có nhãn trang và liên kết bỏ qua điều hướng |
| `/customer/reservations`, `/customer/reservations/:id` | Customer | Chi tiết lặp mô tả và thời gian tạo, mã tách rời tiêu đề | REDESIGN | Tên kho và trạng thái ở đầu; mã phụ có nút sao chép; giữ hạn giữ kho và bước tiếp theo |
| `/customer/{contracts,payments,appointments,renewals,returns,transfers,support,damage-claims,stored-items,stock-movements}`, `/customer/stock-movements/:id` | Customer | Chi tiết nhập/xuất và bảng chưa cùng cách trình bày trạng thái, điều hướng, phân trang | MINOR FIX | Dùng header hồ sơ, cỡ chữ bảng và điều khiển chung; giữ số lượng yêu cầu và kiểm đếm |
| `/customer/{notifications,profile}`, `/customer/settings/:section?`, `/customer/*` | Customer | Menu tài khoản thiếu đường dẫn trực tiếp tới Bảo mật | MINOR FIX | Thêm đường dẫn tới tab có sẵn; dùng breadcrumb chung |
| `/customer/payments/vnpay-return`, `/customer/payments/vnpay-return/mobile/:invoiceId` | Customer | Route trả kết quả đã có giao diện riêng; kết quả giao dịch thật phụ thuộc dịch vụ ngoài | BLOCKED | Rà source; chưa xác minh giao dịch thật trong đợt UI |
| `/staff`, `/staff/operations`, `/staff/tasks`, `/staff/sections/:section`, `/staff/{assigned-units,stored-items,damage-claims,overstays}` | Staff | Bảng công việc đã có phân trang và tác vụ theo quyền; thanh trên và khoảng cách còn quy tắc chồng | MINOR FIX | Dùng breadcrumb và các token chung; giữ cột và nghiệp vụ riêng |
| `/staff/{inquiries,reservations,support-requests,appointments,stock-movements,renewals,transfers,returns,maintenance,rentals}` và `/:id` dưới từng phân hệ; `/staff/operations/:resource` và `/staff/operations/:resource/:id` | Staff | Nhiều kiểu header và vị trí mã; phiếu nhập/xuất cần giữ số đếm, xác nhận và cảnh báo | REDESIGN | Gộp đầu trang theo hồ sơ, dùng bố cục biểu mẫu chung; giữ thao tác theo phân hệ |
| `/staff/{notifications,check-in}`, `/staff/settings/:section?`, `/staff/*` | Staff | Nội dung thông báo có chú thích kỹ thuật về việc kiểm tra định kỳ | MINOR FIX | Chỉ hiện trạng thái đang tải hoặc lỗi; thêm Bảo mật trong menu tài khoản |
| `/manager`, `/manager/{reviews,finance,rental-records,facility,assignments,early-returns,damage-claims,stored-items,overstays}` | Manager | Điều hướng đã tách theo nghiệp vụ; còn quy tắc chữ và khoảng cách trùng | MINOR FIX | Áp dụng breadcrumb và các token chung |
| `/manager/{units,customers,catalog}`, `/manager/catalog/additional-services`, `/manager/operations/:resource` | Manager | Các bảng cùng thành phần nhưng khác cấu hình phân trang | MINOR FIX | Dùng điều khiển phân trang chung. Bảng có phân trang hỗ trợ các mức 10, 20 và 50 dòng |
| `/manager/{units,customers}/:id`, `/manager/operations/:resource/:id` | Manager | Mã hồ sơ có thể trở thành tiêu đề; danh sách mốc xử lý hiển thị theo thứ tự trường | REDESIGN | Ưu tiên tên khách, loại kho hoặc tên hồ sơ; mã phụ; sắp mốc thật theo thời gian |
| `/manager/reports`, `/manager/reports/details` | Manager | Chi tiết báo cáo đã có nhóm, bảng và nội dung mở rộng; tiêu đề và chú thích biểu đồ còn cỡ chữ riêng | MINOR FIX | Đồng bộ cỡ chữ tiêu đề, chú thích và khoảng cách |
| `/manager/notifications`, `/manager/settings/:section?`, `/manager/{inventory,payment-submissions/*,online-payment-reconciliations/*}`, `/manager/*` | Manager | Cài đặt thiếu liên kết trực tiếp tới Bảo mật; các route cũ dùng chuyển hướng | MINOR FIX | Thêm liên kết Bảo mật và giữ các đích hiện có |
| `/admin`, `/admin/users`, `/admin/{login-history,activity}`, `/admin/sections/:section` | Admin | Các bảng đã có tìm kiếm, bộ lọc và phân trang; phần phân trang bị nhiều lớp CSS định dạng | MINOR FIX | Dùng phân trang và breadcrumb chung; giữ cột, bộ lọc và quy tắc phân quyền |
| `/admin/users/:id` | Admin | Tên, email, vai trò và trạng thái lặp giữa đầu trang và tab thông tin | REDESIGN | Hiển thị một lần ở đầu trang; duy trì tab Phân quyền và xác nhận thay đổi trạng thái |
| `/admin/notifications`, `/admin/settings/:section?`, `/admin/{roles,account-status,assignments,facility/assignments,facility/*}`, `/admin/*` | Admin | Chuông là điểm vào thông báo; các URL cũ là chuyển hướng tương thích | MINOR FIX | Dùng menu tài khoản chung với liên kết Bảo mật |

## CSS và thành phần

- `workspace-theme.css` chứa bảng màu, thang chữ 26–30/20/16/15/14/13 px, bước khoảng cách 4 px và bán kính cho khung và điều khiển.
- `portal.css` là nguồn định dạng phân trang, breadcrumb và hộp thoại nghiệp vụ. Bỏ khai báo lặp ở `internal-web.css`, `light-professional.css`, `web-spacing.css`, `web-readability.css` và phần theme cục bộ.
- `landing.css`, `public-booking.css`, `refresh.css`, `admin-workspace.css` và `manager-reports.css` dùng token cho các phần đã chỉnh, bỏ định dạng nhãn ảnh đã bỏ và khối tóm tắt tài khoản cũ.
- Tái sử dụng `PageHeader`, `Modal`, `InternalPagination`, `CopyRecordCode`, `Status`, `WorkspaceProfileDropdown`, các layout hiện tại và `useWorkspaceTheme`. Các bảng trước đây có tùy chọn 5 dòng vẫn hỗ trợ mức đó.

## Giới hạn dữ liệu

- Dòng thời gian chỉ dùng các mốc API đã trả về. Trang chi tiết tài khoản chưa có dòng thời gian riêng; lịch sử quản trị xem tại Nhật ký hoạt động. Thiếu người thực hiện theo từng mốc ở một số hồ sơ.
- Địa chỉ và giờ hoạt động mẫu vẫn được ghi rõ là minh họa khi cấu hình cơ sở đánh dấu như vậy.
- Các route trong cùng nhóm chia sẻ thành phần và được rà theo mã nguồn. Việc mở màn hình mẫu trên trình duyệt không xác minh từng bộ dữ liệu, quyền và trạng thái có thể xuất hiện trên mỗi route động.

## Kiểm thử local

- `node scripts/web-ui-standardization-smoke.mjs` kiểm tra 23 màn hình đại diện qua 5 độ rộng (1920, 1366, 1024, 768, 390 px) và 2 chế độ màu, tổng cộng 230 tổ hợp. Có kiểm tra tràn ngang, cỡ chữ tiêu đề, các cặp token chữ/nền chính ở ngưỡng 4,5:1 và đường dẫn Bảo mật qua menu tài khoản.
- Các bộ smoke kiểm tra danh mục, đặt kho, xác minh email, khôi phục mật khẩu, lịch sử và hồ sơ Admin, thông báo, báo cáo và nghiệp vụ Manager, cài đặt chung, cùng các liên kết giữa hồ sơ của Customer. Kiểm thử dùng API giả lập hoặc nguồn danh mục/báo giá mở ở chế độ chỉ đọc.
- Chưa đo zoom thật 125% và 200%, chưa thực hiện kiểm toán WCAG toàn trang, chưa kiểm tra gửi email hoặc giao dịch VNPay thật. Bộ Staff có ảnh sau khi chỉnh; chưa dựng lại ảnh trước đó.
