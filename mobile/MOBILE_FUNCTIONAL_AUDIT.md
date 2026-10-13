# Đối chiếu chức năng mobile WDP

Nguồn: `WDP_STORAGE_MASTER_SPEC_FOR_AI.md`, bảy use case Admin do người dùng chốt, controllers/services/DTO/guards của BE ở commit `c70540a`. Không thay đổi BE source, schema hoặc seed. Ngày 14/10/2026, theo yêu cầu trực tiếp của người dùng, tạo đúng hai tài khoản ACTIVE mới: Admin và Manager; không sửa tài khoản/mật khẩu cũ hoặc dữ liệu nghiệp vụ. Dùng lại màu, kiểu chữ và bố cục card/form của mobile hiện có; web FE không được thiết kế lại trong lượt này.

## Manager và vận hành của Admin

Các màn hình dùng `/manager/<resource>` cho Manager, `/admin/facility/<resource>` cho Admin; API dùng `/manager/*` vì BE cho phép cả hai role. API `/admin/users` chỉ được gọi trong khu vực Admin.

| Phân hệ | API và thao tác mobile |
| --- | --- |
| Tổng quan | GET manager/dashboard/summary; số liệu thật, không fallback số mẫu |
| Tư vấn | GET list/detail, PATCH status/internalNotes; yêu cầu chưa giữ kho |
| Đặt kho | GET list/detail; PATCH status khi PENDING; xác nhận/từ chối/hủy/hết hạn theo BE |
| Kho vật lý | GET list/detail, lịch phân bổ hiện tại/tương lai/lịch sử; BE chưa có API cập nhật thông tin kho |
| Loại kho, giá và khả dụng | GET booking/catalog; POST booking/availability theo toàn kỳ, quantity, ưu tiên gần nhau, kế hoạch thanh toán; không tự giữ kho hoặc tính giá |
| Dịch vụ bổ sung | GET/POST/PATCH additional-services; tên/mã/mô tả/giá/đơn vị tính/ảnh/active; GET/PATCH inventory; không đổi kind đã tồn tại vì BE không chuyển inventory tương ứng |
| Khách hàng | GET list/detail; hồ sơ/yêu cầu liên quan |
| Lịch bàn giao | GET list/detail; PATCH confirm khi REQUESTED |
| Hợp đồng | GET list/detail, kho, thời hạn, lịch sử và liên kết các hồ sơ liên quan |
| Kho đang thuê | GET list/detail, hợp đồng, quá hạn, hóa đơn, gia hạn và rủi ro lịch phân bổ |
| Gia hạn | GET list/detail, POST approve/reject khi PENDING |
| Chuyển kho | GET list/detail, POST create cho hợp đồng ACTIVE; approve kho đích AVAILABLE cùng loại/reject khi REQUESTED |
| Trả kho | GET list/detail; quan sát kiểm tra thực tế và quyết toán. Ghi nhận hiện trường thuộc luồng Staff |
| Hóa đơn/khoản thu | GET list/detail đầy đủ trang; POST invoices/:id/payments với số tiền nguyên không vượt số dư và xác nhận đã nhận tiền |
| Thông báo chuyển khoản | GET list/detail; POST verify có mã đối chiếu hoặc reject có lý do, chỉ PENDING_VERIFICATION |
| Quyết toán cọc | GET list/detail; review chính xác mọi inspection ISSUE_FOUND; ràng buộc trách nhiệm/phí/lý do theo BE; refund chỉ APPROVED có tiền hoàn và không còn thu bổ sung |
| Bảo trì | GET list/detail; create kho AVAILABLE, assign STAFF, đổi priority; verify/reject-verification khi AWAITING_VERIFICATION |
| Hỗ trợ | GET list/detail, assign/reassign/priority khi chưa RESOLVED; Manager resolve chỉ ESCALATED |
| Báo cáo | Tổng hợp số liệu thật từ dashboard và toàn bộ invoices/payments; không tự coi cọc/phí là doanh thu thuê; BE chưa có báo cáo theo khoảng ngày |

## Admin: đúng bảy nhóm chức năng

