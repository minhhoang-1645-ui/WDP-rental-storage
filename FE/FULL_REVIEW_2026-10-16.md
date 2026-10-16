# Rà soát và hoàn thiện client — 16/10/2026

## Phạm vi đã xác nhận

Người dùng xác nhận giữ nguyên BE/database, hoàn thiện web/mobile theo API đang có. Admin tiếp tục chỉ có Tổng quan và Quản lý tài khoản; phân công thuộc Manager. Không sửa BE, Prisma/schema, migration, seed, mật khẩu hoặc dữ liệu nghiệp vụ.

Đối chiếu các controller, DTO trả về, điều kiện chuyển trạng thái trong BE và tài liệu yêu cầu gốc. Các góp ý giảng viên và phần chưa có API được ghi riêng trong [báo cáo nghiệp vụ](./TEACHER_REVIEW_2026-10-16.md).

## Lỗi và điểm vướng đã sửa

### Web

- **Lỗi dữ liệu biến mất trên điện thoại:** CSS cũ ẩn mọi `.customer-table-wrap` dưới 680px, trong khi hợp đồng và thanh toán không có giao diện thay thế. Đã giới hạn quy tắc ẩn cho danh sách đặt kho vốn có thẻ riêng; hợp đồng, hóa đơn, lịch sử thanh toán và thông báo chuyển khoản chuyển thành thẻ có nhãn trên màn hình nhỏ.
- Hóa đơn/thanh toán phân trang 20 hồ sơ trên giao diện; vẫn lấy đủ các trang API để không bỏ sót hồ sơ. Nút thanh toán và toàn bộ số tiền/trạng thái còn nhìn thấy ở 390px.
- Modal chuyển khoản Customer và đối chiếu Manager giữ focus bên trong, hỗ trợ Tab/Shift+Tab, Escape, khóa cuộn nền và trả focus khi đóng; không cho Escape đóng trong lúc đang gửi.
- Thêm hiện/ẩn mật khẩu cho đăng nhập chung và đăng nhập nội bộ.
- Link Tiện ích/Cách thuê/Cơ sở chờ nội dung tải xong rồi cuộn đúng mục; không đánh dấu tất cả link trên trang chủ là đang chọn. Menu điện thoại đóng sau điều hướng. Tiêu đề tab cập nhật theo nội dung trang.
- Gia hạn chỉ cho chọn kho có snapshot kỳ thuê MONTHLY và chưa có gia hạn chờ xử lý, đúng điều kiện BE. Kho thuê ngày không còn được đưa vào lựa chọn gia hạn tháng.
- Giữ các sửa nghiệp vụ đã thực hiện: dịch vụ theo lần/ngày/tháng lịch, cửa sổ ngày bàn giao, thông tin đối chiếu trước khi duyệt gia hạn.

### Mobile

- Staff: danh sách mở được chi tiết thực sự; các thẻ công việc không còn chỉ hiển thị thông tin. Có bắt đầu/hoàn tất sửa chữa, gửi nghiệm thu, bắt đầu/giải quyết/chuyển hỗ trợ lên Manager, bàn giao, kiểm tra từng kho trả, hoàn tất nhận kho trả và hoàn tất chuyển kho APPROVED.
- Quyền xử lý hỗ trợ/bảo trì bám người được giao và trạng thái BE. Staff ghi hiện trạng, không gửi quyết định phí/khấu trừ cọc. Hồ sơ ISSUE_FOUND không có nút đổi thành PASS. Không hoàn tất bàn giao trước giờ hẹn.
- Customer: bổ sung danh sách/chi tiết yêu cầu đặt kho, hợp đồng, lịch hẹn, gia hạn, trả kho, quyết toán cọc, hỗ trợ, yêu cầu chuyển kho, hóa đơn, khoản đã thanh toán và thông báo chuyển khoản; giữ kho đang thuê/tài khoản.
- Các form xuất phát từ hồ sơ cụ thể: đặt lịch từ hợp đồng đủ điều kiện; gia hạn/trả/hỗ trợ từ kho đang thuê; thông báo chuyển khoản/hỗ trợ thanh toán từ hóa đơn. Tránh yêu cầu khách tự nhập mã dữ liệu liên quan hoặc chọn nhầm hồ sơ.
- Lịch hẹn kiểm tra đủ hợp đồng cùng yêu cầu, không có lịch đang chờ khác, cửa sổ giao của kỳ thuê, tương lai và UTC+7; gửi timestamp UTC. Gia hạn dùng số tháng và kế hoạch thanh toán được BE hỗ trợ; trả kho chặn trước hạn và khi đang chờ gia hạn/đã có yêu cầu trả.
- Chuyển kho của Customer đi qua Support Request; không gọi API Manager hoặc tự đặt ra `/customer/transfers` khi BE không cung cấp.
- Hóa đơn có thông tin ngân hàng từ cấu hình BE, gửi thông báo chuyển khoản thực tế có kiểm tra số dư và xác nhận, theo dõi yêu cầu chờ đối chiếu, mở VNPay qua trình duyệt hệ thống. Không tự đánh dấu hóa đơn PAID, không tạo thanh toán demo. URL thanh toán được kiểm tra HTTPS và miền VNPay trước khi mở.
- Bảng đối chiếu gia hạn Manager được giữ; Admin giữ đúng hai mục. Liên kết hồ sơ liên quan chỉ mở các route có thật trong vai trò hiện tại.
- Thêm nhãn màn hình tiếng Việt, phân màu trạng thái, nội dung đối chiếu trước thao tác và phần chi tiết có thể mở/thu gọn; hiện/ẩn mật khẩu; hỗ trợ bàn phím trong form; nền/tiêu đề theo giao diện sáng nhất quán.
- Có đường trở về tổng quan khi URL không tồn tại; dashboard Customer/Staff vẫn cho mở menu và tài khoản khi dữ liệu thống kê lỗi. Khi quay lại ứng dụng từ nền, các tài nguyên đang theo dõi được tải lại.
- Android: kiểm tra ô nhập native, chuyển focus Email → Mật khẩu và hiện/ẩn mật khẩu. Giữ cơ chế TextInput chuẩn; lệnh ADB bơm cả chuỗi quá nhanh không được dùng để kết luận khả năng nhập của người dùng.

