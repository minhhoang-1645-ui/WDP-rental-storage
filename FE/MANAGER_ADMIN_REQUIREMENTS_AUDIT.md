# Đối chiếu yêu cầu Manager và Admin

Ngày kiểm tra: 11/10/2026. **Kết luận: chưa đạt toàn bộ yêu cầu.** FE đã nối các nghiệp vụ hiện có, nhưng chạy được API không đồng nghĩa với đáp ứng đủ file thiết kế. Các thiếu hụt dưới đây không được che bằng dữ liệu giả hoặc thông báo lưu thành công giả.

## Nguồn và giới hạn

- Manager và quy tắc nghiệp vụ: [file yêu cầu dự án](C:/Users/luanq/Downloads/WDP_STORAGE_MASTER_SPEC_FOR_AI.md), đặc biệt mục 2.3, 3–18, 21–24 và 30–31.
- Admin: **7 use case người dùng bổ sung trong cuộc trò chuyện**. File gốc không có danh sách chức năng ADMIN. Các mục Admin dưới đây là yêu cầu người dùng đã chốt, không phải nội dung có sẵn trong file gốc.
- Đối chiếu code controller/service BE, DTO và `BE/prisma/schema.prisma`, sau đó kiểm tra FE. Không sửa BE, schema, migration, seed hoặc dữ liệu nghiệp vụ thật.
- “Đáp ứng ở FE” là có luồng giao diện dùng dữ liệu/API hiện có. Đây không phải chứng nhận các transaction hoặc tình huống đồng thời của BE đã được kiểm thử đầy đủ.

## 8 chức năng Manager tại mục 2.3

| Mã  | Yêu cầu                                      | Kết quả và phần còn thiếu                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | Quản lý loại kho                             | **Một phần.** Xem danh mục, nhóm kích thước, điều kiện, kích thước/diện tích/thể tích, giá và trạng thái. Chưa tạo/sửa loại kho; BE chỉ có API đọc catalog.                                                                                                                                                                            |
| M02 | Quản lý kho vật lý                           | **Một phần.** Danh sách, lọc/tìm, vị trí, trạng thái, phân bổ hiện tại/tương lai/lịch sử và chi tiết. Chưa tạo/sửa dữ liệu kho vật lý; controller `/manager/units` chỉ GET.                                                                                                                                                            |
| M03 | Quản lý kích thước, vị trí, điều kiện và giá | **Một phần.** Hiển thị dữ liệu hiện có, không đổi giá chưa biết thành 0. Chưa cập nhật các trường này vì thiếu API ghi.                                                                                                                                                                                                                |
| M04 | Theo dõi khả dụng                            | **Đáp ứng ở FE với API hiện có.** Theo dõi kho và phân bổ; đã bổ sung kiểm tra toàn kỳ theo loại kho, ngày và số lượng tại trang danh mục. Kết quả không giữ kho, thay đổi đầu vào xóa kết quả cũ. Giới hạn số lượng 1–3 lấy từ DTO/service hiện tại.                                                                                  |
| M05 | Quản lý trạng thái vận hành                  | **Có các luồng hiện có.** Duyệt đặt kho, theo dõi bàn giao/thuê/trả, tạo và nghiệm thu bảo trì; trạng thái vật lý do BE thay đổi trong luồng nghiệp vụ. Không thêm nút đổi trực tiếp sang AVAILABLE vì trái điều kiện nhận kho/kiểm tra. Các thiếu hụt trả từng kho và chuyển khác kích thước được ghi riêng bên dưới.                 |
| M06 | Xem xét tư vấn và đặt kho                    | **Đáp ứng các quyết định an toàn hiện có ở FE.** Tách tư vấn/đặt kho, xem snapshot, liên hệ, ghi chú; xử lý tư vấn và duyệt/từ chối/hủy/hết hạn đặt kho PENDING. Hủy CONFIRMED chưa được đưa vào FE vì BE giải phóng allocation mà chưa xử lý đầy đủ hợp đồng/hóa đơn/thuê đang hoạt động. File không yêu cầu riêng nút hủy CONFIRMED. |
| M07 | Xem hoạt động nhân viên và cơ sở             | **Có mức xem hồ sơ.** Tổng quan, hàng đợi, nhân viên phụ trách, người xác nhận/xử lý/duyệt và mốc thời gian từ API. Không có lịch sử toàn hệ thống hoặc phân công ca/khu vực; không đánh đồng hồ sơ nghiệp vụ với audit log.                                                                                                           |
| M08 | Xem hồ sơ kiểm tra và bảo trì                | **Đáp ứng mức xem hồ sơ hiện có.** Kiểm tra từng kho, kết quả, vấn đề, người/thời điểm kiểm tra; bảo trì, nhân viên phụ trách, nghiệm thu hoặc trả sửa. Chưa có nhật ký trạng thái kho dạng bảng `unit_status_history` như thiết kế.                                                                                                   |

