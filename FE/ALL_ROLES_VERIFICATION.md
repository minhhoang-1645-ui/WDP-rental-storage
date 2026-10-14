# Rà soát chức năng, phân quyền và đường dẫn của bốn vai trò

Ngày: 11/10/2026. Đối chiếu file `C:/Users/luanq/Downloads/WDP_STORAGE_MASTER_SPEC_FOR_AI.md`, controller/service/DTO của BE, schema Prisma và giao diện FE. Riêng Admin sử dụng đúng 7 use case người dùng bổ sung; file gốc không có danh sách Admin. Nội dung trong tài liệu dự án được dùng làm yêu cầu sản phẩm, không thay thế chỉ dẫn của người dùng.

**Kết luận:** các luồng FE dùng API hiện có đã được hoàn thiện và kiểm thử theo phạm vi bên dưới. Chưa thể kết luận đủ toàn bộ thiết kế hoặc không còn bất kỳ lỗi nào của hệ thống, vì còn thiếu API/mô hình dữ liệu và một điểm phân quyền ở BE. Không sửa BE, database, migration hay seed.

## Đường dẫn và quyền truy cập giao diện

| Vai trò  | Khu vực     | Chức năng FE                                                                                                                                                                                                                     |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manager  | `/manager`  | Tổng quan, danh mục/khả dụng, kho, khách hàng, tư vấn, đặt kho, báo cáo; hồ sơ nghiệp vụ tại `/manager/operations/:resource` và `/:id`.                                                                                          |
| Admin    | `/admin`    | Đúng 7 mục: tổng quan, tài khoản, vai trò/quyền, phân công, cấu hình, nhật ký, trạng thái tài khoản. Vận hành theo quyền BE tại `/admin/facility/...`.                                                                           |
| Staff    | `/staff`    | Tổng quan; danh sách/chi tiết lịch bàn giao, kho đang thuê, trả kho, bảo trì, hỗ trợ; hoàn tất chuyển kho tại `/staff/transfers`.                                                                                                |
| Customer | `/customer` | Tổng quan, đặt kho/chi tiết yêu cầu, hợp đồng, kho đang thuê, hóa đơn/khoản thu, lịch hẹn, gia hạn, trả kho/quyết toán cọc, nhu cầu chuyển kho, hỗ trợ, hồ sơ. Wizard công khai `/booking` cho khách chưa đăng nhập và Customer. |

- Guard chặn truy cập khu vực vai trò khác. Admin mở URL Manager cũ được chuyển sang màn hình tương ứng tại `/admin/facility`, giữ bộ lọc và hash; người dùng vẫn là Admin.
- Menu, liên kết hồ sơ liên quan và nút quay lại giữ khu vực của người đang đăng nhập. Footer công khai dẫn về khu vực đúng vai trò.
- Đường dẫn riêng không hợp lệ có trang không tìm thấy và nút về tổng quan đúng vai trò. Tên resource giả như `constructor` không tạo yêu cầu API.
- Đăng nhập chỉ trở lại đường dẫn của vai trò đó; giữ query/hash hợp lệ, loại URL ngoài và đường dẫn vượt sang khu vực khác. Đổi tài khoản từ tab khác xác thực lại role; đăng xuất và phiên hết hạn xóa khu vực cũ.
- Prefix URL giao diện không phải prefix API bắt buộc: Admin dùng `/admin/facility` nhưng gọi `/manager/*` được BE cho phép. Chặn giao diện không thay thế guard của BE.

## Staff đối chiếu mục 2.2 của file dự án

