# Đối chiếu góp ý của giảng viên — 16/10/2026

## Phạm vi áp dụng

Đối chiếu bản code hiện có sau merge, tài liệu `WDP_STORAGE_MASTER_SPEC_FOR_AI.md` và các xác nhận mới của chủ dự án:

- Hệ thống thuê kho tại **một cơ sở**.
- Admin hiện có **Tổng quan** và **Quản lý tài khoản**; phân công thuộc Manager.
- “Nhập kho, xuất kho” là **hàng hóa khách gửi vào/lấy ra**, theo xác nhận ngày 16/10; không phải tăng/giảm tồn vật phẩm dịch vụ hoặc bàn giao/trả diện tích kho.
- Chỉ sửa web/mobile. **Chưa thay đổi BE, Prisma schema, dữ liệu, cấu hình môi trường, tài khoản hay mật khẩu.**
- Các phần đề xuất bên dưới chưa được triển khai và cần chấp thuận thay đổi phạm vi BE/database trước khi thực hiện. Không tạo màn hình lưu giả để đánh dấu hoàn thành.

## Kết quả theo từng góp ý

| Góp ý | BE hiện tại | Web/mobile sau chỉnh sửa | Còn cần BE/database |
| --- | --- | --- | --- |
| Tiền dịch vụ theo lần/ngày/tháng | Đã có PURCHASE/ONE_TIME, RENTAL/DAY và RENTAL/MONTH; báo giá và lập hóa đơn theo kỳ | Web giải thích căn cứ tính, kiểm tra số lượng và khoảng ngày, tháng lịch, chặn gửi báo giá khi dịch vụ sai kỳ thuê; mobile Manager giữ kiểm tra cặp loại/đơn vị tính | Chưa cần đổi công thức BE để đáp ứng góp ý này |
| Manager giao việc cho Staff | Đã có phân công hỗ trợ, bảo trì; Staff được giao mới bắt đầu/hoàn tất các việc đó | Giữ phân công web/mobile và phân quyền, không thêm nhiệm vụ tổng quát trùng nghiệp vụ | Nếu cần danh bạ chọn Staff thuận tiện, thêm API đọc tối thiểu cho Manager; hiện dùng mã Staff do Admin cung cấp hoặc Staff đã xuất hiện trong nhiệm vụ |
| Ngày bàn giao | Đã chặn lịch mới trong quá khứ, chưa trả đủ giới hạn kỳ thuê trong hồ sơ lịch hẹn | Web Customer chỉ chọn lịch trong giao của các kỳ hợp đồng, theo UTC+7; loại hợp đồng hết hạn; Staff web không hoàn tất trước giờ hẹn | Bổ sung kiểm tra cận trên kỳ thuê và thời điểm hoàn tất ở server; xem mục chi tiết |
| Màn hình duyệt thiếu thông tin, ví dụ gia hạn | API đã có snapshot giá, hạn cũ/mới, hợp đồng, người yêu cầu/duyệt, hóa đơn/công nợ | Bổ sung bảng đối chiếu web/mobile Manager trước thao tác; xác nhận đã đối chiếu; chặn duyệt khi snapshot thiếu/lệch hoặc hạn hiện tại thay đổi; giữ từ chối có lý do | Chưa cần API mới cho thông tin gia hạn đã có |
| Phụ lục khi gia hạn | Chưa có thực thể, số văn bản, phiên bản, tệp hoặc chữ ký phụ lục | Customer web và Manager web/mobile có thông tin đối chiếu làm căn cứ lập phụ lục; không gọi bản in hay bản ghi gia hạn là phụ lục đã ký | Cần vòng đời và lưu trữ phụ lục thực sự |
| Nhập/xuất hàng khách | Chưa có danh mục hàng khách, phiếu nhập/xuất và sổ tồn theo hợp đồng | Chưa thêm thao tác giả; tồn dịch vụ hiện tại vẫn dùng đúng mục đích của nó | Cần module và schema riêng |
| Admin cấu hình thông số | Chưa có API cập nhật cấu hình hệ thống hoặc lưu phiên bản | Giữ đúng hai mục Admin đã được xác nhận | Cần module cấu hình có kiểm tra, phân quyền, lịch sử và mở rộng phạm vi Admin |

