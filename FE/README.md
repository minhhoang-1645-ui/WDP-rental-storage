# Frontend WDP

Kết quả hoàn thiện UI/UX và luồng web/mobile theo API hiện có: [FULL_REVIEW_2026-10-16.md](./FULL_REVIEW_2026-10-16.md). Có hướng dẫn thông tin cơ sở, phân quyền, kiểm thử và phần vẫn cần BE.

Đối chiếu góp ý giảng viên ngày 16/10 (dịch vụ, bàn giao, duyệt gia hạn và đề xuất phần cần BE/schema): [TEACHER_REVIEW_2026-10-16.md](./TEACHER_REVIEW_2026-10-16.md).

Phạm vi hiện tại sau merge và xác nhận của người dùng ngày 15/10/2026: [MERGE_AUDIT_2026-10-15.md](./MERGE_AUDIT_2026-10-15.md). Giao diện web/mobile được làm mới theo yêu cầu bổ sung, giữ API và nghiệp vụ: [UI_REFRESH_2026-10-15.md](./UI_REFRESH_2026-10-15.md). Tài liệu ngày 13–14/10 là lịch sử; phạm vi Admin bảy mục trong đó đã được thay thế.

Giao diện React/TypeScript/Vite dùng API NestJS. Cần chạy cả BE và FE để xem danh mục và đặt kho.

## Chạy local

Terminal 1, chạy backend theo cấu hình hiện có trong BE/README.md. Portal manager/admin cần backend và PostgreSQL hoạt động. Không chạy seed hoặc migration chỉ để xem giao diện.

```powershell
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

## Portal manager và admin

Đăng nhập tại `/account/login` hoặc `/portal/login`; đăng xuất luôn về `/account/login`. Manager dùng `/manager`; Admin dùng `/admin`. Mở URL khác vai trò sẽ về trang chủ của vai trò đang đăng nhập.

Manager đã nối các API kho, khách hàng, tư vấn, đặt kho, bàn giao, hợp đồng, hóa đơn, khoản thu, gia hạn, kho đang thuê, trả kho, hỗ trợ, chuyển kho, bảo trì và quyết toán cọc. Phân công nhân viên ở `/manager/assignments`, dùng nhiệm vụ hỗ trợ và bảo trì hiện có.

Admin có đúng hai mục: Tổng quan và Quản lý tài khoản. Tạo STAFF/MANAGER, xem hồ sơ và kích hoạt/vô hiệu hóa nằm trong quản lý tài khoản. URL cũ `/admin/facility/*` về `/admin`; không mở menu vận hành Manager trong Admin.

Giới hạn API và kiểm tra sau merge nằm trong [MERGE_AUDIT_2026-10-15.md](./MERGE_AUDIT_2026-10-15.md). Các báo cáo Manager/Admin trước ngày này được giữ làm lịch sử, không dùng để khôi phục các mục Admin đã bỏ.

## Kiểm tra

Rà soát cả bốn vai trò, đường dẫn, chức năng được phép và phần còn thiếu: [ALL_ROLES_VERIFICATION.md](./ALL_ROLES_VERIFICATION.md). Staff sử dụng API `/staff/*` cho bàn giao, trả/kiểm tra, hỗ trợ, bảo trì và hoàn tất chuyển kho; Customer giữ `/customer/*`. Không coi guard giao diện là thay thế phân quyền backend.

```powershell
npm run build
npm run lint
```

Kiểm thử browser cho portal (API được chặn và trả fixture, không ghi database thật):

```powershell
$env:WDP_PLAYWRIGHT_MODULE='<đường dẫn module playwright nếu không cài trong FE>'
$env:WDP_BROWSER_PATH='<đường dẫn chrome.exe hoặc msedge.exe nếu không dùng browser của Playwright>'
npm run test:portal
npm run test:roles
```

Cần chạy FE trước khi kiểm thử. Có thể đổi URL bằng `WDP_FE_URL`; mặc định `http://127.0.0.1:5173`. Nếu npm shim trên máy bị lỗi, chạy trực tiếp:

```powershell
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node node_modules/oxlint/bin/oxlint
node scripts/portal-smoke.mjs
node scripts/roles-smoke.mjs
```

Ngày 14/10/2026 đã kiểm tra đăng nhập/API đọc thật và đăng xuất của hai tài khoản Admin/Manager mới do người dùng yêu cầu, trên FE, mobile web và Android. Các script, ảnh và dữ liệu UI tạo thêm để kiểm thử đã được dọn theo yêu cầu; giữ các bài kiểm thử portal/roles có sẵn trong repo. Mật khẩu không lưu vào mã nguồn.
