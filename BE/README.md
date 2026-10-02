# Backend WDP — tài khoản và đồng bộ dữ liệu với FE

## Chạy khi chưa có PostgreSQL

Cần Node.js tương thích với dependencies trong package-lock (các công cụ hiện yêu cầu Node 22.22.3+ thuộc nhánh 22 hoặc 24.15+ thuộc nhánh 24).

Trong thư mục BE:

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run start:dev
```

Không ghi đè `.env` nếu đã có. `prisma:generate` chỉ sinh mã từ schema, không tạo hoặc sửa bảng.
Cấu hình mặc định `USER_STORAGE=memory` không cần DB. API chạy ở `http://localhost:3000/api`.
Chế độ memory không được phép dùng khi `NODE_ENV=production`.

## API đã bổ sung/hoàn thiện

| Method | Endpoint | Quyền | Chức năng |
| --- | --- | --- | --- |
| POST | /api/auth/register | Công khai | fullName, email, phone, password; chỉ tạo CUSTOMER |
| POST | /api/auth/login | Công khai | email, password; trả token và user |
| GET | /api/auth/me | Bearer token | Thông tin tài khoản hiện tại |
| POST | /api/auth/logout | Bearer token | Thu hồi phiên hiện tại, trả 204 |
| GET | /api/users?page=1&limit=20 | ADMIN | Danh sách người dùng; limit tối đa 100 |

Gửi `Authorization: Bearer <token>` cho API cần đăng nhập.
Đăng ký chuẩn hóa email, băm mật khẩu bằng scrypt có salt riêng và không trả hash cho client.
Mật khẩu dài 8–128 ký tự; giữ nguyên khoảng trắng trong mật khẩu.
Phiên có thời hạn tuyệt đối 8 giờ. Token được băm trước khi giữ trong bộ nhớ.
Các quyền hiện khớp schema: CUSTOMER, STAFF, MANAGER, ADMIN. RolesGuard kiểm tra vai trò ở backend.
Public registration không cấp quyền nhân viên/admin. Chưa có API đổi vai trò hoặc tạo admin; admin đầu tiên cần quy trình cấp tài khoản có kiểm soát sau khi đối chiếu DB.

## Khi nhận được thông tin DB

1. Đối chiếu bảng thực tế với `prisma/schema.prisma`, đặc biệt User và enum UserRole. Không chạy db push, migrate reset hoặc migration lên DB nhóm trước khi đối chiếu.
2. Điền DATABASE_URL trong `.env`, đặt `USER_STORAGE=prisma`.
3. Backend sẽ kết nối DB lúc khởi động; lỗi kết nối được báo, không tự chuyển về memory.
4. Tài khoản được đọc/ghi qua Prisma. Hash mới có định dạng `scrypt$salt$hash`; tài khoản cũ dùng định dạng khác cần phương án chuyển đổi hoặc đặt lại mật khẩu.

Chưa kiểm chứng kết nối hoặc truy vấn trên PostgreSQL thực tế do chưa có quyền truy cập.
Không sửa schema hoặc tạo migration trong giai đoạn này.

## Kiểm thử

```powershell
npm run build
npm run lint
npm run test
node scripts/auth-smoke.mjs
```

Smoke test dùng backend đã build, cổng ngẫu nhiên trên localhost và kho dữ liệu trong bộ nhớ riêng; không đụng DB thật.
Kiểm tra HTTP đăng ký, đăng nhập, 401/403, admin đọc danh sách, tạo reservation, chặn trùng lịch và thu hồi token.

## Giới hạn còn lại

- Phiên đăng nhập vẫn trong bộ nhớ, mất sau restart và chưa chia sẻ giữa nhiều tiến trình.
- Booking/inquiry vẫn là demo trong bộ nhớ kể cả khi USER_STORAGE=prisma; danh mục kho vẫn là dữ liệu mẫu.
- Chưa triển khai đầy đủ quản trị người dùng, phân quyền theo cơ sở, giới hạn số lần đăng nhập, quên mật khẩu, xác minh email và nhật ký hoạt động.
- Vai trò Business Operations Manager trong đề tài chưa có trong schema hiện tại; cần thống nhất mô hình với nhóm.
- Hợp đồng, giá, thanh toán, phân kho, check-in/check-out, gia hạn và báo cáo là các giai đoạn tiếp theo.

Ưu tiên kế tiếp: thống nhất cấu trúc DB → danh mục/kho thực tế → lưu booking/inquiry → nhân viên xử lý yêu cầu.

## Danh mục và tìm kho dùng chung với FE

- `GET /api/booking/catalog`: products, sizes, approvedDurations, addons và chính sách báo giá. Nguồn dữ liệu mẫu duy nhất nằm ở `src/modules/storage/storage.catalog.ts`; FE không còn giữ danh sách sản phẩm riêng.
- `GET /api/storage?size=small&type=standard&date=2026-11-01&duration=1`: trả `{ items, total, checkedPeriod }`. size: all/locker/small/medium/large; type: all/standard/climate; duration: 1/3/6/12/flexible. Dùng ngày hiện tại hoặc tương lai khi thử.
- Có ngày và thời hạn cụ thể: loại kho trùng reservation hoặc đang chiếm dụng khỏi kết quả. Không đủ thời gian hoặc duration=flexible: chỉ lọc danh mục, checkedPeriod=false.
- `GET /api/storage/:id`: chi tiết một sản phẩm; mã không tồn tại trả 404.
- API tìm kiếm và đặt kho sử dụng cùng BookingService trong một tiến trình. Inquiry không chặn kho; reservation chặn khoảng `[startDate, endDateExclusive)`.
- Dữ liệu tài khoản/reservation/inquiry được chia sẻ giữa các trình duyệt truy cập cùng backend nhưng chưa bền vững qua restart ở chế độ memory.

FE tải danh mục qua API, giữ bộ lọc khi đi từ danh sách sang chi tiết/đặt kho, xác minh lại khả dụng khi khôi phục bước xác nhận. Trang yêu cầu của tôi và kết quả tìm kiếm có nút làm mới, đồng thời tải lại khi cửa sổ được focus. Đây là cập nhật theo yêu cầu, chưa phải WebSocket thời gian thực.

Trang xác nhận luôn tải bản ghi từ API theo mã, chọn đúng endpoint inquiry/reservation ngay cả khi trạng thái đăng nhập thay đổi. Không dùng navigation state như bản ghi đáng tin cậy. API reservation vẫn kiểm tra chủ sở hữu.

Kiểm chứng giai đoạn này: 22 unit tests; HTTP smoke bao gồm catalog, bộ lọc ngày, quyền sở hữu và chặn trùng. Kiểm tra trình duyệt local: gửi inquiry, tải lại xác nhận, đăng nhập và xem reservation theo khoảng ngày, mở inquiry sau đăng nhập, tìm lại cùng kỳ có reservation trả 0 kho.
