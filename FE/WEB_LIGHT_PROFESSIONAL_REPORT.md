# NestBox — Web Light Professional

## Phạm vi và kết quả

Đã triển khai giao diện chung cho Customer, Staff, Manager, Admin và trang công khai trong FE. Giữ các thay đổi RV3 đang có. Không sửa BE, Mobile, database, API hoặc quy tắc nghiệp vụ; không commit/push/deploy.

## Thiết kế

| Thành phần | Giá trị |
|---|---|
| Nền | `#F8FAFC` |
| Card / sidebar | `#FFFFFF` |
| Primary / hover | `#0F766E` / `#115E59` |
| Mục được chọn | `#E6F4F1`, viền và chữ teal |
| Logo | `#183153` |
| Chữ / chữ phụ | `#172B3A` / `#475569` |
| Viền | `#E2E8F0` |
| Font | Giữ Inter/system sans hiện có; không tải thêm font |
| Kích cỡ | Body 16px; menu 15px; label 14px; bảng 14–15px; h1 26–30px trong portal; h2 20px |

Tokens nằm trong `styles/light-professional.css` và theme gốc. CSS nội bộ đã chuyển các màu cứng sang tokens. Sidebar/card trắng, footer public sáng; nút chính teal; giảm bóng và thống nhất bo góc. Trạng thái vẫn có chữ tiếng Việt, không chỉ phân biệt bằng màu. Thêm kiểu focus, placeholder rõ hơn và hỗ trợ reduced motion. Trang marketing dùng tiêu đề co giãn lớn hơn portal.

## Sidebar

- Customer: Tìm & đặt kho, Tổng quan, Thông báo; nhóm Đặt kho & nhận kho mở các route Đơn đặt kho / Hóa đơn & thanh toán / Lịch bàn giao / Hợp đồng; nhóm Kho & hàng của tôi và Thay đổi & hỗ trợ có thể thu gọn. Tài khoản và Đăng xuất cố định phía dưới. Các route nhóm cũ vẫn hoạt động.
- Staff: giữ nhóm RV3 theo thứ tự bàn làm việc, đặt kho/tư vấn, bàn giao, hàng hóa, thay đổi kỳ thuê, hỗ trợ/bảo trì và tra cứu. Tất cả dùng màu sáng mới.
- Manager: Tổng quan, Việc cần duyệt, Phân công, Tài chính, Kho & hàng hóa, Hợp đồng & khách hàng, Dịch vụ & bảng giá, Báo cáo.
- Admin: Tổng quan, Tài khoản, Lịch sử hoạt động và Chính sách hệ thống hiện có. Không bỏ chính sách đang hoạt động hoặc tạo nghiệp vụ Admin mới.
- Ba role nội bộ có thể bấm avatar để mở thông tin tài khoản cá nhân và đăng xuất. Đây là hộp thông tin chỉ đọc từ phiên đăng nhập hiện có; không tạo API hay route quản lý hồ sơ mới.

## Dashboard trước / sau

| Role | Trước đợt này | Sau |
|---|---|---|
| Customer | Nhiều nhóm hành động, tiến độ, ActivitySummary, hướng dẫn và danh sách cùng mở | 4 KPI, tối đa 5 việc ưu tiên, tối đa 5 đơn gần đây; tiến độ/hướng dẫn mở khi cần; hai lối tắt hàng hóa/hỗ trợ |
| Staff | Đã được rút gọn ở RV3 | Giữ 4 KPI và danh sách ưu tiên; đồng bộ nền trắng, chữ và màu teal |
| Manager | Đã có 5 KPI RV3 | Giữ số liệu API, 5 KPI và tối đa 5 việc; Analytics vẫn ở Báo cáo |
| Admin | Đã có 4 KPI tài khoản RV3 | Giữ tổng từ server và tối đa 5 tài khoản gần đây; đồng bộ hệ màu |

Không tạo số liệu giả trong mã ứng dụng. Loading/lỗi hiển thị `—`; dashboard Customer giữ điều kiện trạng thái và nguồn dữ liệu trước đó.

