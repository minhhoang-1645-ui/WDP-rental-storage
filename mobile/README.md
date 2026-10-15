# WDP Storage Mobile

Ứng dụng React Native/Expo dành cho **Customer, Staff, Manager và Admin** của WDP Storage. BE và database được giữ nguyên.

## Chức năng hiện có

- Đăng nhập bằng API `POST /api/auth/login` và khôi phục phiên bằng `GET /api/auth/me`.
- Lưu access token an toàn bằng Expo SecureStore trên thiết bị.
- Customer: tổng quan, kho đang thuê, hóa đơn/thanh toán và tài khoản.
- Staff: tổng quan công việc, lịch hẹn, danh sách nhiệm vụ và tài khoản.
- Manager: tổng quan; 18 phân hệ danh sách/chi tiết; tìm/lọc dữ liệu; kiểm tra khả dụng; duyệt đặt kho, gia hạn và chuyển kho; xử lý tư vấn/hỗ trợ; tạo, phân công và nghiệm thu bảo trì; ghi nhận khoản thu, đối chiếu chuyển khoản, duyệt quyết toán/ghi nhận hoàn cọc; danh mục dịch vụ, giá và tồn kho; báo cáo vận hành.
- Admin: đúng hai nhóm theo bản merge mới và xác nhận ngày 15/10/2026: Tổng quan và Quản lý tài khoản. Tạo STAFF/MANAGER, xem hồ sơ và cập nhật ACTIVE/DISABLED dùng API thật trong quản lý tài khoản. Phân công nhân viên thuộc Manager.
- Tự động đưa người dùng vào đúng khu vực theo vai trò.
- Có trạng thái tải, lỗi, không có dữ liệu và thao tác tải lại cho các danh sách API.
- Danh sách tải đủ trang theo limit BE trả về. Khi quay lại màn hình, tải lại dữ liệu để phản ánh thao tác vừa lưu. Thao tác tài chính cần xác nhận thực tế; retry giữ idempotency key; chặn gửi lặp.

Phạm vi hiện tại và kiểm tra sau merge: [MERGE_AUDIT_2026-10-15.md](../FE/MERGE_AUDIT_2026-10-15.md). [MOBILE_FUNCTIONAL_AUDIT.md](./MOBILE_FUNCTIONAL_AUDIT.md) giữ lịch sử tích hợp; phạm vi Admin bảy mục trong báo cáo cũ đã được thay thế.

## Đường dẫn theo vai trò

- Customer: `/customer/*`; Staff: `/staff/*`.
- Manager: `/manager`, `/manager/<phân-hệ>`, `/manager/<phân-hệ>/<id>`, `/manager/reports`.
- Admin: `/admin`, `/admin/dashboard`, `/admin/users`, `/admin/users/new`, `/admin/users/:id`; `/admin/account` phục vụ tài khoản phiên và đăng xuất.
- Manager có `/manager/assignments` để xem, lọc công việc và mở chi tiết phân công hỗ trợ/bảo trì. URL Admin cũ về `/admin` hoặc `/admin/users`, không mở vận hành.
- Mở URL khác vai trò sẽ quay về khu vực của tài khoản; chưa đăng nhập thì về `/login`. Route `/unsupported` cũ chỉ chuyển về đúng role.

## Cấu hình Backend

Sao chép `.env.example` thành `.env`, sau đó đặt `EXPO_PUBLIC_API_URL` phù hợp:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```

- Android emulator: `http://10.0.2.2:3000/api`
- iOS simulator hoặc web trên cùng máy: `http://127.0.0.1:3000/api`
- Điện thoại thật: dùng IP LAN của máy chạy BE, ví dụ `http://192.168.1.10:3000/api`

Điện thoại và máy chạy BE cần ở cùng mạng. Backend cũng cần lắng nghe trên địa chỉ mạng LAN thay vì chỉ `localhost`.

## Chạy dự án

```bash
npm install
npx expo start
```

Sau đó nhấn `a` để mở Android emulator, `w` để mở web, hoặc quét mã QR bằng Expo Go.

Máy ít RAM có thể chạy `npx expo start --go --web --lan --port 8081 --max-workers 2`. Dùng `npm ci` khi cài từ lockfile. Có thể đặt TEMP/TMP trong một thư mục trên ổ còn dung lượng trước khi chạy Metro.

Mobile web dùng [chế độ SPA `web.output: single` của Expo](https://docs.expo.dev/versions/v57.0.0/config/app/#output), phù hợp các route động được xác thực ở client. Khi host thư mục `dist`, cần fallback các URL không phải asset về `index.html`; không xuất trang hồ sơ theo dữ liệu người dùng.

## Kiểm tra mã nguồn

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
npx expo export --platform web
```

Các route nằm trong `src/app`, phần gọi API nằm trong `src/services`, và dữ liệu đăng nhập được quản lý trong `src/auth`.

Ngày 14/10/2026 đã kiểm tra đăng nhập và đăng xuất thật của Admin/Manager trên mobile web và Android Expo Go; kiểm tra Email → Tiếp theo → Mật khẩu → Done bằng bàn phím Android. Form dùng TextInput của React Native, chuẩn hóa email, kiểm tra dữ liệu bắt buộc và gửi đúng mật khẩu vừa nhập. Đã rà soát các trang danh sách/chi tiết, liên kết và phân quyền; kết quả trong MOBILE_FUNCTIONAL_AUDIT.md. Các script và tệp tạm phục vụ kiểm thử đã được dọn theo yêu cầu, không lưu mật khẩu vào mã nguồn. Hai tài khoản mới được giữ lại vì là tài khoản người dùng yêu cầu tạo.
