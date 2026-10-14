# 7 use case Admin

Phạm vi do người dùng chốt trong cuộc trò chuyện ngày 11/10/2026. Tác nhân chính của cả 7 use case: **Quản trị viên đã đăng nhập bằng tài khoản ADMIN còn hoạt động**. Các màn hình đều bằng tiếng Việt và giữ khu vực `/admin`.

## UC-A01 — Quản lý tài khoản người dùng

Mục tiêu: xem người dùng và cấp tài khoản nội bộ.

Luồng chính: mở Quản lý tài khoản → tìm/lọc theo họ tên, liên hệ, vai trò/trạng thái → xem tài khoản → khi cấp mới, nhập họ tên, email, số điện thoại, mật khẩu ban đầu và vai trò Nhân viên hoặc Quản lý → gửi → tải lại dữ liệu sau khi API thành công.

Ngoại lệ: dữ liệu không hợp lệ, email trùng hoặc lỗi kết nối được hiển thị; không thông báo tạo thành công khi API lỗi. Không tự thêm quyền tạo ADMIN, sửa hồ sơ, xóa tài khoản hay đặt lại mật khẩu vì API hiện chưa hỗ trợ và người dùng chưa chốt các thao tác này.

## UC-A02 — Quản lý vai trò và quyền

Mục tiêu: kiểm soát vai trò và quyền truy cập tài khoản.

Hiện có: xem nhóm quyền đang được áp dụng và vai trò từng tài khoản; cấp STAFF/MANAGER khi tạo tài khoản thuộc UC-A01.

Chưa hoàn tất: thay đổi vai trò hoặc sửa nhóm quyền. Không có endpoint cập nhật quyền; FE không thay role trong localStorage để giả cấp quyền. Ma trận hiển thị phản ánh các guard nghiệp vụ hiện có, không phải cấu hình phân quyền chỉnh sửa được.

## UC-A03 — Quản lý phân công nhân viên

Mục tiêu: giao hoặc đổi nhân viên phụ trách hồ sơ hỗ trợ và bảo trì.

Luồng chính: mở Phân công nhân viên → tìm công việc và lọc đã/chưa phân công → mở hồ sơ → chọn tài khoản STAFF đang hoạt động → Phân công nhân viên → BE kiểm tra trạng thái hồ sơ và tài khoản → tải lại hồ sơ thành công.

Ngoại lệ: hồ sơ hoàn tất không được phân công lại; tài khoản không còn hợp lệ hoặc cập nhật đồng thời bị BE từ chối phải hiện lỗi. Phân công theo ca/khu vực chưa có API, không coi luồng phân công công việc là đã triển khai bảng staff_assignments tổng quát.

## UC-A04 — Quản lý cấu hình cơ sở

Mục tiêu: xem và lưu cấu hình cơ sở.

Hiện có: thông tin kết nối, tài khoản quản trị và truy cập danh mục kho/bảng giá để xem.

Chưa hoàn tất: đọc/lưu đầy đủ thông tin cấu hình Facility. BE có model Facility nhưng chưa có endpoint cấu hình; trang nói rõ chưa hỗ trợ cập nhật. Không tự thêm các cấu hình mới ngoài yêu cầu dự án hoặc lưu cấu hình chỉ ở trình duyệt.

## UC-A05 — Xem bảng tổng quan hệ thống

Mục tiêu: theo dõi tài khoản và tình hình vận hành cơ sở.

Luồng chính: mở Tổng quan → tải đầy đủ danh sách người dùng → xem số lượng theo vai trò và trạng thái hoạt động → mở danh sách đã lọc hoặc tổng quan vận hành/báo cáo → làm mới khi cần.

Ngoại lệ: lỗi tải nguồn được hiển thị kèm thử lại; không thay lỗi bằng thống kê bằng 0. Các liên kết vận hành giữ `/admin/facility`.

## UC-A06 — Xem nhật ký kiểm toán/hoạt động

Mục tiêu: xem người thực hiện, hành động, thời điểm và thay đổi trong hệ thống.

Chưa hoàn tất: BE/database hiện chưa cung cấp nguồn nhật ký kiểm toán. Trang hiện thông báo chưa có nguồn dữ liệu và liên kết hồ sơ nghiệp vụ liên quan. Không tạo dữ liệu log giả; các mốc thời gian hồ sơ không thay thế lịch sử audit toàn hệ thống.

## UC-A07 — Quản lý trạng thái tài khoản

Mục tiêu: kích hoạt hoặc vô hiệu hóa quyền đăng nhập/truy cập của tài khoản.

Luồng chính: mở Trạng thái tài khoản → tìm/lọc người dùng → xem tài khoản → xác nhận hành động → kích hoạt/vô hiệu hóa → gọi PATCH account status → cập nhật giao diện theo kết quả thật.

Ngoại lệ: không vô hiệu hóa chính tài khoản đang dùng; không cho gửi lặp khi đang lưu; lỗi API hiển thị để thử lại. Hồ sơ nghiệp vụ của tài khoản vẫn được giữ. Trang này không có thao tác tạo tài khoản.

Xem trạng thái đáp ứng và các giới hạn cụ thể trong [bảng đối chiếu](./MANAGER_ADMIN_REQUIREMENTS_AUDIT.md). Có đủ 7 mục điều hướng không đồng nghĩa với 7 use case đã hoàn tất; UC-A02, UC-A04 và UC-A06 còn thiếu khả năng ở BE/database.