## Quy tắc đã đối chiếu với BE

### Dịch vụ

Nguồn: `BE/src/modules/pricing/pricing.service.ts`, module `additional-services` và `billing`.

- **Mua một lần:** đơn giá × số lượng. Không nhân theo số ngày/tháng thuê kho.
- **Thuê theo ngày:** đơn giá × số lượng × số ngày của khoảng `[serviceStartDate, serviceEndDate)`. Ngày kết thúc không được tính thêm.
- **Thuê theo tháng:** đơn giá × số lượng × số tháng lịch nguyên. BE điều chỉnh ngày cuối tháng: 31/01 → 28/02 của năm không nhuận là một tháng; 31/01 → 01/03 không phải một tháng lịch nguyên. Không áp dụng công thức 30 ngày cho loại dịch vụ MONTH.
- Ngày dịch vụ phải nằm trong kỳ thuê, kết thúc sau bắt đầu. Số lượng nguyên 1–100 theo giới hạn request BE.
- Web hiển thị căn cứ tính; **số tiền vẫn lấy từ `/pricing/quote`**. Không tự thay tổng báo giá, cọc, làm tròn hoặc chiết khấu bằng phép tính ở client.
- Mua một lần được tính một lần; dịch vụ thuê được đưa vào hóa đơn theo kỳ BE quy định. Với PAY_MONTHLY, tổng cả kỳ khác số cần thanh toán ban đầu.
- Giá thuê **diện tích kho ngắn ngày** là nghiệp vụ khác: BE có thể quy đổi giá kho tháng/30 để tính kỳ ngắn ngày được phép. Không nhầm quy tắc này với dịch vụ MONTH.
- Khi đổi kỳ thuê mà khoảng dịch vụ cũ không còn hợp lệ, web hiện lỗi ở cả trường hợp dịch vụ nằm trong tab đang ẩn; không tiếp tục lấy báo giá/khả dụng bằng lựa chọn đó.

### Phân công và quyền

Nguồn: `maintenance.service.ts`, `support.service.ts`, các controller Manager/Staff tương ứng.

- Manager phân công bằng PATCH `/manager/maintenance/:id/assign` hoặc `/manager/support-requests/:id/assign`, payload `staffUserId`, có `Idempotency-Key`.
- Staff được giao thực hiện; Manager nghiệm thu bảo trì hoặc xử lý hỗ trợ chuyển lên quản lý. Staff không duyệt khoản phí hoặc gia hạn.
- Danh sách Staff có thể đọc rộng hơn công việc được giao theo API hiện có. Quyền **thao tác** trên hỗ trợ/bảo trì được kiểm tra bằng người được giao; không mô tả sai thành mọi bản ghi chỉ Staff được giao mới đọc được.
- Chưa có entity “Task” chung hay API phân công người phụ trách lịch bàn giao. Không thêm form phân công không có API.
- Đề xuất nhỏ nếu được đổi BE: GET `/manager/staff?accountStatus=ACTIVE`, chỉ trả `id/fullName/role`; dùng làm lựa chọn phân công ở web/mobile, không mở `/admin/users` cho Manager.

### Bàn giao

Nguồn: `BE/src/modules/appointments/appointments.service.ts`.

