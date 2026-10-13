# WDP Storage Mobile

Ứng dụng React Native/Expo dành cho hai vai trò **Customer** và **Staff** của WDP Storage.

## Chức năng hiện có

- Đăng nhập bằng API `POST /api/auth/login` và khôi phục phiên bằng `GET /api/auth/me`.
- Lưu access token an toàn bằng Expo SecureStore trên thiết bị.
- Customer: tổng quan, kho đang thuê, hóa đơn/thanh toán và tài khoản.
- Staff: tổng quan công việc, lịch hẹn, danh sách nhiệm vụ và tài khoản.
- Tự động đưa người dùng vào đúng khu vực theo vai trò.
- Có trạng thái tải, lỗi, không có dữ liệu và thao tác tải lại cho các danh sách API.

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

## Kiểm tra mã nguồn

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
npx expo export --platform web
```

Các route nằm trong `src/app`, phần gọi API nằm trong `src/services`, và dữ liệu đăng nhập được quản lý trong `src/auth`.