## Danh sách, tìm kiếm và phân trang

- Customer trước đây dùng nhánh phân trang nút icon riêng; nay dùng cùng component `InternalPagination` thông qua `PortalUi.Pagination`. Mặc định 20, chọn 10/20/50 khi danh sách đủ dài. Không thêm bộ điều khiển cho danh sách tối đa 10 mục.
- Các trang dùng `useCustomerPagination` được đồng bộ: đơn đặt kho, lịch sử đặt kho, kho đang thuê, hợp đồng, hóa đơn, lịch sử thanh toán, yêu cầu xác nhận thanh toán, lịch bàn giao, gia hạn, trả kho/quyết toán và hỗ trợ. Chuyển kho dùng cùng trang hỗ trợ nên được áp dụng ở danh sách yêu cầu.
- Đơn đặt kho bổ sung tìm theo mã/tên kho, lưu trạng thái/từ khóa/kích thước trang/trang trong URL. Đổi bộ lọc về trang 1; xóa bộ lọc xóa cả từ khóa. Từ chi tiết đơn quay lại đúng URL đã lưu theo người dùng.
- Phân trang server ở các danh sách nội bộ đã tích hợp trong RV3 được giữ nguyên, gồm Admin Accounts, Staff appointments/support/maintenance và các tài nguyên Manager đã hỗ trợ. Nhập/xuất và hàng đang lưu tiếp tục dùng server + component chung sẵn có.
- Không sửa điều kiện hiển thị hóa đơn gia hạn, trạng thái thanh toán, phân quyền hay điều kiện xử lý tác vụ.

## Nội dung và form

- Dashboard Customer bỏ card mô tả hành động dài và ActivitySummary trùng thông tin; hướng dẫn/tiến độ vẫn truy cập được trong khối thu gọn.
- Tên menu rút gọn thành Đơn đặt kho, Kho của tôi, Hóa đơn & thanh toán, Lịch bàn giao.
- Giữ nguyên cảnh báo về ký hợp đồng, OTP, thời hạn thanh toán, kiểm đếm và hoàn tiền.
- Bảng có nền header nhẹ, chữ/cột rõ hơn; ô số tiền có data-label phù hợp căn phải. Bảng dài cuộn trong khung; form và nút hỗ trợ wrap ở màn hình hẹp.
- Không thay giá từ Backend hoặc công thức hiển thị số tiền. Không đổi cơ chế live refresh/giữ bản nháp của các form nghiệp vụ.

## File thay đổi trong đợt này

Ứng dụng:

- `src/styles/light-professional.css` — mới; theme chung/responsive.
- `src/styles/index.css`, `src/styles/internal-web.css`, `src/main.tsx` — tokens/import.
- `src/components/customer/CustomerLayout.tsx` — menu thu gọn và ghi nhớ URL.
- `src/pages/customer/CustomerDashboardPage.tsx` — dashboard gọn.
- `src/pages/customer/CustomerReservationsPage.tsx` — tìm/lọc bằng URL.
- `src/pages/customer/CustomerReservationDetailPage.tsx` — quay lại đúng bộ lọc.
- `src/components/customer/useCustomerPagination.tsx`, `src/components/manager/PortalUi.tsx` — phân trang thống nhất.
- `src/components/workspace/internal-list-memory.ts` — dùng bộ nhớ theo người dùng cho cả Customer.
- `src/components/layout/InternalPortalLayout.tsx` — hộp thông tin tài khoản chỉ đọc.

Kiểm tra:

- `scripts/light-professional-smoke.mjs` — mới, fixtures chỉ trong test.
- `scripts/rv3-internal-ui-smoke.mjs` — thêm 768px, viewport tương đương zoom và hộp tài khoản.
- `scripts/completion-parity-smoke.mjs` — thêm `WDP_WEB_ONLY=1`, sử dụng `WDP_FE_URL` khi kiểm tra Web; không cần mở Mobile để chạy kiểm tra ký hợp đồng Web.

## Kiểm tra và giới hạn