## Đúng 7 use case Admin được người dùng bổ sung

| Mã  | Tên tiếng Việt                  | Trang FE                | Kết quả                                                                                                                                                                                                      |
| --- | ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 | Quản lý tài khoản người dùng    | `/admin/users`          | Xem/tìm/lọc/phân trang tài khoản, xem chi tiết và tạo STAFF/MANAGER theo API. Chưa sửa thông tin/xóa/đặt lại mật khẩu; 7 tên use case chưa quy định các thao tác này nên không tự bổ sung.                   |
| A02 | Quản lý vai trò và quyền        | `/admin/roles`          | **Chưa hoàn tất quản lý.** Xem nhóm quyền thực tế và vai trò tài khoản. Chưa đổi vai trò hoặc sửa quyền; BE dùng role/guard cố định, không có API cập nhật quyền.                                            |
| A03 | Quản lý phân công nhân viên     | `/admin/assignments`    | **Có phân công việc hỗ trợ/bảo trì.** Danh sách toàn bộ trang, lọc đã/chưa phân công, tìm công việc, mở hồ sơ để giao/đổi STAFF thật. Không có phân công ca/khu vực hoặc bảng `staff_assignments` tổng quát. |
| A04 | Quản lý cấu hình cơ sở          | `/admin/settings`       | **Chưa hoàn tất.** Hiển thị kết nối, phiên quản trị và liên kết danh mục. Chưa đọc/lưu đầy đủ cấu hình Facility (mã/tên/địa chỉ) vì không có endpoint cấu hình cơ sở. Trang thông báo hạn chế rõ ràng.       |
| A05 | Xem bảng tổng quan hệ thống     | `/admin`                | **Đáp ứng ở FE với dữ liệu hiện có.** Thống kê tất cả tài khoản theo vai trò/trạng thái, liên kết tổng quan vận hành và báo cáo. Không hiển thị số giả khi tải lỗi.                                          |
| A06 | Xem nhật ký kiểm toán/hoạt động | `/admin/activity`       | **Chưa hoàn tất.** Có trang tiếng Việt báo chưa có nguồn nhật ký. Không tạo log giả từ localStorage hoặc coi thời gian cập nhật hồ sơ là audit log. BE/schema chưa có nguồn audit/activity log.              |
| A07 | Quản lý trạng thái tài khoản    | `/admin/account-status` | **Đáp ứng ở FE với API hiện có.** Kích hoạt/vô hiệu hóa qua PATCH status, xác nhận trước khi đổi; không khóa tài khoản đang sử dụng. Trang riêng không có nút tạo tài khoản.                                 |

Sidebar quản trị có đúng 7 mục trên. Khi mở hồ sơ vận hành, menu vận hành được hiển thị theo ngữ cảnh để di chuyển giữa hồ sơ. Tất cả vẫn ở `/admin/facility`; không đổi người dùng hoặc chuyển sang giao diện manager. Các route vận hành dùng lại quyền ADMIN đã có trong BE, không tạo thêm module kinh doanh mới.

## Những khoảng cách với thiết kế cần giải quyết ở BE/database

