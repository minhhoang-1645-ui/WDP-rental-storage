# Chuyển tác nghiệp sang nhân viên — 26/10/2026

## Phạm vi đã chốt

- Staff: yêu cầu đặt kho, tư vấn, hỗ trợ khách hàng, lịch bàn giao, nhập–xuất hàng, gia hạn, chuyển kho, trả kho và bảo trì. **Phân công nhân viên giữ nguyên ở Manager**, không chuyển sang Staff.
- Manager: phân công nhân viên, báo cáo, quản lý kho/bảng giá, khách hàng, hợp đồng và tài chính. **Giữ nguyên Chờ xác nhận thanh toán và Quyết toán cọc** theo yêu cầu tạm hoãn thay đổi hai mục này.
- Admin: tổng quan hệ thống và quản lý tài khoản.
- Không thay schema, chạy migration, seed, sửa mật khẩu hoặc thay đổi dữ liệu nghiệp vụ để kiểm thử.

## Đường dẫn và quyền

Web/mobile mở các phân hệ được chuyển tại `/staff/<phân-hệ>`. Các liên kết hồ sơ liên quan tiếp tục nằm trong khu vực Staff; các URL vận hành cũ của Manager không còn mở màn hình xử lý.

API tiếp nhận/duyệt dùng `/api/staff/management/<phân-hệ>`. API thực hiện công việc vẫn dùng `/api/staff/...`: hoàn tất bàn giao, kiểm đếm nhập–xuất, kiểm tra trả kho, bắt đầu/hoàn tất bảo trì và hỗ trợ, hoàn tất chuyển kho.

Manager/Admin giữ quyền đọc API vận hành cũ để phục vụ báo cáo, hồ sơ tài chính và phân công. Các thao tác ghi của 9 nhóm trả 403, ngoại trừ API phân công dành riêng cho Manager tại `/api/manager/<phân-hệ>/:id/assign`. Staff không được phân công nhân viên, duyệt thanh toán, quyết toán/hoàn cọc hoặc quản lý tài khoản. Danh sách phân công dành cho Manager chỉ trả nhân viên đang hoạt động, không trả mật khẩu.

## Các bước sử dụng

1. Khách gửi yêu cầu; Staff mở Bàn làm việc hoặc thông báo để tiếp nhận.
2. Đặt kho: đối chiếu kỳ thuê/báo giá rồi duyệt. Khách thanh toán và đề xuất lịch; Staff xác nhận lịch, bàn giao thực tế khi đến giờ.
3. Nhập–xuất: Manager chọn người phụ trách tại mục Phân công nhân viên. Staff được giao kiểm đếm rồi hoàn tất; tồn chỉ đổi sau bước này.
4. Gia hạn: Staff kiểm tra hạn cũ–mới và báo giá trước khi duyệt. Khách thanh toán hóa đơn kích hoạt; việc duyệt chưa tự hoàn tất gia hạn.
5. Hỗ trợ/bảo trì: Manager phân công; Staff tiếp nhận, cập nhật thực hiện và xử lý kết quả trong khu vực Staff. Bảo trì chưa mở lại kho trước nghiệm thu.
6. Chuyển kho: Staff duyệt kho đích hợp lệ rồi xác nhận chuyển thực tế. Trả kho: Staff kiểm tra từng kho và hoàn tất nhận trả; Manager tiếp tục quyết toán cọc riêng.

## Kiểm tra đã thực hiện

- BE và FE build/lint; mobile typecheck/lint.
- 13 kiểm thử đơn vị phân quyền và danh sách nhân viên.
- 104 kiểm tra HTTP với dịch vụ giả lập: quyền xử lý nghiệp vụ thuộc Staff, quyền phân công giữ ở Manager; không ghi database.
- Kiểm thử đính chính trên web/mobile web: 9 nhóm nghiệp vụ vẫn ở Staff; không còn menu, nút hoặc route phân công ở Staff. Form phân công Manager gửi đúng API Manager. Toàn bộ thao tác ghi được giả lập, không ghi dữ liệu thật.
- Sửa lỗi bảng danh sách làm tràn chiều ngang ở kích thước 390px.
- Xuất bundle mobile cho web, Android và iOS. Chưa kiểm thử thao tác trên thiết bị Android/iOS thật.
- Đăng nhập tài khoản Staff hiện có và đọc trực tiếp các API đã chuyển: thành công, không thực hiện giao dịch nghiệp vụ thật.

Không tạo tài khoản hay phiếu thử trong database. Cơ chế phê duyệt tự động chặn lệnh dọn thư mục và cả cách xóa từng tệp với thông báo `blocked by policy`; các tệp/bundle tạm vẫn nằm tại `FE/artifacts/role-transfer-qa`.

BE vẫn phát cảnh báo deprecation `pg` đã có trước đó khi xếp hàng truy vấn; các lần đăng nhập và đọc API kiểm tra đều thành công. Lần này không sửa cơ chế truy vấn/transaction ngoài phạm vi chuyển phân quyền.
