# RV3 đợt 2 — Manager Web

Ngày thực hiện: 10/11/2026. Báo cáo này mô tả source local, không khẳng định bản deploy đã cập nhật hoặc dữ liệu database nhóm đã được kiểm chứng.

## 1. Vấn đề xác nhận từ source

- Dashboard dùng `usePaginatedResource('/manager/units')` rồi đếm các trạng thái trong `items` của trang hiện tại: có thể sai khi tổng kho vượt một trang.
- Báo cáo cũ tải nhiều API và tính tổng tại FE. Đã có bộ lọc ngày và không có số ngẫu nhiên, nhưng định nghĩa tiền thu/cọc/công nợ và kỳ tổng hợp chưa đủ tách bạch.
- AdditionalService chỉ có `billingUnit`, không có đơn vị vật lý riêng. Form gọi chu kỳ ngày/tháng/một lần là “Đơn vị tính”.
- BE quote đã cung cấp `initialPaymentBreakdown` và `estimatedInitialAmountDue`; màn hình Manager chưa thể hiện hết các khoản lần đầu và các kỳ sau.
- Đợt 1 đã có kho hiện tại và snapshot vị trí phiếu; đợt này tận dụng các API đó. Chưa có đường dẫn thuận tiện từ từng hàng tồn đến lịch sử phiếu của hợp đồng.
- Manager đã có API phân công, đổi Staff và directory Staff ACTIVE. Không cần tạo quy trình phân công mới. Tuy nhiên `OperationsLink` chặn liên kết đọc hồ sơ stock-movements cho Manager dù route đọc đã có.

## 2. KPI và nguồn dữ liệu

API mới: `GET /api/manager/dashboard/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`, chỉ MANAGER qua guard hiện có. Truy vấn BE trong transaction đọc RepeatableRead để các phần báo cáo cùng snapshot. Không truy vấn phân trang để suy ra tổng.

| Chỉ số | Định nghĩa |
| --- | --- |
| Tổng kho | Tổng số StorageUnit, mọi trạng thái |
| Sẵn sàng / đang dùng / đang giữ / bảo trì | Lần lượt AVAILABLE / OCCUPIED / RESERVED / MAINTENANCE |
| Tỷ lệ sử dụng | OCCUPIED / toàn bộ StorageUnit × 100; không có kho thì null, hiển thị “—” |
| Hợp đồng hoạt động | Đếm RentalContract ACTIVE, không đếm gộp theo reservation |
| Hóa đơn chưa thanh toán đủ | OPEN hoặc PARTIALLY_PAID và balanceDue > 0; không gồm VOID |
| Công nợ hiện tại | Tổng balanceDue của tập hóa đơn trên |
| Tiền đã thu trong kỳ | Tổng Payment.amount theo receivedAt; Payment online chỉ tính transaction SUCCESS. Không cộng Invoice/PaymentSubmission/OnlinePaymentTransaction lần nữa |
| Cọc trên hóa đơn trả đủ trong kỳ | Tổng Invoice.depositAmount của PAID có paidAt trong kỳ; KHÔNG phân bổ cọc từ hóa đơn trả một phần |
| Khoản hoàn cọc đã duyệt chưa kết thúc | Tổng refundAmount của quyết toán APPROVED/AWAITING_OUTSTANDING_PAYMENT, refundedAt còn null |
| Hồ sơ cần quản lý | Số phiếu nhập–xuất/hỗ trợ/bảo trì chưa giao, hỗ trợ ESCALATED, bảo trì AWAITING_VERIFICATION, submission PENDING_VERIFICATION, quyết toán PENDING_REVIEW, đối soát PENDING_REVIEW/REFUND_REQUIRED; từng nhóm hiển thị riêng |
| Workload Staff | Đếm việc đã giao: nhập–xuất ASSIGNED, hỗ trợ ASSIGNED/IN_PROGRESS, bảo trì OPEN/IN_PROGRESS; theo từng nhân viên, không đại diện toàn bộ công việc hoặc đánh giá năng suất |

Bộ lọc ngày áp dụng cho tiền đã thu và cọc trên hóa đơn đã trả đủ. Từ 00:00 ngày `from` đến trước 00:00 ngày sau `to`, theo UTC+7. Công nợ, kho, hợp đồng, khoản hoàn và công việc là số liệu hiện tại, không bị lọc theo kỳ.

Không gọi dòng tiền thu là doanh thu kế toán. Dòng tiền thu bao gồm tiền cọc và dịch vụ, chưa trừ khoản hoàn. Cọc ở đây là chỉ tiêu có giới hạn rõ, chưa phải toàn bộ nghĩa vụ cọc đang nắm giữ: không có quy tắc phân bổ từng khoản thu một phần vào tiền thuê/cọc nên không tự suy diễn.