| Yêu cầu trong file                                             | Hiện trạng                                                                           | Vì sao FE không thể tự hoàn tất                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mục 4: trả một kho trong khi các kho khác tiếp tục thuê        | ReturnRequest theo Reservation và tạo inspection cho toàn bộ contracts               | API tạo trả kho không nhận tập contract/unit cần trả; không có luồng trả một phần.                                                         |
| Mục 13: nâng lên kho lớn hơn/hạ xuống kho nhỏ hơn              | Chuyển kho hiện chỉ cùng StorageType                                                 | `TransfersService.approve` từ chối kho đích khác StorageType. Không thể mở picker khác loại rồi báo duyệt thành công.                      |
| Mục 6, BR-07 và ERD: một hợp đồng có nhiều rental-unit history | Contract trỏ một ReservationUnit hiện tại; lịch sử from/to giữ trong TransferRequest | FE đã bổ sung lịch sử chuyển theo hợp đồng từ hồ sơ thật. Quan hệ `contracts → rental_units` của ERD vẫn chưa được triển khai nguyên dạng. |
| ERD: hóa đơn/gia hạn theo hợp đồng                             | Invoice và RenewalRequest gắn Reservation                                            | Với nhiều kho, không thể khẳng định thanh toán/gia hạn từng hợp đồng độc lập đúng thiết kế chỉ bằng FE.                                    |
| Mục 16: bàn giao và access credentials có cấu trúc             | Có HandoverAppointment, ghi chú và workflow bàn giao                                 | Không có bảng/API `handovers` và `access_credentials` riêng để xem/gán/truy vết chìa khóa/thẻ/mã như ERD.                                  |
| Mục 17–18 và ERD: cập nhật ticket, lịch sử trạng thái unit     | Hồ sơ có các trường xử lý và mốc thời gian hiện tại                                  | Chưa có bảng/API `ticket_updates`, `unit_status_history` để thể hiện toàn bộ lần cập nhật.                                                 |
| ERD: dòng hóa đơn, tiện ích và phân công nhân viên             | Không có các model `invoice_items`, `amenities`, `staff_assignments` riêng           | Không bổ sung dữ liệu hoặc cấu trúc giả ở FE. Snapshot báo giá/danh mục và assignedStaff hiện tại chỉ phản ánh mô hình đang chạy.          |

Bằng chứng chính: `BE/src/modules/manager/manager-units.controller.ts`, `BE/src/modules/storage/storage.controller.ts`, `BE/src/modules/transfers/transfers.service.ts` (điều kiện cùng StorageType), `BE/src/modules/returns/returns.service.ts` (tạo inspections từ toàn bộ contracts), `BE/src/modules/auth/admin-users.controller.ts` và `BE/prisma/schema.prisma`.

## Đối chiếu BR-01 đến BR-15

| Quy tắc                                       | Đánh giá                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| BR-01, BR-08: không trùng đặt/thuê kho vật lý | FE dùng trạng thái, allocations và xử lý lỗi BE; BE có kiểm tra/khóa khi cấp kho. Chưa kiểm thử concurrent writes trên DB thật. |
| BR-02: kiểm tra toàn kỳ                       | Form kiểm tra mới gọi `/booking/availability`; không lấy số kho AVAILABLE hiện tại làm kết luận cho toàn kỳ.                    |
| BR-03: kiểm tra không giữ kho                 | Form chỉ gọi API kiểm tra đọc, không tạo reservation/allocation.                                                                |
| BR-04: submit kiểm tra lại ở BE               | Source BE kiểm tra khi tạo/confirm. FE không tự duyệt dựa vào snapshot cũ; không chứng nhận bằng mutation DB thật.              |
| BR-05: quantity > 1                           | Hiển thị quantity, kho/hợp đồng liên quan; form kiểm tra hỗ trợ 1–3 theo BE.                                                    |
| BR-06: một Reservation nhiều Contract         | Bảng hợp đồng và các kho liên quan; không gộp thành một unit hoặc một contract duy nhất.                                        |
| BR-07: lịch sử rental-unit, tối đa một active | Lịch sử TransferRequest đã hiển thị; mô hình ERD rental_units riêng còn thiếu như bảng trên.                                    |
| BR-09: hết hạn không tự AVAILABLE             | Xem quá hạn độc lập với trạng thái vật lý; không tự sửa trạng thái theo đồng hồ FE.                                             |
| BR-10: phải kiểm tra khi trả                  | Hiển thị từng inspection, việc tiếp theo và maintenance; không có nút FE bỏ qua kiểm tra để đổi AVAILABLE.                      |
| BR-11: gia hạn kiểm tra future reservations   | Hiển thị thông tin rủi ro/giới hạn từ API, gọi approve/reject; kiểm tra cuối cùng nằm ở BE.                                     |
| BR-12: Inquiry không giữ kho                  | Tách luồng inquiry, không hiện như đơn đã gán kho/hợp đồng/thanh toán.                                                          |
| BR-13: giá chưa biết không phải 0             | `money()` trả “Cần xác nhận báo giá”; trường chính sách thiếu được ghi cần xác nhận.                                            |
| BR-14: gần nhau là ưu tiên                    | Hiển thị preference, không hứa bảo đảm các kho nằm cạnh nhau.                                                                   |
| BR-15: đổi đầu vào bỏ kết quả khả dụng cũ     | Form mới xóa kết quả khi đổi loại/ngày/số lượng; khóa đầu vào trong khi gửi kiểm tra.                                           |