- Build/typecheck: PASS; Vite còn cảnh báo bundle JavaScript lớn hơn 500kB.
- Lint: PASS, không lỗi; còn 4 cảnh báo Fast Refresh/escape ký tự đã có trước.
- Light Professional smoke: PASS — Customer 4 KPI/5 đơn, phân trang, tìm/lọc, các route hợp đồng/thanh toán/lịch/hỗ trợ/booking/catalog/chi tiết kho/trang chủ; responsive 1366/1920/768/390px, viewport thu hẹp tương đương zoom 125%, keyboard menu, tương phản các cặp token chính đạt 4.5:1. Không phải chứng nhận AA toàn bộ ứng dụng hay kiểm tra zoom vật lý trên mọi trình duyệt.
- Internal UI smoke: PASS — ba role, menu/deep link, dashboard, hộp tài khoản, phân trang, bộ lọc, giữ dữ liệu form khi focus, chặn route khác role, trạng thái lỗi và responsive.
- Admin audit smoke: PASS — route lịch sử, tìm/lọc/phân trang/chi tiết và lỗi storage.
- Completion smoke với `WDP_WEB_ONLY=1`: PASS — ký vẽ + OTP, sai OTP rồi sửa, PDF có xác thực, hóa đơn trước/sau ký, thông báo chuyển khoản không tự ghi đã thanh toán, cấu hình email/ngân hàng thiếu và trang kho Staff. Toàn bộ ghi dữ liệu đã được mock; không phát sinh giao dịch hay dữ liệu thật.
- `test:portal`: chạy qua danh sách/chi tiết và các assertion hành động trước phần Báo cáo, nhưng toàn bộ script FAIL ở `portal-smoke.mjs:727`, chờ nút `Tất cả` không còn trong Báo cáo hiện tại. Không khẳng định full suite PASS.
- Các lần chạy mặc định `test:completion` và `test:role-navigation` không hoàn tất vì URL hardcode `127.0.0.1`/Mobile 8081 không chạy. Completion được chạy lại Web-only thành công; không mở hay sửa Mobile để đáp ứng test. Test điều hướng nội bộ mới kiểm tra quyền/menu, nhưng không thay thế tất cả assertion nghiệp vụ của script cũ.
- Không chạy toàn bộ `npm test`: một số script cần Backend/helper read-only hoặc Mobile. Không sử dụng shared DB để vượt qua giới hạn môi trường.

Ảnh kiểm tra nằm trong `artifacts/light-professional/` và `artifacts/rv3-internal-ui/`. Số liệu trên ảnh là fixtures test, không phải dữ liệu vận hành.

## Giới hạn cần xử lý riêng

1. Một số trang Customer vẫn dùng `usePaginatedResource`/`allPages` có sẵn để lấy toàn bộ tập dữ liệu trước khi lọc. Đợt này không thêm vòng tải toàn bộ mới, nhưng cũng chưa loại bỏ được cách tải cũ ở tất cả danh sách. Với dữ liệu lớn cần xác minh đầy đủ tham số lọc server, đặc biệt hóa đơn ẩn theo kỳ và dữ liệu phụ thuộc; không được gọi đây là server pagination hoàn chỉnh.
2. Manager Assignments còn tổng hợp nhiều nguồn trước khi lọc; cần endpoint tổng hợp phân trang nếu tăng quy mô. Không sửa Backend trong nhiệm vụ này.
3. Chưa kiểm thử toàn bộ thao tác tạo/khóa/mở tài khoản hoặc toàn bộ booking/handover/stock với Backend thật. UI smoke và kiểm tra source không chứng minh nghiệp vụ E2E production.
4. Không có ảnh trước đồng nhất cho cả bốn dashboard ở cùng dữ liệu. Bảng trước/sau trên mô tả thay đổi source; ảnh cung cấp là ảnh sau.

Đối chiếu SHA256 với snapshot đầu nhiệm vụ: không thay file ngoài FE; API client, auth, router và các file logic VNPay giữ nguyên. Các thay đổi staged/local trước đó không bị reset hoặc ghi đè.
