# Đối chiếu chức năng WDP ngày 13/10/2026

## Phạm vi và kết luận

Nguồn yêu cầu: `C:/Users/luanq/Downloads/WDP_STORAGE_MASTER_SPEC_FOR_AI.md`. Admin dùng **đúng 7 use case do người dùng bổ sung trong cuộc trò chuyện**; file gốc không định nghĩa Admin. Phiên bản mã nguồn hiện tại: `c70540a` (thêm mobile). Kiểm tra GitHub: nhánh Mobile và luan cùng commit này; dev ở `71fce14`. Không tự checkout, merge hoặc thay đổi BE.

Đã đối chiếu các module/controller/service nghiệp vụ BE, DTO, guard và Prisma schema với FE. Chỉ sửa phía client web và lỗi chạy của client mobile. Không chỉnh BE, `.env` BE, schema, seed, migration, backfill hoặc dữ liệu nghiệp vụ. Theo yêu cầu bổ sung ngày 14/10/2026, tạo đúng hai tài khoản ACTIVE mới Admin/Manager; không sửa tài khoản hoặc mật khẩu cũ. Không thay bố cục, màu, typography, CSS hoặc ảnh của giao diện web. Các trường/nút được bổ sung chỉ phục vụ chức năng API đang có.

**Chưa thể kết luận toàn dự án đúng và đủ 100% file yêu cầu.** Các khoảng cách tại BE được ghi riêng phía dưới; không thay bằng dữ liệu hoặc thao tác lưu giả. API/mock tests của FE qua không đồng nghĩa với đã kiểm chứng giao dịch đồng thời hoặc thanh toán thật.

## Customer và Guest

| Yêu cầu | FE hiện tại và API | Kết quả / giới hạn |
| --- | --- | --- |
| Xem thông tin cơ sở | Trang chủ, footer | Có mô tả; thiếu API Facility/address/contact nên chưa hoàn tất thông tin cơ sở thật. Không điền hotline/email giả. |
| Loại kho, kích thước, điều kiện, sức chứa, khả dụng | `/storage`, `/storage/:id`, `/size-guide`; GET storage/catalog | Dữ liệu danh mục từ BE; ảnh và 3D là minh họa, được giữ vì người dùng yêu cầu giữ giao diện. |
| Quantity, nhiều kho cùng loại, ưu tiên gần nhau | `/booking` bước 1 | 1–3 theo BE; ưu tiên không phải bảo đảm. |
| Ngày bắt đầu, số tháng/ngày kết thúc | `/booking` bước 2 | Date based; dùng giới hạn và báo giá BE, không tính tiền thuê giờ hoặc tự đặt chính sách. |
| Tự kiểm tra toàn kỳ, bỏ kết quả cũ | POST booking/availability và pricing/quote | Tự kiểm tra khi đổi loại/ngày/quantity/ưu tiên/kế hoạch/dịch vụ; hủy request cũ. Kết quả không giữ kho. |
| Dịch vụ bổ sung | Danh mục BE, chọn mua/thuê, quantity, khoảng ngày; GET availability dịch vụ | Đã thay chỗ trống `addons.map(() => null)` bằng luồng thật. Quote và submit gửi cùng selection. BE tính giá và kiểm tra tồn kho/công suất. |
| Guest Contact Inquiry, không ép đăng ký | POST inquiries; confirmation có access token | Giữ luồng tư vấn mặc định, chưa giữ kho/thanh toán. |
| Guest email booking mới | POST guest/booking-requests; `/claim-booking` verify rồi CUSTOMER claim | Luồng tùy chọn; retry giữ key. Không hiển thị developmentClaimUrl hoặc tạo OTP giả. BE chưa hỗ trợ note/adjacency trong luồng email: dùng Inquiry để giữ đủ lựa chọn này. |
| Reservation sau xác thực | POST reservations; `/customer/reservations` và chi tiết | CUSTOMER; PENDING chưa phân kho. FE không tự xác nhận. |
| Báo giá snapshot | Wizard, chi tiết reservation, hợp đồng/quyết toán | Tiền từ server; NULL hiển thị cần xác nhận, không biến thành 0. Snapshot lịch sử được giữ. |
| Thanh toán | `/customer/payments`, QR submission, `/customer/payments/vnpay-return` | Đọc đủ trang API; QR chưa phải Payment. VNPay chỉ hỗ trợ INITIAL/RECURRING/RENEWAL theo BE; SETTLEMENT vẫn có QR nhưng không mở VNPay. Đổi query bỏ kết quả cũ; không gọi IPN từ UI. Cần cấu hình ngân hàng/gateway thật. |
| Nhiều rental/hợp đồng | `/customer/rentals`, `/customer/contracts` | Hiển thị từng kho/hợp đồng trong mô hình BE hiện tại. |
| Gia hạn | `/customer/renewals` | Tạo yêu cầu; BE kiểm tra xung đột và duyệt. Hiện gia hạn cả Reservation, theo tháng, chưa độc lập từng hợp đồng. |
| Chuyển kho | `/customer/transfers` → support → Manager → Staff | Không giả lập Customer tự chuyển; BE chưa có customer transfer API hoặc chuyển khác StorageType. |
| Lịch bàn giao | `/customer/appointments` | Có tạo, đọc và theo dõi lịch bàn giao; chưa có API lịch hẹn trả kho theo giờ. |
| Hỗ trợ | `/customer/support` | Ticket thật, các loại vấn đề BE hỗ trợ; không gửi credential bí mật. |
| Trả kho / quyết toán | `/customer/returns` | Yêu cầu, trạng thái kiểm tra từng kho và quyết toán thật; BE chỉ hỗ trợ trả toàn bộ từ effective end date. |