Giao diện có định nghĩa KPI, trạng thái tải/lỗi, bộ lọc ngày, liên kết hồ sơ gốc và xuất KPI tài chính CSV. Khi lỗi API, không dựng dữ liệu bằng số 0. Không thêm nhận xét AI, tăng trưởng hoặc biểu đồ thiếu nguồn.

## 3. Đơn vị dịch vụ

- Thêm `AdditionalService.physicalUnit String?`, độc lập `billingUnit` ONE_TIME/DAY/MONTH.
- Danh mục chuẩn: cái, thùng, cuộn, bộ, xe, túi, hộp, kiện, tấm, đôi, gói. BE xác thực; Web dùng select.
- Dịch vụ cũ giữ null cho đến khi Manager đối chiếu thực tế và chọn đơn vị; không suy đoán theo tên, không chuyển đổi tồn hoặc tự đặt giá.
- Sau khi đã thiết lập đơn vị vật lý, không đổi nó; nếu nghiệp vụ đổi đơn vị phải tạo dịch vụ mới để không đổi nghĩa tồn. Tương tự BE chặn đổi loại PURCHASE/RENTAL của dịch vụ đã tạo (Web vốn đã khóa loại).
- Giá hiển thị dạng `VND /đơn vị · mua một lần`, `/đơn vị/ngày`, `/đơn vị/tháng`. Thiếu đơn vị được ghi rõ.
- Không đổi công thức PricingService. Quote mới lưu thêm physicalUnit của dịch vụ và diễn giải đơn giá theo đơn vị đó; không sửa snapshot lịch sử hay ReservationService cũ.
- Public catalog trả thêm trường nullable; các trường billingUnit/kind/unitPrice vẫn giữ nguyên. API cũ bỏ qua physicalUnit vẫn tương thích, không bị gán mặc định một đơn vị giả.

## 4. Bảng tiền của Manager

Component `ManagerPricingExplanation` đọc snapshot BE, không lấy giá catalog hiện tại và không tính lại giá tại FE:

- Giá niêm yết, tiền thuê trước giảm, giảm giá, thuê sau giảm, cọc.
- Dịch vụ mua một lần và dịch vụ thuê ngày/tháng toàn kỳ.
- Tổng cả kỳ gồm cọc.
- Tiền thuê/cọc/dịch vụ lần đầu, tổng lần đầu và remainingAmount dự kiến các kỳ sau.
- Tổng riêng hóa đơn và số còn phải thanh toán hóa đơn được ghi rõ, tách khỏi tổng báo giá cả kỳ.
- Snapshot cũ thiếu breakdown hiển thị chưa có dữ liệu và hướng đối chiếu hóa đơn, không giả định toàn bộ tổng phải trả ngay.

PREPAID, PAY_MONTHLY và thuê ngày vẫn theo quote BE. Không thay đổi VNPay, lifecycle hợp đồng hoặc thanh toán.

## 5. Hàng hóa và phân công

- Manager mở **Hồ sơ thuê → Hàng đang lưu theo kho** hoặc từ báo cáo/phiếu hàng.
- Hiển thị kho vật lý hiện tại, tầng/khu, khách, hợp đồng, hàng, số tồn và đơn vị; bấm kho để lọc. Liên kết từng dòng mở lịch sử phiếu của hợp đồng đó.
- Trong phiếu vẫn phân biệt vị trí hiện tại với snapshot lúc hoàn tất. Phiếu cũ không có snapshot không được tự điền vị trí lịch sử.
- Phân công/đổi nhân viên dùng API hiện có, yêu cầu Staff ACTIVE. Modal bổ sung kết quả kiểm đếm: yêu cầu, thực tế (kể cả 0), chênh lệch, ghi chú, người và thời gian hoàn tất.
- Sửa điều kiện liên kết để Manager mở hồ sơ phiếu ở chế độ đọc; KHÔNG thêm stock-movements vào quyền thao tác của Manager. Không có nút hoàn tất kiểm đếm hoặc bàn giao thay Staff.
- Customer tự vận chuyển, Staff hướng dẫn/kiểm đếm/xác nhận, Manager phân công/giám sát như đợt 1.

## 6. File đợt 2

Backend:

- `BE/src/modules/manager/manager-analytics.service.ts` (mới), `manager-dashboard.controller.ts`, `manager.module.ts`.
- `BE/prisma/schema.prisma`, migration `20261110100000_additional_service_physical_unit/migration.sql`.
- `BE/src/modules/additional-services/additional-services.service.ts`, `service-units.ts` (mới), `BE/src/openapi/api-dtos.ts`.
- `BE/src/modules/pricing/pricing.service.ts`, `pricing.types.ts` (chỉ metadata/diễn giải đơn vị).
- Unit test mới: `manager-analytics.unit.spec.ts`, `manager-assignment.unit.spec.ts`, `service-units.unit.spec.ts`; thêm vào `BE/package.json` test:unit.

Frontend:

