# Quyền cơ sở của Staff và Manager

FACILITY_STAFF và FACILITY_MANAGER có tối đa một FacilityAccess đang hiệu lực. Một cơ sở có thể có nhiều người của mỗi vai trò. Tài khoản chưa có quyền không vào nghiệp vụ. Manager giao hoặc chuyển giao từng việc. Admin quản lý quyền và điều chuyển. BOM quản lý chính sách và cơ sở theo quyền kinh doanh. Customer vẫn thuê tại nhiều cơ sở.

Admin điều chuyển sau khi Manager cơ sở cũ bàn giao việc thực tế. Giữ lịch, biên bản, phân bổ, hóa đơn, dữ liệu đã ký và audit. Người cũ phải đăng nhập lại. Với Manager, trách nhiệm tồn tại tại cơ sở. Nếu đây là Manager hoạt động cuối cùng và cơ sở còn mở, đang đóng, hoặc còn nghĩa vụ, cấp quyền cho người thay thế trước.

Di dời do cơ sở đóng cửa đi qua Manager nguồn, Staff nguồn, Manager đích, khách, và hai đầu bàn giao. Manager đích chấp nhận phương án trước khi khách đồng ý và trước khi giữ ô. Kho đích bị chặn sau bàn giao nguồn thì dừng đầu nhận, giữ các allocation và dấu vết, ghi vướng mắc. Manager phối hợp xác minh và chỉ tiếp tục khi kho đủ an toàn. Nếu không thể dùng kho đích sau khi đã bàn giao nguồn, cần chốt phương án tài sản và quyền truy cập trước khi viết xử lý thay ô, hủy, hoặc hoàn tiền. Chuyển kho thường vẫn cùng cơ sở.

## Phục hồi khi Prisma báo P3009

Giữ nguyên file migration. Khi cấp quyền đã được xử lý và PostgreSQL xác nhận chưa có index mới hay cột mới, thêm cờ `--recover-single-facility-migration` vào lệnh rehearsal:

```sh
node scripts/foundation-db/backup-rehearse.mjs --recover-single-facility-migration
```

Có thể truyền thêm đường dẫn manifest riêng để dùng lại đúng bản backup. Khi được duyệt, ghi tên `20261126000100_single_facility_and_relocation_decision` vào trường `recoverFailedMigration` của approval và thêm cùng cờ vào lệnh `release:migrate` trong CUTOVER.md. Công cụ kiểm tra snapshot khớp database khi writer đã dừng, rồi dùng Prisma đánh dấu đúng lần thất bại là rolled back và áp dụng migration. Lần thất bại vẫn được lưu.

## Cutover sau khi được duyệt

1. Đối chiếu đúng Neon production, xác nhận lại toàn bộ grant hiệu lực, tài khoản hoạt động, và trách nhiệm mở theo cơ sở. Bản audit ghi Manager hiện tại có NESTBOX-DEMO và NB-THUDUC. Phương án dự kiến giữ Manager hiện tại ở NESTBOX-DEMO. Chuẩn bị Manager riêng cho NB-THUDUC và Staff trước khi bắt đầu việc tại chỗ.
2. Trước khi nâng schema, cấp quyền cho Manager tiếp quản qua quy trình Admin được duyệt. Xác minh người mới có thể xử lý tại NB-THUDUC, ghi nhận bàn giao trách nhiệm, rồi thu hồi grant NB-THUDUC dư của Manager cũ. Giữ lịch sử grant và thu hồi phiên. Kiểm tra không còn tài khoản nhiều grant và không còn grant hiệu lực của vai trò khác.
3. Chốt cửa sổ cutover theo CUTOVER.md. Dừng writer, tạo backup đầy đủ, kiểm tra phục hồi, chạy migration rehearsal trên bản phục hồi và kiểm tra lại lịch sử, số liệu nghiệp vụ, index và cột quyết định kho đích. Kiểm kê hồ sơ di dời chưa xác nhận, trường hợp đã giữ ô cũ, và tình trạng Frontend đang phục vụ.
4. Nâng schema và triển khai Backend cùng Web phiên bản tương thích. Xác minh người cũ không mở được hồ sơ cơ sở cũ, hai Manager còn truy cập đúng phạm vi, không có nhiệm vụ vật lý mất người phụ trách. Kiểm tra lịch Customer, OTP, VNPay, hồ sơ trả và quyết toán, ảnh/PDF, thông báo và các mốc bàn giao di dời trước khi đưa dịch vụ trở lại.
5. Nếu cần khôi phục sau khi đã có ghi nhận mới, bảo toàn giao dịch phát sinh và dùng phương án khôi phục đã rehearsal theo CUTOVER.md. Không xóa audit, grant lịch sử hoặc dữ liệu đã ký để vượt preflight.
