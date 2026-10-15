# Giao diện WDP ngày 15/10/2026

Tham khảo cách tổ chức tìm kiếm, bộ lọc và thẻ thông tin tại https://goplus.com.vn/. Không sao chép thương hiệu, hình ảnh, nội dung hoặc mô hình nhiều địa điểm. WDP vẫn dùng xanh đậm/cam, thuê kho tại **một cơ sở**, đúng các API và vai trò hiện có.

## Đối chiếu BE trước khi sửa

- `booking/catalog` trả nhóm kích thước, loại kho, đơn giá tháng, thời hạn được duyệt và dịch vụ. Trang chủ trình bày theo nhóm kích thước; danh sách kho vẫn hiển thị dữ liệu API, không lọc bí mật các bản ghi theo tên.
- `storage` lọc kích thước, loại, ngày và thời hạn. Không thêm tìm kiếm quận, nhiều chi nhánh, yêu thích, đánh giá hay đặt lịch xem phòng.
- Giá trên thẻ lấy từ `monthlyPrice`, là đơn giá tháng; tổng tiền thuê, cọc và dịch vụ tiếp tục lấy báo giá BE. Không tính lại chính sách giảm giá/cọc trong giao diện.
- Khả dụng phụ thuộc toàn bộ kỳ thuê. Yêu cầu tư vấn/đặt kho không được trình bày như đã thanh toán hoặc đã nhận kho.
- FacilitiesModule chưa có API công khai cho địa chỉ chi tiết: không thêm địa chỉ, hotline hoặc bản đồ giả.
- Admin giữ đúng hai mục Tổng quan/Quản lý tài khoản; phân công thuộc Manager. Giữ guard, đường dẫn, API, idempotency và các thao tác nghiệp vụ đã có.

## Thay đổi

- Web: trang chủ ưu tiên tìm kho, nhóm kích thước lấy từ API, thẻ danh mục rõ đơn giá/điều kiện, hướng dẫn thuê, dịch vụ và FAQ; header/footer gọn hơn. Giữ luồng đặt kho và mô phỏng kích thước.
- Khu vực Customer/Staff/Manager/Admin: nền sáng, menu đang chọn rõ ràng, thẻ/bảng/form đồng bộ; sửa bố cục drawer nội bộ trên màn hình hẹp. Đăng xuất vẫn về `/account/login`.
- Mobile: nhận diện và màu đồng nhất, form native giữ cách nhập/gửi dữ liệu, nút lựa chọn phân biệt trạng thái, thẻ điều hướng có vùng bấm rõ. Manager chia các liên kết vận hành theo nhóm và trình bày số liệu BE bằng thẻ.
- Ảnh ngoài lỗi có minh họa SVG dự phòng trong repo; không thay dữ liệu kho bằng dữ liệu demo. Mô hình 3D được bổ sung texture gốc Kenney còn thiếu; nguồn và giấy phép ở `public/models/ATTRIBUTION.md`.
- HTML đặt tiếng Việt, tiêu đề WDP, liên kết bỏ qua điều hướng và hỗ trợ giảm chuyển động.

## Kiểm tra

- FE: TypeScript, lint và production build đạt. Vẫn có cảnh báo kích thước bundle 3D; không có lỗi biên dịch.
- Hai regression có sẵn portal/roles đạt: 37 thao tác ghi được trả fixture, 16 tổ hợp role/workspace không gọi API nhầm quyền, không ghi dữ liệu nghiệp vụ thật.
- 44 lượt kiểm tra giao diện ở 320/390/768/1024/1440 px: không tràn ngang; tìm kiếm giữ bộ lọc; danh sách/chi tiết và menu di động hoạt động. Đăng nhập/đăng xuất Admin/Manager bằng API thật trên FE và mobile web đạt; không tạo tài khoản thử.
- Kiểm tra chủ động ảnh hỏng: fallback tải được từ repo. Mô phỏng 3D tải scene, xoay/phóng to/đặt lại được; không còn lỗi thiếu texture.
- Mobile: TypeScript, Expo lint và export web đạt. Android Expo Go đăng nhập thật Admin/Manager; Email → Tiếp theo → Mật khẩu → Done hoạt động. Admin giữ hai mục; form tạo tài khoản nhập được và đã hủy, không submit. Manager tải được số liệu tổng quan từ BE. Đăng xuất trả về form đăng nhập trống.

BE và database không được chỉnh sửa. Dữ liệu kiểm thử tồn tại từ trước trong database được giữ nguyên; các tệp/script/ảnh tạm tạo thêm trong lần kiểm tra giao diện được dọn khi hoàn tất. Những kiểm tra này không chứng nhận thanh toán ngân hàng, gửi email thực tế hoặc mọi thiết bị iOS/Android.
