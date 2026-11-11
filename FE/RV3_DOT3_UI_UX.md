# RV3 đợt 3 — UI/UX Web nội bộ

## Phạm vi

Chỉ cải thiện Staff, Manager và Admin Web. Không sửa Backend, Mobile, Customer Web, trang public, API, phân quyền, giá, thanh toán hay vòng đời hợp đồng. Không commit, push, deploy hoặc chạy migration.

Repository đã có nhiều thay đổi staged từ trước. Danh sách trong `git status` không phải toàn bộ thay đổi của đợt này. Đã so sánh SHA256 với bản đầu đợt: các file ngoài FE và các file Customer/public/services/auth được giữ nguyên. Submodule `swagger-docs-site` không thuộc thay đổi này.

## Giao diện đã chỉnh

- CSS riêng `src/styles/internal-web.css`, chỉ tác động bên trong `.manager-shell.internal-web`. Chữ nội dung 16px, bảng 14px, menu 15px, tiêu đề chính 26–30px; giảm khoảng trắng và tăng độ rõ chữ.
- Sidebar theo nhóm công việc, giữ route đang dùng. Có menu cho màn hình hẹp, tìm chức năng và liên kết bỏ qua menu đến nội dung.
- Staff: bàn làm việc 4 chỉ số, tối đa 5 việc ưu tiên, giữ cảnh báo quá hạn và các lối tắt vận hành.
- Manager: 5 chỉ số vận hành, tối đa 5 việc ưu tiên; số liệu chi tiết vẫn ở Báo cáo. Menu nhóm duyệt, phân công, tài chính, kho/hàng hóa, hợp đồng/khách hàng, dịch vụ/bảng giá và báo cáo.
- Admin: 4 chỉ số tài khoản từ tổng số API trả về; tối đa 5 tài khoản gần đây. Giữ quản lý tài khoản, lịch sử và chính sách.
- Nhóm chức năng giảm mô tả lặp; cập nhật gần đây thu gọn trong khối mở rộng cho role nội bộ. Nhánh Customer của component dùng chung giữ cách hiển thị cũ.
- Các nút phân trang nội bộ có khoảng bản ghi, tổng số và trang trước/sau. Những danh sách đã tích hợp kích thước trang cho chọn 10/20/50, mặc định 20.
- Lưu URL bộ lọc theo người dùng cho đường quay lại từ chi tiết Manager và Staff đã tích hợp.

## Tải danh sách

- Admin Accounts dùng phân trang/tìm kiếm/lọc tài khoản hiện có ở server, không tải mọi tài khoản rồi mới chia trang.
- Staff appointments, support requests và maintenance dùng phân trang server cùng bộ lọc hiện có.
- Manager List tiếp tục dùng server ở các tài nguyên đã hỗ trợ; giữ lọc toàn bộ trước khi phân trang cho các tài nguyên còn lại.
- Manager Assignments vẫn tải các nguồn để tổng hợp/lọc đúng giữa các nhóm. Chỉ đổi phân trang giao diện; chưa có endpoint phân trang tổng hợp được xác minh để thay thế an toàn trong phạm vi FE.
- Yêu cầu tải danh sách có hủy request cũ, debounce; giữ trạng thái lỗi, tải và rỗng. Không tạo API mới hoặc đổi hợp đồng API.

## File chính

- Layout/menu: `InternalPortalLayout.tsx`, `operations-navigation.ts`, `StaffLayout.tsx`, `AdminLayout.tsx`, `manager-sections.ts`.
- Dashboard: `StaffOperationsPage.tsx`, `ManagerOverviewPage.tsx`, `AdminDashboardPage.tsx`, component mới `InternalDashboard.tsx`.
- Danh sách/chi tiết: `AdminAccountsPage.tsx`, `ManagerListPage.tsx`, `ManagerAssignmentsPage.tsx`, `StaffListPage.tsx`, `ManagerDetailPage.tsx`, `StaffRecordPage.tsx`, `ManagerSectionPage.tsx`.
- Component dùng chung có điều kiện role: `PortalUi.tsx`, `WorkHub.tsx`.
- Helper mới: `InternalPagination.tsx`, `useInternalListResource.ts`, `internal-list-memory.ts`, `utils/internal-pagination.ts`.

## Kết quả kiểm tra

- `npm run build`: PASS. Vite còn cảnh báo chunk JavaScript lớn hơn 500kB; chưa đổi chiến lược bundle/router trong đợt UI này.
- `npm run lint`: PASS, 0 lỗi; 4 cảnh báo hiện có về Fast Refresh và escape ký tự.
- `node scripts/rv3-internal-ui-smoke.mjs`: PASS. Kiểm tra dashboard, menu/deep link theo role, chặn URL khác role, responsive 1366/1920/1024/390px, phân trang/lọc/giữ bộ lọc khi quay lại, giữ dữ liệu form khi focus, trạng thái lỗi. Không có request ghi dữ liệu trong kiểm tra này.
- Customer Payments: so sánh ảnh khi bật/tắt CSS mới sau khi tải xong; kết quả giống nhau. Kiểm tra này không thay thế việc kiểm tra mọi trang Customer, nhưng CSS được giới hạn và mã nguồn Customer không thay đổi.
- `npm run test:admin-audit`: PASS — route lịch sử, lọc, phân trang, chi tiết và trạng thái storage không khả dụng; không gửi request ghi.
- Ảnh sau chỉnh nằm tại `artifacts/rv3-internal-ui/`.

Các kiểm tra trình duyệt dùng API giả lập, không truy cập hay chỉnh dữ liệu shared DB. Chưa kiểm thử toàn bộ form/mutation với Backend thật; không khẳng định mọi luồng nghiệp vụ đã được kiểm thử đầu cuối. Không chạy kiểm tra Backend hoặc Mobile vì không sửa hai phần này.