- Lịch mới yêu cầu hóa đơn ban đầu PAID, đủ hợp đồng READY_FOR_HANDOVER, đủ kho phân bổ, không có lịch đang hoạt động khác.
- Web tính cửa sổ hợp lệ của một yêu cầu nhiều kho: từ **ngày bắt đầu muộn nhất** đến trước **ngày kết thúc sớm nhất** của các hợp đồng; so giờ theo cơ sở UTC+7. Gửi API dưới dạng ISO UTC.
- Staff web chỉ ghi hoàn tất từ giờ hẹn trở đi và vẫn phải xác nhận đã bàn giao đầy đủ trên thực tế.
- **Giới hạn còn lại ở BE:** `assertAppointmentDate` mới kiểm tra ngày hẹn không trước ngày bắt đầu. `completeHandover` chưa chặn thời điểm hoàn tất trước giờ hẹn. Client không thay thế được kiểm tra server.
- Thay đổi BE cần duyệt: kiểm tra `[max(startDate), min(endDate))` khi tạo/xác nhận/hoàn tất; kiểm tra thời điểm thực hiện chưa hết kỳ thuê; không kích hoạt hợp đồng trước ngày bắt đầu. Bổ sung ngày hợp đồng/cửa sổ bàn giao vào DTO lịch hẹn để mọi client đối chiếu nhất quán.
- Nếu cần đổi/hủy một lịch chờ đã quá hạn, phải bổ sung API reschedule/cancel có lý do, người sửa, kiểm tra trùng và lịch sử; hiện BE chưa hỗ trợ. Không tự sửa ngày bắt đầu thuê vì ngày bàn giao thực tế muộn.

### Duyệt và kích hoạt gia hạn

Nguồn: `BE/src/modules/renewals/renewals.service.ts` và luồng thanh toán hóa đơn.

- Bảng đối chiếu hiển thị yêu cầu đặt kho, khách hàng, loại/số kho, hạn cũ–mới không bao gồm ngày kết thúc, số tháng, kế hoạch thanh toán, đơn giá, tiền trước giảm, tỷ lệ/tiền giảm, tổng tiền, cọc thu thêm, hóa đơn/công nợ, thời điểm/người xét duyệt và các hợp đồng/kho áp dụng.
- Duyệt tạo hóa đơn, **chưa kéo dài hợp đồng ngay**.
- PREPAID: thanh toán đủ hóa đơn toàn kỳ gia hạn mới kích hoạt.
- PAY_MONTHLY: thanh toán đủ hóa đơn gia hạn **kỳ đầu** mới kích hoạt; các hóa đơn kỳ sau vẫn có thể còn dư nợ. Không diễn giải thành phải trả hết mọi hóa đơn gia hạn.
- Gia hạn không thu cọc lần nữa. Web/mobile so snapshot với kỳ thuê, số lượng và kế hoạch thanh toán; BE vẫn kiểm tra xung đột và điều kiện cuối cùng khi nhận request.

## Phương án BE/schema cần phê duyệt

### 1. Sổ hàng khách và phiếu nhập/xuất

Đề xuất bổ sung, tách hoàn toàn khỏi `AdditionalServiceInventory`:

- `StoredItem`: mặt hàng của khách, liên kết Customer + RentalContract; mã, tên, đơn vị tính, ghi chú. Theo từng hợp đồng để phân biệt nhiều kho trong một reservation.
- `StockMovement`: mã phiếu, loại IN/OUT, hợp đồng, trạng thái REQUESTED/ASSIGNED/COMPLETED/CANCELLED, lịch dự kiến, ghi chú, người yêu cầu, Staff được giao, Manager phân công, thời điểm/nhân viên xác nhận thực tế, idempotency key.
- `StockMovementLine`: mặt hàng, lượng yêu cầu và lượng thực tế; ghi chú chênh lệch. Tồn được tính từ các dòng đã COMPLETED (hoặc balance cập nhật cùng transaction), không từ phiếu đang chờ.
- Khách tạo phiếu cho hợp đồng của chính mình; Manager xem/phân công; Staff được giao xác nhận thực tế. Admin không vận hành nhập/xuất thay Manager.
- API đề xuất: GET `/customer/stored-items`, GET/POST `/customer/stock-movements`, GET `/customer/stock-movements/:id`; GET `/manager/stock-movements`, GET `/manager/stock-movements/:id`, PATCH `/:id/assign`; GET `/staff/stock-movements`, GET `/staff/stock-movements/:id`, POST `/:id/complete`. Các đường dẫn `/:id/...` ở trên thuộc prefix vai trò tương ứng. Hủy phiếu chưa hoàn tất cần quyền chủ sở hữu hoặc Manager, lý do và lịch sử.
- Bắt buộc: server kiểm tra quyền sở hữu, hợp đồng/kho còn được sử dụng, số lượng dương theo đơn vị được hỗ trợ, không xuất âm, khóa tồn khi ghi xuất đồng thời, idempotency và không sửa/xóa lịch sử hoàn tất. Sai phiếu đã hoàn tất được điều chỉnh bằng phiếu bù có liên kết và lý do.
- Xuất một phần hàng **không** trả kho, giải phóng kho, tất toán cọc hoặc kết thúc hợp đồng. Trước khi hoàn tất trả kho phải xử lý lượng hàng còn lại. Chuyển kho cần chuyển vị trí hàng liên quan trong cùng luồng, giữ lịch sử vị trí.
- Web/mobile cần các màn hàng đang gửi, tạo phiếu, xem trạng thái/lịch sử, Manager phân công và Staff xác nhận; không trộn với phiếu trả diện tích kho hiện có.