1. **Quản lý tài khoản người dùng:** list/filter/detail; POST tạo STAFF hoặc MANAGER. Không tự thêm tạo ADMIN, reset/xóa mật khẩu hoặc sửa hồ sơ khi BE không hỗ trợ.
2. **Vai trò và quyền:** xem ma trận theo guards BE. Chưa có API đổi role hay sửa nhóm quyền.
3. **Phân công nhân viên:** hỗ trợ/bảo trì đang mở; chọn STAFF ACTIVE từ admin/users và phân công/reassign. Chưa có phân công ca/khu vực tổng quát.
4. **Cấu hình cơ sở:** health, danh mục kho/giá và dịch vụ/tồn kho thật. Chưa có API cấu hình Facility.
5. **Tổng quan hệ thống:** số lượng user theo role/status và dashboard vận hành thật.
6. **Nhật ký hoạt động:** thông báo thiếu API audit log. Có thể xem người/thời điểm xử lý trong từng hồ sơ, không chế nhật ký hệ thống.
7. **Trạng thái tài khoản:** PATCH ACTIVE/DISABLED; xác nhận và chặn vô hiệu hóa tài khoản của phiên đang dùng.

Tài khoản/đăng xuất là tiện ích phiên của mỗi role, không thêm một use case quản trị ngoài bảy nhóm trên.

## Bảo toàn Customer và Staff

Các màn hình Customer/Staff hiện có được giữ lại. Login, khôi phục phiên, timeout, phân trang, dữ liệu appointment và account đã được kiểm tra hồi quy. Manager/Admin không đi qua workspace Customer/Staff. Bản mở rộng này tập trung vào chức năng Admin/Manager được người dùng yêu cầu; không tuyên bố Customer/Staff mobile đã bao phủ mọi quy trình web trong file gốc.

## Giới hạn thực tế

- Các API còn thiếu của BE: CRUD loại/kho vật lý/giá/vị trí, Facility configuration, role/permission editing, audit logs và staff assignments tổng quát.
- Transfer BE chỉ cùng StorageType; trả/gia hạn/hóa đơn theo Reservation và các giới hạn mô hình đã ghi ở `FE/FUNCTIONAL_AUDIT_2026-10-13.md`.
- Manager chưa có API danh bạ STAFF. Mobile cho nhập mã do Admin cung cấp; BE xác minh tài khoản. Admin chọn từ danh bạ STAFF ACTIVE.
- Mật khẩu đã thử trước đây không khớp hash của bốn tài khoản test cũ, dù tài khoản ACTIVE; không reset hoặc bypass. Hai tài khoản mới đã kiểm chứng đăng nhập và API đọc protected bằng BE thật. Chưa thực hiện giao dịch thanh toán/ghi nghiệp vụ thật trong lượt này.
- Android Expo Go đã chạy trên emulator riêng; Admin/Manager login, tổng quan và account đã kiểm chứng bằng phiên thật. iOS và thiết bị thật chưa được chạy.

## Kiểm tra

- TypeScript, Expo lint và web export đã qua. Android đã tải bundle mới và hiển thị form login bốn vai trò; route Manager khi chưa có phiên vẫn về login.
- Kiểm thử tạm đã thực hiện: bốn role/16 tổ hợp workspace, Admin/Manager list/detail của 18 phân hệ, phân trang khi BE giới hạn 25, thao tác vận hành, xác nhận tiền, retry cùng key, bảy mục Admin, tài khoản/status/self guard, logout. Tất cả API bị chặn; không ghi dữ liệu thật. Các script tạm đã được xóa theo yêu cầu người dùng sau kiểm thử.
- Hồi quy tạm Customer/Staff đã qua: 105 invoice, dữ liệu customer của appointment, form login và 401.
- Kết quả bài kiểm thử vận hành: cả Admin/Manager qua 18 danh sách/chi tiết; 40 POST/PATCH giả lập (gồm kiểm tra khả dụng và retry), 16 tổ hợp role/workspace, browser errors 0, database writes 0. Hồi quy Customer/Staff qua. Kiểm thử cấu hình test cũ dừng ở CUSTOMER login 401; kết quả tài khoản mới được bổ sung dưới đây.
- Web dùng SPA; không tạo tĩnh URL hồ sơ chứa ID ở build time. Metro chạy hai worker trên máy RAM ít. Không tăng heap để che lỗi render hoặc giả các kết quả API.
- Trước khi sửa, Metro hết heap ở khoảng 2 GB trong lượt kiểm thử nhiều trang. Đã sửa render chuỗi rỗng ngoài Text, chuyển web sang SPA và giảm worker. Sau lượt kiểm thử qua, tiến trình Expo còn khoảng 216 MB working set tại thời điểm đo. Đây là quan sát một lượt chạy, không chứng nhận không có lỗi bộ nhớ trong mọi thời gian sử dụng.