- `FE/src/pages/manager/ManagerAnalyticsPage.tsx`, `ManagerOverviewPage.tsx`, `ManagerAdditionalServicesPage.tsx`, `ManagerAssignmentsPage.tsx`, `ManagerDetailPage.tsx`.
- Mới: `FE/src/components/manager/ManagerPricingExplanation.tsx`, `FE/src/types/manager-report.ts`, `FE/src/utils/service-units.ts`.
- `FE/src/pages/stock/OperationalStoredItemsPage.tsx`, `FE/src/types/additional-service.ts`, `FE/src/utils/manager-sections.ts`, `FE/src/utils/operation-access.ts`, `FE/src/components/manager/operations-navigation.ts`.
- `FE/scripts/rv3-manager-smoke.mjs` và `FE/package.json` test:rv3-manager.

Giữ nguyên các thay đổi local đợt 1. Đợt 2 không sửa Customer Web, Admin Web hoặc source Mobile. Staff chỉ thêm đường dẫn đọc lịch sử trong trang tra cứu chung; quyền hoàn tất vẫn thuộc Staff.

## 7. Migration — chưa áp dụng

Migration mới chỉ thêm cột nullable, không UPDATE dữ liệu cũ. Cần áp dụng schema trước khi chạy BE mới với database mục tiêu. Kiểm tra toàn bộ migration pending, kể cả migration snapshot vị trí của đợt 1, trước khi nhóm tự thực hiện:

```powershell
cd BE
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
```

Không chạy migration trong tác vụ này, không reset/seed DB, không sửa Payment/Invoice production, không commit/push/deploy. Deploy migration áp dụng tất cả migration đang chờ; nhóm cần kiểm tra trước.

## 8. Kiểm chứng thực tế

- BE build: đạt.
- BE lint: đạt.
- Vitest tập trung 8 file / 56 test: đạt (Manager analytics/assignment, đơn vị dịch vụ, stored-item read, stock safety, service installments, pricing boundaries, handover recipient).
- FE build (bao gồm tsc): đạt; còn cảnh báo bundle lớn hiện có.
- FE lint: đạt, còn 4 cảnh báo sẵn có ở layout và InventoryEditor.
- Mobile `npm run typecheck`: đạt.
- Browser smoke: đạt; kiểm tra Dashboard tổng 120 kho thay vì trang danh sách, lọc ngày, lỗi API không render KPI giả, form đơn vị/chu kỳ, kho/tầng/khu và liên kết lịch sử, modal kết quả Staff không có nút Manager hoàn tất, giá lần đầu/cả kỳ.
- Browser dùng Playwright đã có trong thư mục tạm qua WDP_PLAYWRIGHT_MODULE; mọi request API/SSE bị mock. Không gọi API ghi database nhóm. Fixture chỉ là dữ liệu test, không phải số liệu kinh doanh thật.
- Ảnh `rv3-manager/report-mocked.png` là ảnh kiểm tra UI bằng fixture, không phải dữ liệu production.

Không chạy integration suite có kết nối DB chia sẻ. Chưa áp migration, chưa xác minh với bản ghi thật, chưa kiểm chứng hiệu năng báo cáo trên Render hoặc demo trên thiết bị Mobile. Không tuyên bố tất cả test của repository đều đã chạy.

## 9. Checklist demo sau khi nhóm áp schema

1. Manager → Tổng quan: đối chiếu tổng và từng trạng thái kho với toàn bộ danh sách, kể cả hơn một trang.
2. Báo cáo → chọn một ngày; đối chiếu khoản thu với Payment.receivedAt UTC+7. VNPay PENDING/thông báo chưa xác minh không làm tăng tiền đã thu. Hóa đơn VOID không vào công nợ.
3. Đối chiếu cọc theo hóa đơn PAID/paidAt và khoản hoàn theo quyết toán; không giải thích các số này như doanh thu thuê.
4. Kho & bảng giá → Vật tư & thiết bị: kiểm tra dịch vụ cũ thiếu đơn vị; đối chiếu hàng thật trước khi thiết lập. Tạo dịch vụ test trong môi trường riêng; chọn đơn vị vật lý và chu kỳ riêng, không dùng giá ví dụ làm giá thật.
5. Mở hóa đơn PAY_MONTHLY 3 tháng: so sánh tổng lần đầu, tổng cả kỳ gồm cọc và các kỳ sau; thử PREPAID và thuê ngày với quote BE.
6. Hồ sơ thuê → Hàng đang lưu theo kho: tìm kho, lọc, xem tồn và mở phiếu; kiểm tra Staff, số yêu cầu/thực tế, chênh lệch và ghi chú. Sau chuyển kho, vị trí hiện tại đổi nhưng snapshot phiếu trước giữ nguyên.
7. Phân công nhân viên: giao/đổi Staff ACTIVE, kiểm tra Staff thấy việc, hoàn tất bằng Staff rồi Manager xem kết quả. Manager không tự kiểm đếm thay.
