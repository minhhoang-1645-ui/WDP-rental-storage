# Quản lý loại kho, kho vật lý và bảng giá

Phạm vi: Manager trên web và mobile. Staff tiếp tục vận hành kho; Admin quản lý tài khoản. Không thêm vai trò, không thay schema.

## Thao tác

- **Loại kho & bảng giá**: thêm loại, sửa tên/nhóm/điều kiện/kích thước (cm), giá tháng (VND), hỗ trợ thuê ngày và ảnh.
- **Kho vật lý**: thêm mã kho vào loại, khai báo tầng/khu/hàng/vị trí; mở chi tiết để sửa.
- Cần tạo loại kho trước, sau đó tạo kho vật lý. Loại chưa có kho vật lý sẽ chưa có kho để phân bổ.
- Giá bắt buộc là số nguyên VND dương. Không thay giá thiếu bằng 0.
- Chỉ đổi giá/ảnh cho loại đã có hồ sơ. Đổi cấu trúc loại hoặc vị trí kho đã có hồ sơ vận hành bị chặn; cần tạo loại/kho mới.
- Không sửa tay AVAILABLE/RESERVED/OCCUPIED/MAINTENANCE. Các nghiệp vụ đặt, bàn giao, trả kho, bảo trì tiếp tục cập nhật trạng thái.
- Giá mới được PricingService sử dụng khi lập báo giá mới; không ghi lại snapshot báo giá, hợp đồng hay hóa đơn cũ.

## API

| Phương thức | Đường dẫn | Tác dụng |
| --- | --- | --- |
| GET | `/api/manager/storage-types` | Danh mục thô để sửa, danh sách cơ sở hiện có |
| POST | `/api/manager/storage-types` | Tạo loại kho |
| PATCH | `/api/manager/storage-types/:id` | Sửa loại kho; giữ nguyên mã và cơ sở |
| POST | `/api/manager/units` | Tạo kho vật lý, trạng thái mặc định AVAILABLE |
| PATCH | `/api/manager/units/:id` | Sửa kho vật lý chưa có hồ sơ |

Các PATCH yêu cầu `expectedUpdatedAt` lấy từ bản đọc mới nhất. Backend khóa hàng và dùng transaction Serializable; xung đột trả 409, không ghi đè dữ liệu mới. Các API danh sách/chi tiết kho và catalog công khai hiện có tiếp tục được dùng để tra cứu/đặt kho.

## Kiểm tra an toàn

- BE: `npx vitest run src/modules/manager/inventory-management.spec.ts` (mock database; không thay dữ liệu chung), `npm run build`, `npm run lint`.
- Web: `node scripts/inventory-management-smoke.mjs` khi FE chạy tại localhost:5173 (intercept toàn bộ API, không ghi DB), `npm run build`, `npm run lint`.
- Mobile: `npm run typecheck`, `npm run lint`; Android bundle đã export thành công. Cần kiểm tra thêm trên emulator với BE đã chạy code mới; export không thay cho thử thiết bị thực.

Không cần migration/seed. Không có chức năng xóa loại/kho đã có lịch sử.
