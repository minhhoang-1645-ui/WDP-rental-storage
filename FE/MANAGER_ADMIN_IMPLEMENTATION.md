# Manager / Admin frontend

**Kết quả đối chiếu yêu cầu: chưa hoàn tất toàn bộ chức năng trong file dự án và 7 use case Admin người dùng bổ sung.** Xem [bảng đối chiếu yêu cầu](./MANAGER_ADMIN_REQUIREMENTS_AUDIT.md) và [use case Admin tiếng Việt](./ADMIN_USE_CASES_VI.md). Các mô tả tích hợp bên dưới nói về API hiện có, không phải chứng nhận đủ phạm vi yêu cầu.

Cập nhật ngày 11/10/2026. Phạm vi chỉ frontend; không chỉnh sửa BE, Prisma schema, migration hay dữ liệu database. Tài liệu tóm tắt người dùng cung cấp được dùng làm ngữ cảnh nghiệp vụ; hợp đồng API và quyền thực tế được đối chiếu từ source backend.

## Đối chiếu hệ thống

Đã đọc cấu trúc module backend, controller, service nghiệp vụ, schema và migration. Các quan hệ chính được giữ đúng: StorageType là loại sản phẩm; StorageUnit là kho vật lý; Reservation có nhiều ReservationUnit và mỗi allocation sinh hợp đồng riêng. Hóa đơn, khoản thu và quyết toán cọc là các hồ sơ riêng, không suy tiền cần thu từ trạng thái đặt kho.

Source backend hiện có Pricing V1 và báo giá lịch sử. Frontend hiển thị giá/snapshot API cung cấp; giá chưa có không được đổi thành 0. Tài liệu tóm tắt mô tả một số phần giá còn chờ quyết định, nên không dùng mô tả đó để thay đổi logic giá đang chạy trong BE.

Không tìm thấy bản vẽ thiết kế riêng trong repository. Giao diện bám palette navy/cam WDP và cấu trúc nghiệp vụ từ tài liệu, schema và API.

## Những phần frontend đã nối API

| Phân hệ                  | Chức năng frontend                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tổng quan manager        | Tình trạng toàn bộ kho, tỷ lệ sử dụng, hàng đợi nghiệp vụ, đặt kho chờ duyệt, lịch bàn giao sắp tới, tổng dư nợ                                                                 |
| Kho vật lý / danh mục    | Tìm/lọc kho, chi tiết vị trí và lịch phân bổ; xem loại kho, kích thước, giá và chính sách hiện có; kiểm tra khả dụng toàn kỳ theo ngày/số lượng                                 |
| Khách hàng               | Tìm kiếm, xem liên hệ, trạng thái tài khoản và lịch sử đặt kho                                                                                                                  |
| Tư vấn                   | Tách INQUIRY khỏi RESERVATION, cập nhật trạng thái liên hệ và ghi chú nội bộ; xem báo giá, ưu tiên kho gần nhau, lần kiểm tra khả dụng                                          |
| Đặt kho                  | Tìm/lọc toàn bộ danh sách, xem phân bổ, quyết định hồ sơ PENDING; liên kết hóa đơn, hợp đồng và lịch bàn giao                                                                   |
| Lịch bàn giao            | Tìm/lọc theo trạng thái và ngày, xem hồ sơ, xác nhận lịch REQUESTED                                                                                                             |
| Hợp đồng / kho đang thuê | Chi tiết kho vật lý, kỳ thuê, báo giá; theo dõi quá hạn và nguy cơ lịch phân bổ                                                                                                 |
| Hóa đơn / khoản thu      | Xem từng kỳ thu, dư nợ, lịch sử khoản thu; ghi nhận tiền mặt/chuyển khoản đã nhận, có chống gửi lặp và giữ idempotency key khi thử lại thao tác thất bại                        |
| Gia hạn                  | Duyệt hoặc từ chối kèm lý do; xem hóa đơn gia hạn, không tự đổi ngày kết thúc trước khi backend hoàn tất thanh toán                                                             |
| Trả kho                  | Theo dõi nhận kho, kết quả kiểm tra từng kho, công nợ và liên kết quyết toán                                                                                                    |
| Hỗ trợ                   | Phân công STAFF, đổi ưu tiên; manager giải quyết hồ sơ ESCALATED với đúng nhóm kết quả được API cho phép                                                                        |
| Chuyển kho               | Tạo từ hợp đồng ACTIVE, tùy chọn liên kết support cùng reservation; duyệt kho đích cùng loại bằng ID thật hoặc từ chối; staff xác nhận chuyển thực tế                           |
| Bảo trì                  | Tạo trên kho AVAILABLE, phân công, đổi ưu tiên; nghiệm thu hoặc trả sửa khi AWAITING_VERIFICATION                                                                               |
| Quyết toán cọc           | Duyệt đầy đủ ISSUE_FOUND trong physicalInspections; phân loại trách nhiệm, phí/lý do; xem khấu trừ, thu thêm, hoàn cọc; ghi nhận khoản hoàn thực tế đủ điều kiện                |
| Báo cáo                  | Tổng hợp toàn bộ trang dữ liệu, lọc ngày UTC+7, phân biệt tổng hóa đơn và tiền nhận trong kỳ, xuất CSV tiếng Việt                                                               |
| Admin                    | 7 mục tiếng Việt; dashboard, tài khoản, trạng thái và phân công hỗ trợ/bảo trì dùng API thật; vai trò, cấu hình và audit logs ghi rõ giới hạn. Vận hành trong `/admin/facility` |