## Thông tin cơ sở

Người dùng cho phép đặt thông tin minh họa. Footer sử dụng một địa chỉ cơ sở, giờ làm việc, email miền `.example` và số điện thoại minh họa, có nhãn rõ ràng. Không tạo liên kết gọi/gửi thư tới thông tin minh họa.

Các giá trị tập trung trong `FE/src/config/facility.ts`. Có thể cung cấp thông tin thật bằng `VITE_FACILITY_NAME`, `VITE_FACILITY_ADDRESS`, `VITE_FACILITY_PHONE`, `VITE_FACILITY_EMAIL`, `VITE_FACILITY_HOURS` (xem `.env.example`). Đây là cấu hình thông tin công khai của FE, không phải màn cấu hình Admin và không đổi cấu hình BE.

## Kiểm chứng

- FE: build production và lint; hai regression có sẵn `test:portal` / `test:roles`. Bổ sung assertion chống tái diễn việc ẩn hợp đồng/hóa đơn và mất nút thanh toán ở 390px.
- Mobile: TypeScript, Expo lint; export web, Android/Hermes và iOS/Hermes. Export bundle không phải ký/phát hành APK/IPA.
- Kiểm thử mobile bằng bản web Expo của cùng mã nguồn: 12 danh sách Customer, các luồng thao tác Customer/Staff, 16 tổ hợp role/workspace, Admin hai mục và URL vận hành cũ. 15 thao tác ghi được giả lập; không ghi database thật; không có request nhầm vai trò hoặc lỗi JavaScript trong các luồng kiểm thử.
- Kiểm thử riêng web: trang chủ desktop/390px, link đến mục sau tải dữ liệu, trạng thái menu, hiện/ẩn mật khẩu, bảng/thẻ hợp đồng–hóa đơn, phân trang và focus/Escape trong modal. Không gửi thanh toán thật.
- Bộ regression web có 17 và 20 thao tác ghi giả lập. Cộng các luồng mobile là **52 thao tác ghi giả lập**. Không tạo tài khoản hay bản ghi nghiệp vụ để kiểm thử.
- Kiểm tra trực quan ảnh trang chủ, màn hình thanh toán 390px và danh sách công việc mobile. Đã xóa các script, XML/ảnh và export tạm sau kiểm tra; giữ hai script regression sẵn có đã cập nhật.
- Native Android: kiểm tra nhập liệu và hiện/ẩn mật khẩu bằng Expo Go trên emulator; không gửi tài khoản/mật khẩu minh họa đến API đăng nhập. Không kiểm thử tương tác trên thiết bị iOS thật trong lượt này.

## Giới hạn còn lại theo BE

- Chưa có API/schema nhập–xuất **hàng khách**, phụ lục gia hạn có phiên bản/chữ ký, cấu hình hệ thống có lịch sử hoặc danh bạ Staff cho Manager.
- Danh mục loại kho/bảng giá/kho vật lý chỉ được xem ở các phần BE chưa có API chỉnh sửa. Không thêm form lưu giả để thay thế.
- Cận trên ngày bàn giao và chặn hoàn tất trước giờ hẹn vẫn cần được bảo vệ đầy đủ ở server; các chặn trên client không thay phân quyền/kiểm tra BE.
- Các bundle còn cảnh báo kích thước tệp (đặc biệt 3D) và công cụ Expo/Hermes có cảnh báo môi trường; không coi đó là lỗi nghiệp vụ đã phát sinh.
- Kiểm thử mô phỏng không chứng nhận giao dịch ngân hàng/VNPay thật, email gửi thật, mọi tình huống đồng thời hoặc mọi cấu hình thiết bị. Không tuyên bố ba module BE chưa có đã hoàn tất.

## Chạy project

- Web: `http://127.0.0.1:5173/`.
- Đăng nhập web: `http://127.0.0.1:5173/account/login`; đăng xuất về đây.
- BE health: `http://127.0.0.1:3000/api/health`.
- Mobile web: `http://127.0.0.1:8081/login`.
- Expo Go cùng mạng hiện tại: `exp://192.168.1.6:8081`; API dùng IP LAN của máy chạy BE. Đổi mạng cần cập nhật biến môi trường khi chạy Expo. Không ghi đè `.env` BE hoặc chạy seed/migration để mở giao diện.