## Xác minh đăng nhập thật ngày 14/10/2026

- Tạo đúng hai tài khoản người dùng yêu cầu, lưu mật khẩu bằng thuật toán scrypt hiện tại của BE; không thêm tài khoản demo. Mật khẩu chỉ trao cho người dùng, không lưu trong repo.
- Hai role: login 200, auth/me 200 và đúng ID/role; mỗi role kiểm tra 19 API danh sách/tổng quan và 10 chi tiết có dữ liệu. Admin đọc admin/users 200; Manager bị chặn 403 đúng quyền.
- FE 5173 và mobile web 8081: cả hai tài khoản login/logout thành công, đi đúng /admin hoặc /manager; không chặn API, browser errors 0, không ghi dữ liệu nghiệp vụ.
- Android: nhập thật email/mật khẩu, vào tổng quan và account đúng vai trò/email, logout trở về form sạch. Email Next chuyển focus sang mật khẩu; Password Done gửi giá trị native mới nhất. Không đổi giao diện.
- Dọn script kiểm thử, ảnh và XML tạm; đóng các phiên kiểm thử. Giữ hai tài khoản mới và emulator/server để người dùng sử dụng.

## Rà soát bổ sung đường dẫn và ô nhập ngày 14/10/2026

- Form login dùng TextInput có value/onChangeText của React Native; bỏ Host/Compose khỏi form này để vùng chạm, bàn phím và dữ liệu nhập do cùng hệ thống React Native xử lý. Giữ bố cục, kích thước, màu và kiểu card; không thiết kế lại giao diện.
- Android đã xác nhận chạm Email mở bàn phím màn hình, nhập email, Next focus mật khẩu, nhập mật khẩu, Done đăng nhập thành công với cả Admin và Manager. Admin mở form tài khoản, nhập thử họ tên rồi rời form; không bấm lưu và không tạo bản ghi.
- Khôi phục phiên có revision để kết quả cũ không ghi đè phiên mới. Lỗi mạng khi kiểm tra phiên không tự xóa token; 401/403 vẫn xóa phiên không hợp lệ. Logout xóa user khỏi màn hình ngay.
- Kiểm tra bằng API thật: 139 trang tổng cộng trên FE/mobile web; gồm Admin web 37, Admin mobile web 40, Manager web 30, Manager mobile web 32. Không chặn API đọc; mọi ghi nghiệp vụ bị chặn trong lượt duyệt để không tác động dữ liệu. Browser errors 0, bản ghi/tài khoản mới 0.
- Web đã rà 1.958 liên kết Admin và 1.371 liên kết Manager trong đúng namespace. Hai liên kết người dùng báo lỗi được bấm trực tiếp trên tab Admin và giữ /admin/facility; Admin không mất menu quản trị. Link hồ sơ liên quan kế thừa namespace từ layout thay vì chỉ dựa vào role ở từng link.
- Hồi quy portal/roles có sẵn qua: 15 danh sách/chi tiết, các quyết định/xử lý, 7 nhóm Admin, 16 tổ hợp role/workspace, 37 POST/PATCH giả lập, API sai role 0, browser errors 0, database writes 0. Kiểm thử này không xác nhận giao dịch tiền thật.
- Typecheck/lint web và mobile, Vite build và Expo web export qua. Chỉ dùng tài khoản có sẵn. Script/ảnh/XML kiểm thử tạm được dọn; giữ server/emulator vận hành.
- Bổ sung kiểm tra Admin và Manager: gõ từng ký tự giữ đúng giá trị Email/Mật khẩu; Enter login; URL resource không có trong danh mục (kể cả khóa prototype) hiển thị không tìm thấy, không gọi API giả; mở workspace sai role quay về role của phiên. Giả lập auth/me 503 giữ token, tải lại khi API phục hồi lấy đúng hồ sơ; giả lập 401 xóa token. Browser errors 0, không tạo tài khoản/bản ghi nghiệp vụ. Script kiểm thử bổ sung đã dọn.