### 2. Phụ lục gia hạn thực sự

- `ContractAddendum`: liên kết RenewalRequest + RentalContract, số phụ lục duy nhất, phiên bản, snapshot hạn cũ/mới, giá/giảm/cọc/kế hoạch thanh toán, trạng thái DRAFT/ISSUED/SIGNED/EFFECTIVE/CANCELLED, người lập và thời điểm phát hành.
- Lưu tệp và metadata xác nhận/ký của các bên bằng cơ chế được thống nhất; không dùng checkbox “đã xem” làm chữ ký pháp lý. Các phiên bản đã ký bất biến.
- Một yêu cầu nhiều kho tạo phụ lục theo từng hợp đồng; chống tạo trùng khi retry. Dự kiến lập nháp khi duyệt; hiệu lực sau điều kiện thanh toán kích hoạt của BE và điều kiện xác nhận/ký đã thống nhất. Không làm thay đổi snapshot hóa đơn cũ.
- API đề xuất: GET `/customer/renewals/:id/addenda`, GET `/manager/renewals/:id/addenda`, POST `/manager/renewals/:id/addenda` để lập/phát hành, API tệp có kiểm tra quyền và API xác nhận/ký theo cơ chế được chọn. Gắn phụ lục vào chi tiết hợp đồng, gia hạn và tài khoản khách trên web/mobile.
- Chưa chốt cơ chế ký điện tử hoặc ký trực tiếp/tải tệp; đây là quyết định nghiệp vụ cần xác nhận trước khi triển khai phần chữ ký.

### 3. Cấu hình hệ thống của Admin

- `SystemSettingsVersion`: bộ giá trị được cho phép, version, effectiveAt, người tạo, lý do, trạng thái; lịch sử thay đổi bất biến. Chỉ ADMIN đọc/sửa/phát hành; không cho chỉnh tùy ý biến môi trường, secret hoặc câu SQL.
- Thông số ứng viên bám BE hiện tại: ngưỡng/chiết khấu trả trước, chính sách cọc theo loại kho, thời hạn thuê tối thiểu/ngắn ngày, phí mất khóa đang cố định 200.000 VND. Đơn giá dịch vụ tiếp tục thuộc danh mục dịch vụ Manager hiện có để tránh hai nơi điều khiển cùng giá.
- API đề xuất: GET `/admin/system-settings`, PATCH `/admin/system-settings` với expectedVersion và effectiveAt, GET `/admin/system-settings/history`. Kiểm tra phạm vi, loại số, mốc thời gian và thay đổi đồng thời ở server.
- Mỗi báo giá/hợp đồng/hóa đơn mới gắn phiên bản cấu hình hoặc snapshot giá tương ứng. Thay đổi cấu hình không tính lại hợp đồng, hóa đơn, gia hạn đã lập hay khoản đã thanh toán.
- Cần được chấp thuận mở rộng Admin từ hai mục sang thêm **Cấu hình hệ thống**, rồi mới nối web/mobile. Chưa thêm mục này vì phạm vi Admin hai mục vẫn là xác nhận mới nhất.

