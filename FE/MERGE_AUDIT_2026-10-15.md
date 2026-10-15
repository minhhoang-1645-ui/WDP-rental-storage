# Rà soát sau merge ngày 15/10/2026

Mốc đối chiếu: `b0178bb` trên nhánh `luan`, so với `73afad4`. Đã đọc thay đổi BE, DTO/guards, dịch vụ nghiệp vụ, schema và các client liên quan; đối chiếu với `WDP_STORAGE_MASTER_SPEC_FOR_AI.md`. Không chỉnh mã BE, cấu hình bí mật, schema, seed, migration hoặc dữ liệu nghiệp vụ.

## Phạm vi người dùng xác nhận

Admin chỉ có **Tổng quan** và **Quản lý tài khoản**. Tạo STAFF/MANAGER, xem chi tiết và kích hoạt/vô hiệu hóa nằm trong quản lý tài khoản. Không tự vô hiệu hóa tài khoản phiên đang dùng. Bảy mục Admin trong tài liệu trước đây không còn là yêu cầu hiện hành.

Manager giữ các nghiệp vụ vận hành của bản merge; **Phân công nhân viên** thuộc Manager. Web dùng `/manager/assignments`; mobile cũng có trang này và mở chi tiết hỗ trợ/bảo trì để phân công bằng API hiện có. Không tự thêm API danh bạ nhân viên mà BE chưa cung cấp.

## Thay đổi client

- Tách guard và đường dẫn Admin/Manager. URL Admin cũ về tổng quan hoặc tài khoản; `/admin/facility/*` không còn dựng workspace vận hành. Customer/Staff giữ khu vực riêng. Đây là kiểm soát điều hướng client; không thay đổi quyền API phía BE.
- Mobile đồng bộ hai mục Admin, thống kê từ tài khoản thật, phân trang đầy đủ. Form tạo tài khoản dùng chung cơ chế kiểm tra/gửi dữ liệu và TextInput React Native hiện có; bỏ triển khai portal trùng lặp không còn được gọi.
- Loại thao tác tạo thanh toán demo khỏi FE. Giữ QR chuyển khoản và VNPay thật; xác nhận chuyển khoản thường vẫn cần mã giao dịch ngân hàng. Bản ghi mô phỏng có sẵn được ghi nhãn, không cho xác nhận thành khoản thu từ client; không xóa dữ liệu database.
- Lịch bàn giao nhiều kho lấy ngày bắt đầu muộn nhất trong các hợp đồng, khớp kiểm tra mới của BE. Giữ thay đổi giao diện và các chức năng dịch vụ/báo giá của bản merge.
- Không tạo thêm tài khoản hoặc bản ghi nghiệp vụ để kiểm thử lần này; không lưu mật khẩu vào repo.

## Kiểm tra

- BE TypeScript biên dịch được sau khi cài dependency theo lockfile. Lệnh `npm ci` mặc định báo lệch peer dependency; `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` cài thành công, không sửa package/lockfile BE.
- Web: TypeScript, lint, production build; hai bài portal/roles có sẵn đạt. Kiểm tra 16 tổ hợp role/workspace không gọi API nhầm vai trò; các thao tác ghi trong regression được chặn bằng fixture, không ghi database thật.
- API thật: đăng nhập/đăng xuất Admin và Manager trên FE và mobile web; 54 lượt kiểm tra trang, không có lỗi JavaScript, không tạo tài khoản hoặc ghi nghiệp vụ.
- Mobile: TypeScript, Expo lint và export web đạt. Android Expo Go đăng nhập được cả Admin/Manager; Admin có hai mục, form tạo tài khoản nhập được bốn ô native và đã hủy; Manager tải được danh sách phân công từ BE.
- Kiểm tra bổ sung bằng API fixture: ngày bàn giao nhiều hợp đồng, không có nút tạo demo dù BE bật cờ demo, chặn xác nhận bản ghi mô phỏng trên web/mobile, tạo tài khoản mobile gửi đúng role/email/mật khẩu và mở đúng hồ sơ sau lưu. Một request tạo tài khoản được trả fixture; không tạo tài khoản thật.
- Script và tệp UI tạm tạo thêm để kiểm thử được dọn khi hoàn tất; giữ các regression có sẵn trong repo.

Các kiểm tra này không chứng nhận email giao dịch, thanh toán ngân hàng/VNPay thật, cạnh tranh đồng thời hoặc mọi nhánh nghiệp vụ trên dữ liệu sản xuất. Cảnh báo truy vấn `pg` thuộc BE chưa sửa theo yêu cầu giữ nguyên BE. Các API quản lý kho/bảng giá/quyền/cấu hình chưa tồn tại không được thay bằng lưu giả.

## Chạy trên máy hiện tại

- BE: `http://127.0.0.1:3000/api/health`.
- FE: `http://127.0.0.1:5173/account/login`.
- Mobile web: `http://127.0.0.1:8081/login`; Android emulator dùng Expo Go với `exp://10.0.2.2:8081`.
- Điện thoại thật cùng Wi-Fi: dùng IP LAN máy chạy BE cho `EXPO_PUBLIC_API_URL`, hiện là `http://192.168.1.6:3000/api`. Đổi mạng cần cập nhật biến môi trường và khởi động lại Expo. Không ghi đè `.env` BE/mobile để cố định IP máy cá nhân.

Lệnh kiểm tra và hướng dẫn chạy nằm trong `FE/README.md` và `mobile/README.md`. Các báo cáo trước ngày 15/10 được giữ để tra cứu lịch sử, không dùng làm phạm vi Admin hiện tại.
