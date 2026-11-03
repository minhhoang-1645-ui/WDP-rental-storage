# Lịch sử đăng nhập và nhật ký hoạt động Admin

## Phạm vi

- Web: `/admin/login-history`, `/admin/activity`; liên kết từ sidebar và tổng quan.
- Mobile: hai màn tương ứng; tab **Nhật ký** mở hoạt động, có nút chuyển sang đăng nhập.
- API chỉ đọc: `GET /api/admin/audit-events`. Chỉ ADMIN có quyền; Customer/Staff/Manager bị từ chối.
- Phân trang 20 dòng trên giao diện, tìm tên/email/mã hồ sơ, lọc kết quả/vai trò/ngày. Khoảng ngày và thời gian hiển thị dùng UTC+7. Nhật ký sắp từ mới đến cũ.

## Dữ liệu được ghi

Migration `20261103000100_admin_audit_events` tạo bảng `AuditEvent` và enum/index mới. Không sửa dữ liệu thanh toán hoặc hợp đồng.

- Đăng nhập thành công/thất bại tại HTTP `POST /auth/login`, kể cả tài khoản bị khóa hoặc dữ liệu đăng nhập không hợp lệ.
- Đăng ký, đăng xuất và các mutation HTTP của người dùng đã xác thực thuộc danh sách nghiệp vụ trong `auditTarget`: tài khoản, danh mục/giá/kho, đặt kho, hợp đồng, gia hạn, bàn giao, hỗ trợ, bảo trì, chuyển/trả kho, nhập/xuất hàng, thu tiền/duyệt thông báo chuyển khoản/đối soát, quyết toán cọc và phân công.
- Lưu người thao tác lấy từ phiên server; không tin `actorId`/role do client gửi. Thành công đăng nhập/đăng ký lấy identity từ kết quả AuthService. Thất bại chỉ lưu email đã thử khi email hợp lệ, không khẳng định danh tính/vai trò người nhập sai.
- Lưu thời điểm, kết quả/HTTP status, mã đối tượng và route template. IP là địa chỉ socket kết nối trực tiếp; sau reverse proxy có thể là IP proxy, không tự tin header X-Forwarded-For.
- Không lưu body, query string, response, password/hash, token/header Authorization, OTP, ảnh chữ ký hoặc thông tin thẻ. Không có API chỉnh sửa/xóa nhật ký. Snapshot danh tính không phụ thuộc FK tới tài khoản, nên không mất theo thao tác sửa/xóa tài khoản.

## Giới hạn cần hiểu đúng

- Chỉ ghi sự kiện phát sinh sau khi migration và code mới được đưa vào sử dụng. Không tạo lại lịch sử cũ hoặc dữ liệu demo giả.
- Interceptor chạy sau guards: yêu cầu bị AuthGuard/RolesGuard chặn trước controller không nằm trong nhật ký này. GET/polling không ghi để tránh tạo nhật ký cho mọi lần xem màn hình.
- Không tự ghi công việc nền, script hoặc callback ngân hàng công khai. Đây là lịch sử thao tác HTTP của người dùng, không phải sổ cái thay thế Payment hay nhật ký đầy đủ của hệ điều hành/hạ tầng.
- Ghi log là best effort: nếu storage lỗi thì không đảo ngược giao dịch đã hoàn tất hay chặn đăng nhập. BE ghi `audit_write_failed` với mã lỗi an toàn; có thể thiếu sự kiện trong thời gian storage lỗi. Không lưu đệm các sự kiện lỗi để phát lại. API tra cứu trả 503 khi storage chưa sẵn sàng, không giả trả danh sách trống.

## Bật tính năng

Code đã có migration, **chưa apply lên DB nhóm**. Người vận hành cần kiểm tra DB đích và danh sách migration pending trước khi chạy:

```powershell
cd BE
npx prisma migrate status
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
```

`migrate deploy` áp dụng tất cả migration đang pending, không chỉ migration nhật ký. Sau đó khởi động lại/deploy BE và dùng bản web/mobile mới. Thử đăng nhập đúng/sai, tạo/sửa tài khoản trong môi trường test rồi kiểm tra bằng Admin. Không cần seed. Lịch sử trống trước lần thử mới là bình thường.

## Kiểm tra

- `BE: npx vitest run src/modules/audit/audit.spec.ts`: service/interceptor và HTTP thật trên Nest với user in-memory và audit DB mock; không ghi DB nhóm.
- `FE: node scripts/admin-audit-smoke.mjs`: mock toàn bộ API; thử nhóm nhật ký, lọc, phân trang, chi tiết và lỗi storage.
- Build/lint BE và web; typecheck/lint và Android bundle cho mobile. Các kiểm tra này không thay cho nghiệm thu với PostgreSQL đã chạy migration và emulator/thiết bị thật.