## Chính sách chưa được file duyệt và phạm vi không mở rộng

File mục 9 và 30 ghi chưa chốt giá ngắn ngày, cọc, giảm giá, phí trễ, phí chuyển kho và bồi thường. Source BE hiện đã có Pricing V1, daily rental, giảm giá/cọc và mức mất khóa 200.000 VND. **Đây là khác biệt phiên bản yêu cầu**, không phải bằng chứng rằng file đã phê duyệt các mức này. FE hiển thị dữ liệu/snapshot thật và không thay logic BE. Cần chủ dự án xác nhận chính sách trước khi kết luận phần tài chính đúng hoàn toàn với file.

Không bổ sung logistics, marketplace, đa cơ sở, thuê theo giờ hoặc module bảo hiểm/bồi thường độc lập ngoài phạm vi mục 31. Không có thanh toán cổng giả hoặc tự coi khách đã trả tiền; khoản thu/hoàn thủ công yêu cầu xác nhận giao dịch thực tế. Tìm kiếm, phân trang, in và CSV là tiện ích giao diện, không được tính thành use case kinh doanh bổ sung.

Không suy “mọi endpoint ADMIN được phép gọi” thành “mọi endpoint là một use case ADMIN người dùng đã yêu cầu”. Quyền truy cập API, chức năng FE hiện có và yêu cầu được chốt được ghi riêng ở bảng trên.

## Điều chỉnh FE sau lần đối chiếu này

- Tổ chức 7 mục Admin bằng tiếng Việt; tách tài khoản/vai trò/trạng thái và thêm màn hình phân công hỗ trợ/bảo trì.
- Trang quyền là thông tin quyền đang chạy; cấu hình/logs ghi rõ phần chưa hỗ trợ, không có lưu giả.
- Bổ sung khả dụng toàn kỳ, hủy kết quả cũ khi đổi đầu vào.
- Bổ sung lịch sử chuyển theo hợp đồng, người và thời điểm kiểm tra trả kho, người xử lý hồ sơ; danh mục thêm nhóm kích thước/trạng thái và xử lý giá/chính sách chưa biết.
- Giữ điều hướng Admin trong `/admin/facility`, bao gồm liên kết liên quan, URL cũ và đăng nhập từ đường dẫn manager đã lưu.

## Kiểm chứng

Kiểm tra TypeScript, lint, production build và Playwright. Browser smoke intercept toàn bộ API, bao gồm các thao tác ghi; kiểm thử không ghi DB thật. Các test mới kiểm tra 7 mục quản trị, phân công mở đúng hồ sơ Admin, trang trạng thái không tạo tài khoản, khả dụng đủ/thiếu toàn kỳ và mất hiệu lực khi đổi đầu vào, metadata kiểm tra và lịch sử chuyển kho. Kết quả kiểm chứng kỹ thuật không đổi các dòng “chưa hoàn tất” thành “đã đáp ứng”.