## Staff

| Yêu cầu | FE / API | Kết quả / giới hạn |
| --- | --- | --- |
| Công việc hằng ngày | `/staff`, appointments/returns/support/maintenance/transfers | Có danh sách, lọc, chi tiết và dữ liệu vận hành; không gọi danh bạ Admin. |
| Verify reservation | Hiển thị bối cảnh đặt kho/hợp đồng trong lịch | BE hiện chỉ cho Manager/Admin quyết định reservation và confirm lịch; thiếu API verify booking riêng cho Staff. |
| Bàn giao vật lý | POST staff/appointments/:id/complete-handover | Chỉ CONFIRMED, xác nhận thực tế, BE kiểm tra hóa đơn/contract/unit. |
| Kho/access credentials | Rental, appointment, note bàn giao | Có thông tin kho và ghi chú; chưa có API cấp/phân loại/key/card/code để quản lý credentials theo thiết kế. |
| Trả, kiểm tra, trạng thái vật lý | staff/returns start-inspection, PATCH inspection, finalize | Ghi từng kho; không cho PASS thay ISSUE_FOUND; phải kiểm tra đủ, xác nhận nhận thực tế. BE quyết định AVAILABLE/MAINTENANCE. |
| Hỗ trợ | start/resolve/escalate | Chỉ nhân viên được giao và đúng trạng thái. Không có quyền duyệt charge/gia hạn. |
| Bảo trì | report/start/complete-work | Chỉ thực hiện việc được giao; Manager nghiệm thu. Không tự mở lại kho. |
| Chuyển kho | GET staff/transfers và complete | Chỉ APPROVED/COMPLETED; xác nhận chuyển thực tế, không có quyền chọn kho đích/duyệt. Đổi ID trang bỏ xác nhận cũ. |

## Manager: 8 yêu cầu tại mục 2.3

| Mã | Yêu cầu | Kết quả |
| --- | --- | --- |
| M01 | Quản lý loại kho | Xem catalog thật. **Thiếu API tạo/sửa loại kho.** |
| M02 | Quản lý kho vật lý | List/detail, vị trí, phân bổ/lịch sử thật. **Thiếu API tạo/sửa dữ liệu kho.** |
| M03 | Kích thước, vị trí, điều kiện, giá | Xem đúng dữ liệu. **Thiếu API cập nhật.** Không có nút lưu giả. |
| M04 | Theo dõi khả dụng | Kho/phân bổ và kiểm tra toàn kỳ bằng API. |
| M05 | Trạng thái vận hành | Quyết định reservation, confirm appointment, support/transfer/maintenance/settlement theo API và trạng thái thực tế. |
| M06 | Review inquiry/reservation | Tách luồng tư vấn/đặt kho; ghi chú, quyết định PENDING. Không mở hủy CONFIRMED vì BE chưa xử lý đầy đủ contract/invoice khi hủy. |
| M07 | Review hoạt động nhân viên/cơ sở | Tổng quan, hồ sơ, người/thời điểm thực hiện, báo cáo từ dữ liệu thật. Chưa có audit/ca/khu vực tổng quát. |
| M08 | Review inspection/maintenance | Từng inspection, người/thời điểm, bảo trì, phân công/nghiệm thu/trả sửa. Chưa có unit_status_history theo ERD. |

Dịch vụ bổ sung nằm trong `/manager/catalog/additional-services`, dùng GET/POST/PATCH manager/additional-services và inventory. Admin dùng `/admin/facility/catalog/additional-services`; không chuyển sang workspace Manager. Tồn kho mới/cập nhật được BE kiểm tra. FE không đổi kind của dịch vụ đã có vì BE hiện không chuyển đổi inventory cùng kind; vẫn sửa tên/mã/mô tả/giá/billing unit/status.

