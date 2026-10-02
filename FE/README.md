# Frontend WDP

Giao diện React/TypeScript/Vite dùng API NestJS. Cần chạy cả BE và FE để xem danh mục và đặt kho.

## Chạy local chưa cần PostgreSQL

Terminal 1, trong BE (lần đầu xem BE/README.md để cài dependencies và generate Prisma):

```powershell
$env:USER_STORAGE='memory'
$env:DATABASE_CONNECT_ON_STARTUP='false'
npm run start:dev
```

Terminal 2, trong FE:

```powershell
npm ci
npm run dev
```

Mở địa chỉ mà Vite hiển thị. Có thể chạy trực tiếp để cố định địa chỉ:

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

FE mặc định gọi `http://localhost:3000/api`. Nếu cần đổi, tạo `.env.local` theo `.env.example` rồi khởi động lại Vite. Nếu chạy khác port, cấu hình FRONTEND_URL của BE tương ứng.

## Dữ liệu đã nối

- Trang chủ, hướng dẫn kích thước, chi tiết kho và wizard dùng GET /booking/catalog.
- Trang tìm kho gọi GET /storage theo kích thước, loại, ngày và thời hạn; backend loại các kho trùng lịch.
- Wizard gọi /booking/availability, /inquiries hoặc /reservations. Khách đã đăng nhập dùng thông tin tài khoản đã xác thực.
- Trang xác nhận đọc lại bản ghi từ backend; hỗ trợ refresh và trạng thái đăng nhập thay đổi.
- Trang tài khoản đọc danh sách yêu cầu của chủ tài khoản; có trạng thái tải/lỗi/rỗng và nút làm mới.
- Không tự thay dữ liệu API lỗi bằng danh sách mẫu. Nút thử lại dùng để phục hồi khi backend hoạt động lại.

Bản thử nghiệm dùng dữ liệu trong bộ nhớ BE. Refresh trình duyệt không xóa yêu cầu, nhưng restart BE sẽ xóa dữ liệu memory. Chưa có thanh toán, hợp đồng hay quy trình vận hành đầy đủ.

## Kiểm tra

```powershell
npm run build
npm run lint
```

HTTP integration smoke ở `BE/scripts/auth-smoke.mjs` (chạy sau khi build BE).