## Thứ tự triển khai nếu được duyệt

1. Bổ sung kiểm tra server cho bàn giao và DTO cửa sổ bàn giao; thêm danh bạ Staff tối thiểu.
2. Bổ sung ledger nhập/xuất và API theo quyền; nối web/mobile cùng luồng phân công và xác nhận.
3. Bổ sung phụ lục và thống nhất cơ chế ký/xác nhận; nối vào gia hạn/hợp đồng.
4. Bổ sung cấu hình có phiên bản, gắn snapshot và mở đúng mục Admin mới.
5. Migration phải được xem xét trước khi chạy trên database hiện hữu; kiểm thử phân quyền, cạnh tranh tồn hàng, hiệu lực thanh toán và dữ liệu cũ. Không seed/reset dữ liệu để kiểm thử.

## Kiểm thử phần client

- FE: build production và lint qua. Còn cảnh báo kích thước bundle 3D có từ trước; không phải lỗi chức năng.
- Mobile: TypeScript, Expo lint, export web và **export Android/Hermes** qua. Kiểm thử tương tác dưới đây dùng bản web của cùng mã Expo; chưa kiểm thử tương tác trên thiết bị Android/iOS trong lượt này.
- `test:portal`: 33 nhóm kiểm tra, 17 thao tác ghi API giả lập, 0 lỗi JavaScript, 0 ghi database thật. Bao gồm phân công Manager, hai mục Admin, xác nhận trước duyệt gia hạn, báo cáo, thu tiền và quyết toán.
- `test:roles`: 16 tổ hợp vai trò/khu vực và các luồng Customer/Staff; 20 thao tác ghi API giả lập, 0 request nhầm vai trò, 0 lỗi JavaScript, 0 ghi database thật. Bổ sung kiểm tra lịch hẹn tương lai không thể hoàn tất và ngày kết thúc thuê không thể chọn để nhận kho.
- Kiểm tra tập trung: tháng lịch cuối tháng/năm nhuận; ngày kết thúc loại trừ; số lượng lẻ; dịch vụ nằm ngoài kỳ thuê; lỗi vẫn hiện khi ẩn tab; bỏ được dịch vụ mất giá hoặc bị xóa khỏi danh mục; khoảng bàn giao nhiều hợp đồng; snapshot thiếu/lệch; hạn thuê bị thay đổi; Admin không có thao tác Manager; luồng xác nhận duyệt mobile gửi đúng endpoint, không gửi field xác nhận client lên BE.
- Wizard đặt kho thật: khoảng dịch vụ MONTH sai bị chặn lấy báo giá và không thể tiếp tục; sửa về đúng tháng lịch sẽ lấy báo giá mới và cho tiếp tục. API ghi nghiệp vụ đều bị chặn trong bài kiểm tra này.
- Kiểm tra giao diện dịch vụ và bảng đối chiếu gia hạn web/mobile ở chiều rộng 390px không tràn trang; 0 lỗi JavaScript trong các luồng này.
- Đối chiếu API **thật** `/booking/catalog` và `/pricing/quote` cho cả ONE_TIME, DAY, MONTH: số tiền dòng dịch vụ khớp đơn giá × số lượng × số kỳ; **không tạo reservation, hợp đồng, phiếu thu, tài khoản hoặc dữ liệu test**.
- BE health, FE và Expo đã khởi động. Không chạy test tích hợp BE có ghi dữ liệu, seed, reset hoặc migration.
- Đã dọn script/trang harness, hồ sơ browser và thư mục export tạm phục vụ kiểm thử; hai script hồi quy sẵn có trong `FE/scripts` được cập nhật và giữ lại.

Các kiểm tra trên xác nhận phần client đã sửa; **không** xác nhận các module BE mới ở phần đề xuất đã được thực hiện, hoặc mọi tình huống ngoài phạm vi kiểm thử đều không có lỗi.
