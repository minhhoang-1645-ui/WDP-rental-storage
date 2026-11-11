# Nhận diện hồ sơ Web và phân trang 5/10

## Đã thay đổi

- Customer đăng nhập gửi Reservation: điều hướng thẳng `/customer/reservations/{response.id}`. Lưu chính ID response theo tài khoản để nhận diện đơn vừa gửi. Luồng guest giữ cơ chế xác minh/claim hiện có, vốn đã mở đúng Reservation từ response claim.
- Chi tiết đơn dùng tên loại kho + số lượng làm tiêu đề, giữ mã đầy đủ với nút sao chép. PENDING chỉ hiển thị chờ xử lý, không báo đã giữ kho và không có nút thanh toán. CONFIRMED có liên kết hợp đồng/hóa đơn/lịch bàn giao lọc theo chính đơn. Đây là nút xem hồ sơ; điều kiện ký/thanh toán của trang đích giữ nguyên.
- Danh sách Customer sắp xếp `createdAt` mới nhất trước, rồi tìm/lọc và cuối cùng mới phân trang. Mã là thông tin phụ; có “Xem chi tiết”. Nhãn “Vừa gửi” chỉ hiện nếu ID trùng ID response đã lưu và `createdAt` thực tế nằm trong 15 phút vừa qua; không gắn nhãn theo vị trí dòng đầu.
- Staff: danh sách Reservation ưu tiên tên khách, loại kho, số lượng, ngày thuê, thời điểm tạo và trạng thái. Có bộ lọc nhanh PENDING; chỉ PENDING trong workspace Staff được ghi “Nhân viên kiểm tra ngoại lệ”. Đơn tự xác nhận không bị đánh dấu cần duyệt.
- Manager: tên khách, loại hồ sơ/kho, ngày thuê và mã sao chép ở các danh sách đang được phép xem. Không mở thêm route Reservation tác nghiệp hoặc quyền duyệt cho Manager. Các giới hạn route/OperationsLink/RoleGuard giữ nguyên.
- Hợp đồng, hóa đơn, bàn giao, nhập/xuất, gia hạn, trả kho và phụ lục chuyển kho dùng thông tin thực tế rõ hơn; mã giữ đầy đủ để đối chiếu/sao chép. Phiếu nhập/xuất hiển thị cả thời điểm tạo nếu API cung cấp.
- Không suy ra StorageUnit từ mã StorageType. Chỉ hiện mã kho vật lý từ các đối tượng `storageUnit`, `unit`, `allocatedUnits`, `currentStorageUnit`, `contracts[].unit`… thực sự có trong response.

## Quan hệ dữ liệu

Backend hiện trả `PendingReservation.id = reservationCode` trong `BookingService.toReservation`; endpoint xem đơn nhận cả ID nội bộ và mã này. Các DTO Contract/Invoice trả `reservation.id` và `reservation.reference` trong quan hệ thật. Giao diện sử dụng chính các giá trị được trả về, không tách tiền tố/hậu tố mã để ghép dữ liệu.

Liên kết từ đơn dùng đúng giá trị `response.id`; bộ lọc Contract/Invoice hiện có hỗ trợ ID hoặc reference trong đối tượng reservation. Liên kết từ Contract sang hóa đơn/lịch hẹn dùng `contract.reservation.id`. Thông tin loại kho cho lịch bàn giao Customer được lấy từ Contract cùng `reservation.id`, chỉ trên nguồn Contract đã được trang tải sẵn.

## Phân trang theo yêu cầu bổ sung

- Các lựa chọn chung đổi từ 10/20/50 sang **5/10**, mặc định **10**. URL cũ có limit 20/50 được chuẩn hóa về 10.
- Áp dụng cho danh sách Customer dùng hook phân trang, Manager/Staff dùng component chung, Admin Accounts, Admin Audit, hàng đang lưu, nhập/xuất và bộ chọn hồ sơ có phân trang.
- Đổi số dòng về trang 1, giữ các bộ lọc khác; request server và phần hiển thị sử dụng cùng limit.
- Ngoại lệ: `BE/src/modules/manager/overstay.controller.ts:list` cố định `limit = 25`, không đọc query limit. Trang “Đến hạn nhưng chưa trả kho” giữ đúng phân trang server cũ; không thêm lựa chọn 5/10 giả hoặc thay Backend. API cần hỗ trợ limit nếu muốn đổi trang này.

## File ứng dụng chỉnh cho nhận diện

