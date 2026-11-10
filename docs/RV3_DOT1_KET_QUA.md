# RV3 đợt 1 — Staff Web và Backend

## Đã chỉnh

- Phiếu nhập/xuất mới chờ Manager phân công. Không còn tự giao theo người phụ trách kho khi tạo phiếu hoặc đọc danh sách. Phiếu đã được giao trước đây được giữ nguyên.
- Chỉ Staff được giao mới hoàn tất phiếu. Manager xem và phân công, không hoàn tất thay Staff.
- Mỗi dòng bắt buộc nhập số lượng thực tế; không lấy số yêu cầu làm mặc định. Chấp nhận số 0 có chủ đích; nếu khác yêu cầu phải ghi lý do chênh lệch.
- Cập nhật tồn và hoàn tất trong transaction; kiểm tra tồn xuất, dòng thiếu/trùng/sai phiếu, quyền Staff và hợp đồng hoạt động. Gửi lại phiếu đã hoàn tất không cập nhật tồn lần nữa.
- Customer tự vận chuyển, bốc dỡ; Staff hướng dẫn, kiểm đếm và xác nhận. Không thêm phí vận chuyển.
- Trang Hàng đang lưu cho Staff/Manager có tìm kiếm, phân trang và lọc kho vật lý; hiển thị khách hàng, hợp đồng, mã kho, tầng/khu, mặt hàng và tồn. Staff chỉ đọc phạm vi phiếu được giao hoặc kho phụ trách.
- Vị trí hiện tại lấy từ phân bổ của hợp đồng, theo thay đổi khi chuyển kho. Phiếu hoàn tất mới lưu snapshot vị trí tại thời điểm hoàn tất; phiếu cũ không có bằng chứng vị trí hiển thị chưa ghi nhận, không suy đoán từ vị trí hiện tại.
- Bàn giao mặc định người nhận là Customer của hợp đồng, tên do BE lấy. Người được ủy quyền phải nhập tên và căn cứ ủy quyền. Lưu báo cáo cùng Staff và thời gian hoàn tất. Chặn hoàn tất mới chỉ bằng ghi chú; báo cáo cũ vẫn đọc được.
- Điều chỉnh bổ sung: Staff có thể xác nhận bàn giao thực tế trước giờ hẹn dự kiến, trong giới hạn từ 3 ngày trước ngày thuê đến trước ngày hết hạn. Đã bỏ ô thông báo chờ giờ hẹn và điều kiện khóa nút trên Web, đồng bộ kiểm tra thời gian ở BE/Mobile. Không kích hoạt quyền sử dụng trước ngày bắt đầu thuê.
- Đơn vị mặt hàng mới dùng danh mục chung: cái, thùng, kiện, bộ, túi, hộp, cuộn. Mặt hàng cũ được dùng tiếp đơn vị cũ.
- Mobile chỉ cập nhật tương thích nhập số thực tế, đơn vị và người nhận bàn giao, không thiết kế lại giao diện trong đợt này.
- Theo yêu cầu bổ sung: bỏ nút Quét VNPay QR trên Customer Web, giữ Thanh toán VNPay. Không thay đổi xử lý thanh toán BE.

## Nhóm file chính

- BE: stock-movements service/controllers/query/module, unit-staff service, appointments service/handover-report và các unit test.
- FE: StockMovementsPage, OperationalStoredItemsPage, StaffActions, router, types/stock, utils/stock, ItemUnitSelect, utils/item-units; CustomerPaymentsPage cho yêu cầu bỏ nút QR.
- Mobile: stock/screens, stock/validation, stock/item-units, portals/actions.

## API và database

- Thêm GET `/api/staff/stored-items` và `/api/manager/stored-items`; hỗ trợ `page`, `limit`, `search`, `storageUnitId`.
- Dữ liệu phiếu thêm `currentStorageUnit` và `storageUnitAtCompletion`. API tồn Customer vẫn trả array tương thích.
- Hoàn tất nhập/xuất phải gửi toàn bộ `lines: [{lineId, actualQty}]`; chênh lệch cần `note`.
- Báo cáo bàn giao hỗ trợ `recipientType: CUSTOMER | AUTHORIZED` và `authorizationBasis`; báo cáo dạng cấu trúc cũ không có recipientType mặc định CUSTOMER.
- Migration mới `20261110090000_stock_movement_location_snapshot` thêm cột JSONB nullable, không sửa tồn hay tự backfill lịch sử.

**Chưa áp dụng migration.** Trước khi chạy BE mới với database mục tiêu, nhóm cần kiểm tra các migration đang chờ rồi thực hiện trong BE:

```powershell
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
```

Lệnh deploy có thể áp dụng tất cả migration đang chờ. Không reset/seed database. Chưa commit, push hoặc deploy trong tác vụ này.

## Kiểm tra thủ công sau migration

1. Customer tạo phiếu: trạng thái chờ phân công, tồn chưa đổi.
2. Manager phân công Staff; Staff khác không được xử lý.
3. Staff nhập số thực tế từng dòng. Thử để trống, số 0, số khác yêu cầu và xuất quá tồn; chỉ dữ liệu hợp lệ có lý do khi cần mới hoàn tất.
4. Gửi lại thao tác hoàn tất: tồn không đổi thêm. Manager xem kết quả; Customer xem tồn đã cập nhật.
5. Mở Hàng đang lưu, lọc theo kho; kiểm tra mã kho/tầng/khu thực tế. Sau chuyển kho hoàn tất, vị trí hiện tại đổi, snapshot phiếu trước giữ nguyên.
6. Bàn giao: tên Customer sẵn có; chọn ủy quyền phải nhập tên/căn cứ. Hoàn tất lưu người nhận, Staff, thời gian và báo cáo.
7. Customer Web chỉ còn nút VNPay thường, không còn nút Quét VNPay QR.

## Phạm vi kiểm chứng

- Đã chạy BE build/lint và unit test giả lập transaction/phân quyền, báo cáo bàn giao, tồn, vị trí, chuyển kho và kích hoạt theo lịch.
- Đã chạy FE build/typecheck, lint; Mobile typecheck; script kiểm tra validation FE/Mobile và danh mục đơn vị.
- Unit test dùng mock, không thay thế kiểm thử transaction đồng thời trên PostgreSQL thật.
- Chưa kiểm thử xuyên suốt trên trình duyệt/điện thoại hoặc database dùng chung; chưa xác nhận bản deploy.
- Hệ thống hiện chưa có PDF biên bản bàn giao riêng. Báo cáo bàn giao vẫn lưu/đọc bằng handoverNote; không tuyên bố đã có PDF.