Các màn hình có loading/error/empty/retry, bộ lọc URL, phân trang, thông báo kết quả và khóa thao tác khi đang lưu. Detail tự tải lại sau thao tác thành công. Dialog hỗ trợ bàn phím và mobile có drawer điều hướng. Hồ sơ có chế độ in.

Admin xử lý nghiệp vụ trong `/admin/facility` với cùng menu quản trị, gồm cả danh sách, hồ sơ chi tiết, liên kết liên quan và nút quay lại. Manager dùng `/manager`. URL manager cũ và đường dẫn lưu trước đăng nhập được chuyển về khu vực admin tương ứng khi người dùng là ADMIN; bộ lọc được giữ nguyên. Các màn hình dùng chung API `/manager/*` theo quyền ADMIN sẵn có của backend.

## Giới hạn giữ nguyên vì không sửa backend

- Không có API CRUD loại kho, giá, vị trí kho hay cấu hình hệ thống. Những màn hình này chỉ đọc; không có nút lưu giả.
- Không có API danh bạ STAFF cho MANAGER. Manager chọn nhân viên đã xuất hiện trong lịch sử hoặc nhập mã tài khoản do admin cung cấp. Admin có picker danh bạ từ `/admin/users`.
- API admin chỉ tạo STAFF/MANAGER và thay accountStatus; không hỗ trợ đổi role, xóa tài khoản, đặt lại mật khẩu hay tạo ADMIN.
- FE Manager ưu tiên xem hồ sơ bàn giao/kiểm tra theo actor của file yêu cầu (STAFF thực hiện tại cơ sở). API bàn giao và kiểm tra trả kho thực tế cho cả STAFF/MANAGER/ADMIN; không coi đây là quyền STAFF-only. API bắt đầu sửa chữa và hoàn tất chuyển kho chỉ cho STAFF.
- Không hiển thị hủy đặt kho đã CONFIRMED: endpoint hiện giải phóng allocation mà không đóng các hợp đồng/hóa đơn hay kiểm tra thuê đang hoạt động. FE chỉ đưa ra quyết định khi PENDING; đã giữ nguyên BE.
- Backend trả được PENDING_SETTLEMENT nhưng controller danh sách returns không nhận bộ lọc này. FE tải đủ trang và lọc tại client khi chọn trạng thái đó.
- Không giả lập payment gateway. Ghi nhận thanh toán/hoàn tiền cần xác nhận tiền đã được nhận/hoàn ngoài hệ thống. Mất khóa dùng mức 200.000 VND hiện được BE bắt buộc; hao mòn/lỗi cơ sở bằng 0.
- Dashboard/báo cáo phải tải đầy đủ danh sách vì BE chưa có API aggregate tài chính. Khi một nguồn lỗi, FE báo lỗi thay vì hiển thị tổng 0 gây hiểu nhầm. Số tiền nhận trong báo cáo chưa trừ hoàn cọc vì chưa có API sổ thu/chi tổng hợp.

## Kiểm tra

- TypeScript build, Vite production build và oxlint.
- Kết nối backend thật: đăng nhập manager, đọc thành công 15 endpoint danh sách, mở các danh sách và hồ sơ chi tiết hiện có, không thấy lỗi runtime. Không thực hiện mutation nghiệp vụ với database thật.
- Playwright `scripts/portal-smoke.mjs`: intercept toàn bộ `/api/`, kiểm tra danh sách/chi tiết 15 phân hệ; tìm kiếm bản ghi sau 100; phân loại inquiry; bộ lọc rentals/returns; quyết định đặt kho, tư vấn, xác nhận lịch, duyệt/từ chối gia hạn; hỗ trợ đúng quyền; duyệt cọc/hoàn tiền; retry thanh toán cùng key; tạo/duyệt chuyển kho; phân trang picker không submit form; tạo/nghiệm thu bảo trì; báo cáo đầy đủ và CSV; trạng thái lỗi; admin tạo/khóa tài khoản/phân công; viewport 390px và drawer. Không ghi database thật.
- Kiểm thử điều hướng admin: đăng nhập từ URL manager được lưu trước đó, các liên kết tổng quan → hóa đơn → đặt kho → quay lại, toàn bộ 15 danh sách/hồ sơ, refresh và URL cũ vẫn giữ khu vực `/admin/facility` và menu quản trị. Manager bị chặn khỏi khu vực admin.
- Kiểm tra trực quan desktop và mobile. Screenshot admin dùng fixture kiểm thử; screenshot manager desktop được chụp từ API thật.

## Chạy và bàn giao

Đăng nhập tại `/portal/login` bằng tài khoản nội bộ đã có. FE mặc định gọi `http://localhost:3000/api`; `.env.local` máy hiện tại đã được sửa từ cổng 3001 về 3000 cho khớp backend. Xem README để chạy dev/build/browser smoke. Script test dùng Playwright bên ngoài hoặc module cài trong FE; không thêm mock vào sản phẩm.

Máy hiện tại có npm shim lỗi nên kiểm tra được chạy trực tiếp bằng `node` với entrypoint của TypeScript/Vite/oxlint. Vite vẫn báo một số bundle trên 500 kB, bao gồm phần trải nghiệm 3D hiện có; production build hoàn thành.