## Admin: đúng 7 use case đã chốt

| Mã | Use case tiếng Việt | Route | Kết quả |
| --- | --- | --- | --- |
| A01 | Quản lý tài khoản người dùng | `/admin/users` | Tìm/lọc/list/detail, tạo STAFF/MANAGER theo API. Không tự thêm xóa/reset password. |
| A02 | Quản lý vai trò và quyền | `/admin/roles` | Xem quyền cố định. **Thiếu API đổi role/quyền.** |
| A03 | Quản lý phân công nhân viên | `/admin/assignments` | Phân công/reassign support/maintenance thật. Chưa có staff_assignments tổng quát. |
| A04 | Quản lý cấu hình cơ sở | `/admin/settings` | Kết nối/phiên/các danh mục, quản lý dịch vụ thật. **Thiếu API đọc/lưu Facility configuration.** |
| A05 | Xem bảng tổng quan hệ thống | `/admin` | Dữ liệu user và vận hành thật; lỗi tải không dùng số mẫu. |
| A06 | Xem nhật ký kiểm toán/hoạt động | `/admin/activity` | **Thiếu nguồn audit log trong BE/schema.** Không chế log bằng localStorage hoặc giả activity log. |
| A07 | Quản lý trạng thái tài khoản | `/admin/account-status` | PATCH ACTIVE/DISABLED; xác nhận, không vô hiệu hóa chính phiên đang dùng. |

## Khoảng cách bắt buộc tại BE, không thể hoàn tất chỉ bằng FE

- CRUD UnitType/PhysicalUnit/pricing/location; Facility information/configuration; đổi roles/permissions; audit/activity logs.
- Booking/reservation verification riêng của Staff; cấp/revoke access credentials có cấu trúc; lịch hẹn trả kho.
- Trả/gia hạn/thanh toán độc lập từng contract trong reservation nhiều kho; transfer nâng/hạ sang loại kho khác. BE transfer từ chối khác StorageType, return finalize toàn bộ quantity.
- Quan hệ rental-unit history, ticket updates, unit status history, invoice items và staff assignments chưa tương đương ERD trong file. Không tạo bản sao giả ở client.
- File chưa duyệt giá daily, cọc, chiết khấu, phí mất khóa; BE đã có Pricing V1 và fee mất khóa. FE phản ánh API, không tự coi đây là chính sách đã được file phê duyệt.
- BE public Inquiry detail luôn trả PENDING_CONTACT từ serializer dù Manager có thể cập nhật trạng thái; FE không tự tạo trạng thái chưa có nguồn đọc đúng.

## Demo và code cũ đã bỏ

- Xác nhận Reservation demo dùng location state và hotline mẫu, các shell/placeholder không được router dùng, CustomerFutureModulePage, bản StaffPages cũ không dùng.
- Mobile app-tabs mẫu trỏ `/explore` không tồn tại gây TypeScript error.
- Trang chủ dùng danh mục add-on BE thay danh sách sản phẩm hardcode. Không fallback sang sample data khi API lỗi. Không hiển thị email claim link thử nghiệm.
- Giữ ảnh/3D minh họa đang dùng theo yêu cầu giữ giao diện. Giữ fixture trong test: fixture bị chặn toàn bộ API, không dùng để chạy app.
- **Không xóa record DEMO/test đã có trong database và không âm thầm lọc mất các record này khỏi FE**, vì người dùng cấm sửa database và cần đối chiếu đủ dữ liệu thực tế.

## Kiểm chứng