- `src/utils/record-identity.ts` (mới): tóm tắt hồ sơ, sắp xếp, điều kiện nhãn vừa gửi.
- `src/components/workspace/RecordIdentity.tsx` (mới): thông tin chính và sao chép mã.
- `src/pages/public/BookingWizardPage.tsx`.
- `src/pages/customer/CustomerReservationsPage.tsx`, `CustomerReservationDetailPage.tsx`, `CustomerDashboardPage.tsx`.
- `src/pages/customer/CustomerContractsPage.tsx`, `CustomerPaymentsPage.tsx`, `CustomerAppointmentsPage.tsx`, `CustomerRenewalsPage.tsx`, `CustomerReturnsPage.tsx`.
- `src/components/customer/TransferAddenda.tsx`.
- `src/pages/manager/ManagerListPage.tsx`, `ManagerDetailPage.tsx`.
- `src/pages/staff/StaffListPage.tsx`, `StaffRecordPage.tsx`.
- `src/pages/stock/StockMovementsPage.tsx`.
- `src/styles/light-professional.css`.

File phân trang: `utils/internal-pagination.ts`, `components/workspace/InternalPagination.tsx`, `components/customer/useCustomerPagination.tsx`, `components/manager/PortalUi.tsx`, `pages/stock/OperationalStoredItemsPage.tsx`, `pages/stock/StockMovementsPage.tsx`, `pages/admin/AdminAuditPage.tsx`.

## Kết quả kiểm tra

- `node scripts/record-identity-unit.mjs`: PASS — sắp xếp không sửa mảng API, ngày thiếu, ID chính xác, nhãn hết hạn, đồng hồ trước ngày tạo và phân biệt StorageType/StorageUnit.
- `node scripts/record-identity-smoke.mjs`: PASS — thao tác Booking Wizard thực sự trên browser với API mock, tạo đơn PENDING/CONFIRMED mở đúng ID; cùng loại kho vẫn phân biệt được; trạng thái đúng; tìm kiếm/sắp xếp/phân trang 5–10 đúng; sao chép mã đúng; Contract/Invoice lọc đúng quan hệ, không lẫn đơn khác; Staff lọc PENDING; Manager xem thông tin Contract trong quyền hiện có; màn hình hẹp không tràn trang.
- `node scripts/light-professional-smoke.mjs`: PASS với lựa chọn 5/10 mới.
- `node scripts/rv3-internal-ui-smoke.mjs`: PASS sau cập nhật kỳ vọng phân trang 5/10.
- `WDP_WEB_ONLY=1 npm run test:completion`: PASS — ký vẽ, OTP, PDF, điều kiện ký trước thanh toán, thông báo chuyển khoản không tự ghi thanh toán thành công.
- `npm run test:guest-onboarding`: PASS — khách mới/cũ, claim và mở đúng Reservation.
- `npm run build`: PASS, còn cảnh báo bundle >500kB.
- `npm run lint`: không lỗi, còn 4 cảnh báo Fast Refresh/escape đã có trước.

Tất cả kiểm tra browser trên dùng API giả lập; không ghi dữ liệu shared DB, gửi email hay tạo giao dịch thật. Không phải xác nhận E2E production. Ảnh thử trong `artifacts/record-identity/` dùng dữ liệu fixture.

## Giới hạn dữ liệu và phạm vi

- DTO Reservation Customer có `unitAssignment: null` và không trả kho đã phân bổ; màn này không dựng mã kho vật lý giả. Kho thực tế xuất hiện tại Contract/lịch bàn giao khi API cung cấp.
- DTO Customer Appointment không có tên loại kho/ngày thuê; chỉ bổ sung từ Contract có cùng reservation ID nếu đã tải được. Nếu thiếu quan hệ thì giữ thông tin được trả về, không đoán từ mã.
- Invoice dùng `issuedAt` và kỳ hóa đơn, không giả định đó là `createdAt`. Một số DTO Contract/StockMovement rút gọn chỉ có mã/ID quan hệ, nên không thể hiện tên loại kho/ngày thuê không có trong response.
- Không tải thêm toàn bộ hồ sơ khác chỉ để trang trí một dòng. Cách phân trang client/server có sẵn của từng trang được giữ; các giới hạn tải toàn bộ đã ghi trong báo cáo Light Professional vẫn còn.
- Chỉ sửa FE. BE/Mobile và các thay đổi local từ trước giữ nguyên; không sửa mã đã lưu, API, nghiệp vụ, quyền, VNPay, dữ liệu hoặc migration. Chưa commit/push/deploy.