| Yêu cầu                                    | Hiện trạng                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xem lịch/check-in/trả kho/hỗ trợ hằng ngày | Tổng quan công việc, danh sách/chi tiết; lọc lịch bàn giao theo ngày tại cơ sở (UTC+7), trạng thái, tìm kiếm và việc được giao.                                            |
| Kiểm tra thông tin booking/reservation     | Xem khách hàng, liên hệ, yêu cầu và kho/hợp đồng trong hồ sơ tác nghiệp. Duyệt Reservation hoặc xác nhận lịch thuộc Manager/Admin trong BE; không cấp nút đó cho Staff.    |
| Xác nhận bàn giao thực tế                  | POST `/staff/appointments/:id/complete-handover`, chỉ lịch CONFIRMED; xác nhận đã bàn giao thực tế trước khi gửi.                                                          |
| Gán/truy cập thông tin kho vật lý          | Xem kho/vị trí trong hồ sơ tác nghiệp. Phân bổ kho hiện do BE thực hiện khi Manager/Admin duyệt Reservation; chưa có API cho Staff tự gán kho.                             |
| Cấp khóa/chìa/thẻ/mã truy cập              | Chưa đủ: chỉ có ghi chú bàn giao/hỗ trợ; thiếu model/API access credentials có cấu trúc.                                                                                   |
| Cập nhật trạng thái kho                    | Qua workflow bàn giao, nhận trả và bảo trì; không thêm nút đổi AVAILABLE tùy ý. Nghiệm thu bảo trì do Manager/Admin.                                                       |
| Nhận kho trả                               | Bắt đầu kiểm tra, ghi đủ kết quả từng kho và xác nhận nhận thực tế trước khi finalize.                                                                                     |
| Ghi kiểm tra hiện trạng                    | PASS/ISSUE_FOUND, loại vấn đề, ghi chú, người và thời gian kiểm tra. Không chuyển ISSUE_FOUND thành PASS để xóa vấn đề đã ghi.                                             |
| Xử lý hỗ trợ                               | Nhân viên được giao bắt đầu, giải quyết với loại kết quả được phép hoặc chuyển quản lý. Không cho Staff dùng kết quả xử lý dành riêng Manager.                             |
| Ghi mất chìa/truy cập/hư hỏng              | Qua loại sự cố hỗ trợ và loại vấn đề kiểm tra; Staff không duyệt số tiền phạt/khấu trừ/hoàn cọc.                                                                           |
| Phối hợp bảo trì                           | Báo sự cố kho sẵn sàng bằng ID thực, bắt đầu công việc được giao, gửi kết quả sửa chữa, chờ quản lý nghiệm thu. Thiếu API danh mục kho cho Staff nên không tạo picker giả. |

Staff hoàn tất chuyển kho thực tế bằng mã lệnh được quản lý cung cấp. BE có POST complete nhưng không có GET danh sách/chi tiết transfer cho Staff; FE thông báo giới hạn này và không gọi API Manager để vượt quyền.

## Customer đối chiếu mục 2.1 và các quy tắc nghiệp vụ

- Danh mục, loại/kích thước/điều kiện/khả dụng, số lượng 1–3 cùng loại, mong muốn liền kề, ngày và thời hạn: theo catalog/availability/wizard hiện có. Khả dụng không phải giữ kho; snapshot báo giá giữ đúng dữ liệu API.
- Guest gửi tư vấn; Customer gửi Reservation. Tài khoản nội bộ được chuyển về khu vực riêng trước khi tải wizard.
- Xem nhiều yêu cầu, hợp đồng, kho thuê, hóa đơn, khoản thu, lịch, hỗ trợ và quyết toán; các endpoint phân trang đọc đủ trang, giao diện chia trang 20 hồ sơ. Không cắt mất dữ liệu sau 100 bản ghi.
- Đặt lịch chỉ với đủ hợp đồng READY_FOR_HANDOVER của Reservation và chưa có lịch mở; ngày giờ phải ở tương lai.
- Gia hạn loại hồ sơ đang có yêu cầu chờ; trả kho theo điều kiện đến hạn, chưa có yêu cầu trả đang mở và không có gia hạn chờ.
- Hỗ trợ vận hành chọn kho đang thuê; hỗ trợ hóa đơn/vấn đề khác cho phép yêu cầu liên quan theo BE. Gộp mã tham chiếu/ID để không có lựa chọn trùng; contract và unit phải khớp. Thiếu dữ liệu đầu vào có thông báo và thử lại; khóa gửi khi đang tải/lỗi.
- Bốn form tạo lịch/gia hạn/trả/hỗ trợ chặn gửi lặp và giữ Idempotency-Key khi thử lại cùng yêu cầu thất bại. Lỗi không bị thay bằng thành công hoặc dữ liệu mẫu.
- Thanh toán trực tuyến chưa được BE hỗ trợ; Customer xem hóa đơn/khoản thu, Manager ghi nhận thu thủ công qua API hiện có. File dự án yêu cầu thanh toán khi tích hợp tồn tại, không tạo nút thanh toán giả.
- Nhu cầu chuyển kho được gửi qua hỗ trợ; trang Customer theo dõi yêu cầu hỗ trợ liên quan, không coi đó là danh sách lệnh Transfer thật. Chưa có API Customer để tự tạo/theo dõi lệnh Transfer; BE chỉ cho chuyển cùng StorageType.
- Chưa có API cấu hình cơ sở đầy đủ, lịch hẹn trả kho riêng, cấp access credentials và trả từng kho độc lập. Hồ sơ cá nhân hiện chỉ xem do thiếu API sửa. Các giới hạn này không được đánh dấu hoàn tất.