- FE TypeScript/lint/build; Vite vẫn có cảnh báo bundle 3D lớn, không phải runtime error.
- `test:portal`: list/detail 15 module, các quyết định/quy trình, 7 mục Admin, đủ trang, đường dẫn Admin, mock writes 17, browser errors 0, database writes 0.
- `test:roles`: 16 tổ hợp role/workspace, Customer/Staff, guard phân công/trạng thái, bốn form, session/cross-tab/logout, mock writes 20, API sai role 0, browser errors 0.
- Kiểm thử chức năng tạm đã qua: add-on/catalog/inventory Manager+Admin, quote/availability/submit đồng nhất, email guest retry cùng key, verify một lần, login return, claim Customer, 105 invoice, QR amount phục hồi, SETTLEMENT không mở VNPay, bỏ VNPay result cũ, confirmation phản ánh CONFIRMED/REJECTED/CANCELLED/EXPIRED đúng. Mock writes 8, database writes/browser errors 0. Script đã dọn theo yêu cầu sau kiểm thử.
- Kiểm thử transport tạm đã qua: API thật được transpile trong bộ nhớ và fetch giả để kiểm tra public/protected/stale 401, offline, timeout, abort/retry; phân trang theo limit thực tế khi server giảm từ 100 xuống 25, giữ bộ lọc, từ chối danh sách lỗi. QR khớp [vector độc lập của tác giả subiz/vietqr](https://github.com/subiz/vietqr#sử-dụng). Chưa chuyển tiền hoặc quét ngân hàng thật. Script đã dọn.
- Mobile TypeScript/lint/web export. Đã phát hiện/sửa: customer của appointment nằm trong reservation, API chỉ lấy 100 records, public login gửi token cũ, request không timeout, component mẫu `/explore`, native width `100%` gây lỗi cast. Đổi width sang số đo tương đương, giữ nguyên style/bố cục. API và account scoped data được xử lý ở client.
- Kiểm thử mobile tạm đã qua: các route Customer/Staff trên viewport 390px, 105 hóa đơn, dữ liệu customer lồng trong reservation, form login gửi email chuẩn hóa và hiển thị 401 đúng; browser errors/database writes 0. Đây là kiểm thử API chặn, không phải đăng nhập thật. Script đã dọn.
- Android chạy thành công trên emulator riêng `WDP_Android35` ở `FE/artifacts/avd`, dùng system image Android 35 16 KB đã cài và Expo Go 57.0.9. AVD Medium_Phone gốc đang tham chiếu system image không còn tồn tại; không sửa AVD gốc. Màn hình login đã được kiểm tra bằng ảnh thật, không còn lỗi cast width hoặc chồng ô nhập. React Native quản lý bố trí form, mỗi input/Button có Host riêng theo [hướng dẫn Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/host/#placing-components-inside-react-native-views). Chưa xác minh native sau đăng nhập vì mật khẩu runtime trả 401.
- Chưa chạy iOS hoặc điện thoại thật. Theo yêu cầu bổ sung sau đó của người dùng, mobile đã có workspace Admin/Manager và các thao tác API được hỗ trợ; chi tiết trong `mobile/MOBILE_FUNCTIONAL_AUDIT.md`. Customer/Staff hiện có được giữ và kiểm tra hồi quy.
- Máy hết dung lượng ổ C trước đó gây Metro ENOSPC và emulator gián đoạn. APK Expo Go 57.0.9/cache Metro vừa tạo được chuyển nguyên vẹn sang `FE/artifacts`; runtime TEMP/TMP đặt trên ổ E; emulator không lưu snapshot lớn. Không xóa cache/package/dữ liệu cũ của người dùng.
- API thật ở lần kiểm tra tài khoản cũ: health/server hoạt động; SELECT READ ONLY thấy bốn test user ACTIVE, hash scrypt đúng định dạng. Mật khẩu từng được cung cấp và các biến PASSWORD trong `.env` không khớp hash; POST login trả 401. Không sửa/reset mật khẩu hoặc bypass auth. Script kiểm thử runtime tạm đã dọn sau kiểm thử; kết quả hai tài khoản mới được ghi dưới đây.

### Cập nhật đăng nhập ngày 14/10/2026

- Theo yêu cầu trực tiếp của người dùng, tạo đúng hai tài khoản Admin/Manager ACTIVE với hash scrypt theo BE hiện có; không thêm bản ghi nghiệp vụ hoặc tài khoản demo, không lưu mật khẩu vào mã nguồn.
- Cả hai login 200, auth/me 200, đúng ID/role. Mỗi role đọc 19 API danh sách/tổng quan và 10 chi tiết có dữ liệu; admin/users trả 200 cho Admin và 403 cho Manager.
- Đăng nhập/đăng xuất thật trên FE và mobile web qua, vào đúng khu vực mỗi role, không chặn API; browser errors 0. Android Expo Go cũng qua login/tổng quan/account/logout với cả hai role; xác nhận email tài khoản trên màn hình native.
- Sửa form mobile: kiểm tra email/mật khẩu bắt buộc, Email Next focus mật khẩu, Password Done gửi giá trị native mới nhất. Giữ bố cục/style.
- Script, ảnh, XML và dữ liệu UI tạm tạo để kiểm thử đã được dọn; phiên kiểm thử đã đăng xuất. Hai tài khoản mới được giữ cho người dùng. Giữ các bài kiểm thử portal/roles đã có sẵn trong repo và runtime đang chạy.

## Chạy project

- Web FE: `http://127.0.0.1:5173`.
- BE hiện có: `http://127.0.0.1:3000/api`; Swagger `/api/docs`. Chạy từ dist hiện có, không build/seed/migrate lại BE.
- Expo mobile web: `http://127.0.0.1:8081`; native dev server: `exp://192.168.1.3:8081` trên mạng Wi-Fi hiện tại. Native API dùng `http://192.168.1.3:3000/api` để không trỏ localhost của điện thoại.
- BE/FE/Expo đã được khởi động lại sau gián đoạn, cả ba trả HTTP 200 tại lần kiểm tra cuối. Android boot hoàn tất và mở WDP login.
- BE process thêm CORS origins localhost/127.0.0.1 cổng 8081 cho mobile web; không chỉnh BE source hoặc `.env`.
- Email/gateway/ngân hàng thực tế cần cấu hình hợp lệ sẵn ở BE. Không đặt provider development để giả gửi email.

Các phần thiếu tại BE và phụ thuộc dịch vụ bên ngoài phải được giải quyết bởi chủ BE/cấu hình hiện tại trước khi chứng nhận cả project hoàn tất. Mật khẩu tài khoản cũ không được thay đổi; hai tài khoản mới đã login thật thành công. Việc có đủ màn hình hoặc mọi test mock qua không thay thế chứng nhận các nghiệp vụ còn thiếu.

## Rà soát đường dẫn Admin/Manager bổ sung ngày 14/10/2026

- Hai liên kết Xem và phân công / Xem hồ sơ kiểm tra trả kho đã được bấm trên tab Admin thật: giữ /admin/facility và menu quản trị. Các trang vận hành được dùng chung component, không thay đổi role tài khoản.
- Layout Admin/Manager cung cấp namespace cho toàn bộ OperationsLink, kể cả liên kết hồ sơ liên quan. Tiêu đề ghi QUẢN TRỊ / QUẢN LÝ theo phiên; không đổi bố cục/CSS.
- 139 trang dùng API đọc thật trên web/mobile web qua; 1.958 link Admin và 1.371 link Manager giữ đúng workspace. Admin mở URL Manager cũ vẫn chuyển sang URL Admin tương ứng và giữ query. Không tạo dữ liệu nghiệp vụ/tài khoản mới; không chặn API đọc, browser errors 0.
- Portal/roles hồi quy qua: 37 thao tác giả lập, 16 tổ hợp quyền, API sai role 0, database writes 0. Web/mobile typecheck, lint và build/export qua.
- Login mobile chuyển sang TextInput chuẩn React Native, có vùng chạm và controlled value. Android: bàn phím màn hình mở khi chạm, Email Next / Password Done, Admin/Manager login và account đúng email đã xác nhận. Khôi phục phiên mobile tránh ghi đè phiên mới và giữ token khi chỉ có lỗi mạng.
- Đã dọn script, ảnh và XML mới dùng kiểm thử. Không sửa BE source, schema, .env BE hoặc bản ghi database trong lượt này. Các giới hạn API phía BE nêu trên vẫn áp dụng.
- Sửa hiển thị NaN khi dashboard thiếu trường đếm, và tỷ lệ báo cáo khi chưa có số tiền hợp lệ: hiển thị dấu —, không biến dữ liệu thiếu thành 0. Hồi quy roles kiểm tra cả cảnh báo Received NaN. Resource mobile chỉ nhận các khóa được khai báo của danh mục, tránh coi khóa prototype như tên phân hệ.

## Sidebar Admin chỉ có bảy mục quản trị

- Người dùng làm rõ rằng vấn đề là các mục vận hành của Manager được thêm vào sidebar Admin, dù URL/role vẫn là Admin. Đã bỏ việc thêm operationsNavigation vào navigation của AdminLayout khi mở /admin/facility.
- Sidebar desktop và menu màn hình nhỏ của Admin luôn giữ đúng bảy mục quản trị. Tên trang vận hành chỉ dùng trong breadcrumb, không tạo thêm liên kết trong sidebar. Báo cáo, kiểm tra trả kho, phân công và liên kết hồ sơ vẫn hoạt động trong /admin/facility.
- Kiểm thử bằng hai tài khoản có sẵn qua 21 trang, bấm liên kết báo cáo/trả kho, tải lại và menu 390px: hai menu Admin đều đúng bảy URL cố định, không có mục vận hành. Sidebar Manager giữ nguyên và tất cả liên kết thuộc /manager. Browser errors 0; database writes/tài khoản mới 0.
- Typecheck/lint/Vite build qua. Script kiểm thử tạm đã xóa; không sửa BE, database, CSS hoặc chức năng nghiệp vụ.