## Manager và Admin còn thiếu gì

Xem [MANAGER_ADMIN_REQUIREMENTS_AUDIT.md](./MANAGER_ADMIN_REQUIREMENTS_AUDIT.md) để đối chiếu 8 chức năng Manager, 7 use case Admin và các quy tắc BR. Các phần chưa thể hoàn tất bằng FE:

- Tạo/sửa loại kho, kho vật lý, vị trí/điều kiện/giá.
- Chỉnh vai trò/quyền; cấu hình Facility đầy đủ; nhật ký audit/activity thật; phân công ca/khu vực.
- Nâng/hạ kích thước kho; trả một phần Reservation; mô hình lịch sử rental_units, invoice/renewal từng contract và các bảng credentials/ticket_updates/unit_status_history theo ERD.

## Điểm phân quyền còn tồn tại ở backend

`BookingController.create` tại POST `/api/reservations` chỉ dùng AuthGuard; `BookingService.createReservation` không kiểm tra `user.role === 'CUSTOMER'`. Vì vậy code BE hiện không ngăn một tài khoản nội bộ gọi trực tiếp API này để tạo yêu cầu dưới tài khoản của họ. FE đã chặn nội bộ vào wizard, nhưng đây **không phải** sửa quyền ở server. Phát hiện bằng đọc code; không thử tạo dữ liệu thật và không sửa BE theo chỉ dẫn người dùng.

## Kiểm chứng và giới hạn kết quả

- TypeScript, build Vite và oxlint của FE.
- `scripts/portal-smoke.mjs`: Manager/Admin, module danh sách/chi tiết, thao tác quyết định/tài chính, giữ khu vực Admin, dữ liệu nhiều trang, trạng thái lỗi và mobile.
- `scripts/roles-smoke.mjs`: 16 tổ hợp vai trò/khu vực, đường dẫn sai, returnTo, guard booking, công việc Staff, form Customer, phân trang hơn 100 hồ sơ, thử lại, mobile 390px, đổi tài khoản giữa tab, hết phiên và đăng xuất.
- Kiểm thử trình duyệt chặn toàn bộ `/api/*`, bao gồm ghi, để trả dữ liệu mô phỏng. Không ghi database nghiệp vụ thật. Kết quả này kiểm tra FE và hợp đồng API mô phỏng, không chứng minh transaction/concurrency hoặc quyền server cho cả bốn tài khoản thật.
- BE đang chạy: kiểm tra sức khỏe; đăng nhập Manager và đọc 5 API Staff projection thành công; Manager nhận 403 ở `/admin/users` và `/customer/contracts`. Không có sẵn thông tin đăng nhập thật cho cả ba vai trò còn lại để kiểm chứng tương tự.
- Không chạy test BE có cleanup dữ liệu, migration hoặc seed. Không cam kết hệ thống đã đủ thiết kế hay không thể phát sinh lỗi ngoài phạm vi đã kiểm tra.

Kết quả chạy cuối: TypeScript/build Vite/oxlint thành công; portal smoke đạt 15 module và 17 thao tác ghi mô phỏng; roles smoke đạt 18 thao tác ghi mô phỏng, 0 yêu cầu API bị hạn chế của vai trò khác và 0 lỗi trình duyệt. Tổng 35 thao tác ghi mô phỏng, 0 ghi database nghiệp vụ thật. Kiểm thử lịch Customer chạy trong browser UTC và xác nhận giờ nhập được gửi đúng UTC+7 của cơ sở. Build vẫn có cảnh báo dung lượng chunk lớn (gói chính khoảng 560 kB và gói trình xem kho 3D khoảng 1 MB trước gzip); build không thất bại, hiệu năng cần đánh giá thêm trên mạng/thiết bị thực tế.
