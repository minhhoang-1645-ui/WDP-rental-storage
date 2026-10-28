# NestBox Storage — Hướng dẫn test và review

Muốn học nghiệp vụ và thực hành từng bước trước khi đánh checklist, đọc [Hiểu project và kịch bản tự test](./HUONG_DAN_HIEU_VA_DEMO_NESTBOX.md).

Cập nhật 27/10/2026. Tên kinh doanh trên web/mobile: **NestBox Storage**. Giao diện bằng tiếng Việt, một cơ sở. Giữ bộ ảnh cũ theo yêu cầu; không dùng bộ ảnh mới tải về. Mã đơn/hợp đồng và khóa phiên đã lưu vẫn giữ nguyên để không làm sai liên kết dữ liệu.

Trang **So sánh kho** tại http://127.0.0.1:5173/size-guide thay cho phần 3D. Ảnh, mã, tên và thông số của từng loại kho được giữ nhất quán từ danh sách/so sánh/chi tiết đến ba bước đặt kho. Chọn một kho mới sẽ mở bước chọn kho, kể cả khi trước đó bạn đang ở bước hai của một bản nháp.

Cách tổ chức thông tin tham khảo [GoPlus](https://goplus.com.vn/phong-tro/ho-chi-minh), [Thuê Mặt Bằng](https://thuematbang.com/) và [hướng dẫn kích thước Safestore](https://www.safestore.co.uk/storage-sizes/). Chỉ tham khảo cách giúp khách so sánh và ra quyết định; thông số, giá và điều kiện trên NestBox lấy từ API của project.

## 1. Mở project

Từ thư mục gốc E:\IELTS\WDP-rental-storage, mở PowerShell:

```powershell
.\scripts\start-local.ps1
```

- Website: http://127.0.0.1:5173/
- Đăng nhập: http://127.0.0.1:5173/account/login
- Mobile web: http://127.0.0.1:8081/
- API: http://127.0.0.1:3000/api/docs

Script không migrate/seed/reset database. Nếu cổng đã có server, script giữ tiến trình đó. Khi đổi Wi-Fi, dừng server mobile cũ rồi khởi động lại để lấy đúng địa chỉ API. Điện thoại thật phải cùng Wi-Fi; dùng địa chỉ exp:// mà script in ra, không dùng 127.0.0.1 của máy tính trên điện thoại.

Dùng tài khoản hiện có. Mật khẩu đăng nhập là mật khẩu gốc, không phải chuỗi hash. Có thể dùng bốn hồ sơ trình duyệt riêng cho Customer, Staff, Manager và Admin, hoặc đăng xuất rồi đổi tài khoản. Các tab trong cùng một hồ sơ dùng chung phiên đăng nhập.

## 2. Kịch bản nên trình bày trước giảng viên

Thực hiện theo thứ tự này để nhìn thấy liên kết giữa các vai trò:

1. Khách xem danh mục, chọn 2–3 loại kho, bấm **So sánh ngay** để đối chiếu diện tích, kích thước, điều kiện bảo quản, giá và tiền cọc. Chọn một kho, kiểm tra cùng ảnh/mã/tên trong ba bước đặt kho, chọn ngày thuê và xem báo giá. Mục so sánh thay cho mô hình 3D.
2. Khách đặt kho. Khi đủ điều kiện, hệ thống tự xác nhận, tạo hóa đơn và hợp đồng chờ thanh toán, hiển thị hạn giữ kho 24 giờ. PENDING là trường hợp cần nhân viên kiểm tra.
3. Khách mở hóa đơn và thanh toán qua dịch vụ đã cấu hình. Chỉ tiếp tục khi BE trả PAID; trang VNPay quay về chưa tự chứng minh tiền đã được ghi nhận.
4. Khách đặt lịch nhận kho. Lịch hợp lệ tự CONFIRMED. Staff mở lịch và hoàn tất khi đã đến giờ hẹn, đã bàn giao thực tế và từ ngày bắt đầu thuê.
5. Hợp đồng chuyển ACTIVE; khách xem kho đang thuê và gửi yêu cầu nhập hàng.
6. Manager phân công phiếu nhập hàng cho Staff. Staff được giao kiểm đếm và hoàn tất. Khách kiểm tra số lượng trong Hàng đang lưu.
7. Khách gửi hỗ trợ hoặc gia hạn. Mở hai vai trò để quan sát thông báo và trạng thái cập nhật.
8. Trả đúng hạn tạo hồ sơ trực tiếp. Trả trước hạn: Customer gửi đề nghị ở Trả kho → Manager vào Đề nghị trả trước hạn, đối chiếu công nợ và ghi điều kiện → khách nhận phản hồi rồi tạo yêu cầu trả → Staff kiểm tra và nhận trả. Quyết toán cọc đã được gỡ khỏi giao diện Manager; hồ sơ cọc BE vẫn được giữ nguyên. Không sửa ngày database.
9. Admin trình bày quản lý tài khoản, giới hạn hai mục và khả năng chặn truy cập sai vai trò.

Nếu demo vào **28/10/2026**, muốn hoàn tất bàn giao trong buổi demo thì chọn ngày bắt đầu thuê là 28/10/2026 và giờ hẹn sắp tới. Lịch có thể đặt trước ngày thuê tối đa ba ngày, nhưng không thể kích hoạt sử dụng kho sớm. Ngày kết thúc là mốc không bao gồm trong kỳ thuê.

Nếu VNPay sandbox hoặc IPN chưa hoạt động trong môi trường local, dùng hóa đơn đã PAID sẵn có để trình bày phần sau thanh toán. Không giả lập thành công trên database đang dùng và không bấm xác nhận đã nhận tiền khi chưa đối chiếu thực tế.

## 3. Checklist theo chức năng

Đánh dấu đạt/chưa đạt vào bản ghi riêng khi tự test. Kiểm tra trên cả màn hình máy tính và chiều rộng điện thoại.

| Mã | Vai trò/chức năng | Thao tác | Kết quả đúng |
|---|---|---|---|
| P01 | Khách chưa đăng nhập | Mở trang chủ và danh sách kho | Tên NestBox Storage, ảnh cũ hiển thị hoặc có ảnh dự phòng; không có tên Appointment/Billing/Test product để khách chọn |
| P02 | Danh mục/So sánh kho | Lọc từng kích thước, tiêu chuẩn/điều hòa; mở So sánh kho | Số lựa chọn khớp các thẻ; bảng hiện thông số/giá/cọc từ API; trên điện thoại chuyển thành từng thẻ, không có mô hình 3D |
| P03 | Khả dụng | Chọn ngày bắt đầu và kỳ thuê | Phản hồi từ API; không coi “Nhận yêu cầu” là bảo đảm còn kho toàn kỳ khi chưa kiểm tra |
| P04 | Chi tiết kho | Bấm Xem chi tiết | Đúng mã, tên, kích thước riêng của loại kho, giá cơ bản, cọc, thời gian tối thiểu, truy cập; không tự đổi thành 0 khi chưa có giá |
| P05 | Chọn kho | Bấm Chọn kho này/Bắt đầu đặt kho từ danh sách, so sánh hoặc chi tiết | Mở bước chọn kho với đúng mã, tên, ảnh và kỳ thuê; ảnh/thông số khớp xuyên suốt ba bước. Nếu ảnh nguồn lỗi thì có ảnh dự phòng |
| A01 | Đăng nhập | Đăng nhập bốn vai trò lần lượt | Customer → /customer; Staff → /staff; Manager → /manager; Admin → /admin |
| A02 | Sai thông tin | Bỏ trống/sai email hoặc mật khẩu | Thông báo rõ, không treo nút, không đăng nhập giả |
| A03 | Đăng xuất | Đăng xuất rồi tải lại/trở lại trang riêng | Về /account/login, không mở lại phiên cũ |
| A04 | Sai vai trò | Gõ URL của vai trò khác | Chặn/đưa về khu vực đúng, không gọi API ghi của vai trò khác |
| A05 | Đăng ký | Kiểm tra form khách hàng | Chỉ tạo Customer; không có đăng ký công khai Staff/Manager/Admin |
| C01 | Đặt kho | Chọn loại, số lượng, ngày/kỳ thuê | Báo giá đúng sản phẩm/số lượng; vượt số kho hoặc kỳ không hợp lệ bị chặn |
| C02 | Dịch vụ | Chọn dịch vụ tính lần/ngày/tháng nếu có | Số lượng, thời gian dịch vụ, tiền từng dòng và tổng được lấy từ báo giá BE |
| C03 | Thay đổi báo giá | Đổi ngày, số lượng, loại kho hoặc dịch vụ | Kết quả khả dụng/báo giá cũ bị bỏ; phải kiểm tra lại trước khi gửi |
| C04 | Gửi đặt kho | Gửi một yêu cầu hợp lệ | Có mã thật và trạng thái thật; tự CONFIRMED khi đủ điều kiện, hiển thị hạn giữ kho |
| C05 | Chống gửi lặp | Bấm nhanh nhiều lần hoặc mất mạng rồi thử lại | Khóa nút khi đang gửi, dùng idempotency; không tạo nhiều đơn cho cùng lần gửi |
| C06 | Thanh toán | Mở hóa đơn đúng tài khoản | Đúng tổng, đã trả, số dư, giờ hết hạn; hóa đơn VOID/đơn hết hạn không có nút thu tiếp |
| C07 | VNPay | Mở rồi đóng, hủy hoặc hết phiên | Không coi đã mở trang là đã thanh toán; có trạng thái chờ/hủy/hết hạn và đường thử lại phù hợp |
| C08 | Kết quả tiền | Sau khi BE ghi PAID | Ban đầu → đặt lịch; gia hạn → xem gia hạn; khoản định kỳ → lịch sử thanh toán |
| C09 | Khôi phục phiên | Tải lại màn thanh toán/đổi ứng dụng rồi quay lại | Tự kiểm tra kết quả; không yêu cầu chuyển tiền lặp khi phiên còn đang xử lý |
| C10 | Lịch nhận kho | Từ hợp đồng đủ điều kiện, chọn giờ tương lai | Tối đa ba ngày trước kỳ thuê, trước ngày kết thúc; lịch hợp lệ tự xác nhận |
| C11 | Kho đang thuê | Sau bàn giao xem hợp đồng/kho | Trạng thái ACTIVE, đúng kho vật lý và thời hạn |
| C12 | Hàng gửi | Tạo yêu cầu nhập/xuất | Không đổi tồn ngay khi gửi yêu cầu; tồn đổi sau Staff được giao hoàn tất kiểm đếm |
| C13 | Gia hạn | Kho tháng đủ điều kiện gửi gia hạn | Tự duyệt khi đủ điều kiện hoặc PENDING chờ kiểm tra; có hạn cũ/mới và hóa đơn kích hoạt |
| C14 | Thanh toán gia hạn | Trả đủ kỳ kích hoạt | Chuyển COMPLETED, cập nhật hạn thuê; không thu cọc lần nữa. Các kỳ sau có thể còn dư nợ nếu trả tháng |
| C15 | Hỗ trợ | Gửi vấn đề cụ thể | Có mã, trạng thái, người tiếp nhận và phản hồi khi được xử lý |
| C16 | Chuyển kho | Gửi nhu cầu qua hỗ trợ | Chờ xử lý/duyệt kho đích; vị trí chỉ đổi sau hoàn tất chuyển thực tế |
| C17 | Trả kho | Thử hồ sơ chưa đến hạn và hồ sơ đủ điều kiện | Chưa đến hạn phải gửi đề nghị và chờ Manager chấp thuận; sau đó mới tạo hồ sơ trả, theo dõi kiểm tra và quyết toán |
| S01 | Staff | Mở menu | Đúng chín nhóm nghiệp vụ, không có Phân công nhân viên hoặc nghiệp vụ thu/hoàn tiền của Manager |
| S02 | Đặt kho/tư vấn | Mở hồ sơ ngoại lệ hoặc yêu cầu liên hệ | Đủ thông tin khách, kỳ thuê, báo giá và thao tác được phép; lịch thường không cần duyệt thủ công |
| S03 | Bàn giao | Thử trước giờ hẹn, trước kỳ thuê, rồi hồ sơ đúng điều kiện | Không hoàn tất sớm; đúng điều kiện thì bàn giao một lần và kích hoạt đủ hợp đồng |
| S04 | Phiếu được giao | So sánh phiếu của mình/người khác/chưa giao | Chỉ nhân viên được giao xử lý phần việc cần phân công |
| S05 | Nhập–xuất | Đối chiếu từng dòng, nhập số đếm thực tế | Chặn số âm, trùng hàng, xuất vượt tồn; hoàn tất cập nhật tồn và lịch sử |
| S06 | Hỗ trợ | Bắt đầu, phản hồi hoặc chuyển bộ phận phụ trách | Khách xem được tiến độ/kết quả; không tự tạo khoản thu ngoài quyền |
| S07 | Gia hạn/chuyển | Xem hồ sơ, xử lý trường hợp cần kiểm tra | Đúng hạn cũ/mới hoặc kho nguồn/đích; kiểm tra xung đột, không đổi vị trí khi mới duyệt |
| S08 | Trả kho | Ghi đạt/có vấn đề cho từng kho rồi nhận trả | Chỉ ghi hiện trạng; tiền cọc/thu bổ sung/hoàn tiền thuộc Manager |
| S09 | Bảo trì | Bắt đầu, gửi kết quả, nghiệm thu | Kho vẫn bảo trì đến khi được nghiệm thu; không tự hiện sẵn sàng sau khi mới gửi kết quả |
| M01 | Tổng quan Manager | Xem việc cần xử lý | Ưu tiên chưa phân công, công nợ, đối chiếu tiền; không có mục quyết toán cọc và không lẫn bàn làm việc Staff |
| M02 | Phân công | Chọn hỗ trợ/bảo trì/nhập–xuất và nhân viên | Lưu đúng nhân viên; Staff được giao nhìn thấy công việc; người khác không làm thay |
| M03 | Tài chính | Mở hóa đơn, lịch sử thu, chờ xác nhận | Đối chiếu số dư và giao dịch. Không coi một thông báo chuyển khoản là khoản thu đã xác nhận |
| M04 | Cọc | Mở hồ sơ kiểm tra trả kho | Đối chiếu từng vấn đề/phí, số khấu trừ, cần hoàn/cần thu; chỉ ghi đã hoàn khi hoàn tiền thực tế |
| M05 | Báo cáo | Chọn kỳ, tải lại, xuất CSV | Đúng ngày, tổng và các trang dữ liệu; phân biệt hóa đơn phát hành với tiền đã thu |
| M06 | Danh mục/dịch vụ | Xem kho; kiểm tra form dịch vụ nếu có quyền | Dữ liệu từ API, giá/tồn/đơn vị tính đúng; không có nút lưu giả cho danh mục chỉ đọc |
| D01 | Admin | Mở menu | Chỉ Tổng quan và Quản lý tài khoản theo phạm vi đã chốt |
| D02 | Tài khoản | Tìm kiếm, mở hồ sơ, kiểm tra trạng thái/vai trò | Không lộ mật khẩu/hash; tìm được các trang sau; không tự khóa tài khoản đang dùng |
| D03 | Tạo tài khoản | Kiểm thử trên môi trường thử riêng hoặc dùng bài tự động | Staff/Manager được cấp đúng quyền; không tạo tài khoản thừa trong database đang review |
| U01 | Thông báo | Cập nhật một hồ sơ từ vai trò khác | Xuất hiện cập nhật khi polling hoặc quay lại app; link mở đúng hồ sơ/đúng vai trò |
| U02 | Form đang nhập | Giữ form mở khi có thông báo mới | Không mất thông tin đang nhập hoặc đổi nhân viên đã chọn |
| U03 | Điện thoại | Mở menu, form login, bảng/danh sách | Nhập được email/mật khẩu, hiện/ẩn mật khẩu, nút không tràn và không phải kéo ngang toàn trang |
| U04 | Mất mạng/lỗi API | Dùng kiểm thử tự động hoặc ngắt kết nối rồi khôi phục | Hiện lỗi và cho thử lại; không tự báo lưu/thu tiền thành công |

## 4. Chạy kiểm thử tự động an toàn

Cần cả BE, FE và Expo đang chạy. Ở FE:

```powershell
cd E:\IELTS\WDP-rental-storage\FE
npm test
npm run build
npm run lint
```

Mười bộ FE: workflows, portal, roles, workspaces, booking, automatic, catalog, usability, early-return, history-maintenance. Các bộ portal/roles/workspaces/automatic/catalog chặn API bằng phản hồi mô phỏng; booking đọc giá/khả dụng thật nhưng chặn gửi đơn cuối. Server vẫn xử lý hết hạn bình thường theo cơ chế hiện có. Không có script tự tạo đơn/tài khoản/giao dịch thử thật.

Ở mobile:

```powershell
cd E:\IELTS\WDP-rental-storage\mobile
npm run typecheck
npm run lint
npm exec expo export -- --platform all --max-workers 2 --output-dir dist
```

Ở BE, chỉ chạy chín suite dùng bộ nhớ/mock đã kiểm tra:

```powershell
cd E:\IELTS\WDP-rental-storage\BE
npm test -- src/modules/booking/booking-expiration.unit.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/roles.guard.spec.ts src/modules/auth/operation-access.spec.ts src/modules/billing/online-payment.service.spec.ts src/modules/billing/vnpay.service.spec.ts src/modules/guest-booking/email.service.spec.ts src/modules/transfers/transfer-completion.unit.spec.ts src/modules/returns/early-return.unit.spec.ts
```

**Không chạy `npm test` BE mặc định trên database đang dùng.** Các suite booking/appointments/billing/renewals/returns/overdue và nhiều suite tích hợp có tạo/xóa dữ liệu. Lệnh hướng dẫn cũ từng kèm overdue.service.spec.ts; suite đó dùng database, nên đã loại khỏi lệnh an toàn ở tài liệu này.

## 5. Điều kiện không được báo thành công giả

- Email thật, ngân hàng/QR và VNPay phụ thuộc cấu hình BE/dịch vụ ngoài. Chưa nhận email hoặc IPN thì báo đúng tình trạng, không đổi database để ép demo.
- Chưa có API phụ lục hợp đồng có chữ ký; bản in thông tin gia hạn không phải phụ lục đã ký.
- Admin vẫn hai mục; chưa bổ sung cấu hình hệ thống chỉ bằng một form không có API lưu.
- Thông báo trong ứng dụng được cập nhật theo chu kỳ và khi quay lại; chưa phải push khi ứng dụng đã đóng.
- Bộ ảnh và thông tin liên hệ mặc định phục vụ trình bày; cấu hình thông tin cơ sở thật trước khi triển khai ra ngoài. Không coi ảnh tham khảo là ảnh chụp chính cơ sở NestBox.
- Các bản ghi kiểm thử còn ở database không bị xóa trong lần này. Danh mục khách hàng lọc chính xác ID của fixture có ảnh example.test; hồ sơ nghiệp vụ đã tồn tại không bị đổi tên/xóa mất liên kết.
- Trên dữ liệu hiện tại có sáu loại kho để khách chọn. Số này thay đổi theo danh mục thực, không phải danh sách mẫu được tự tạo.

## 6. Khi gặp lỗi trong buổi test

Ghi vai trò, đường dẫn, mã hồ sơ, thời điểm và thông báo lỗi. Không gửi mật khẩu/token/khóa ngân hàng. Khi chưa chắc một lần thanh toán đã thành công, kiểm tra hóa đơn và lịch sử trước khi thử lại. Không xóa hợp đồng/giao dịch đã phát sinh; dùng quy trình hủy hoặc hồ sơ thử riêng nếu cần kiểm tra nghiệp vụ có ghi dữ liệu.

## 7. Kết quả kiểm tra cập nhật ngày 28/10/2026

- Các bộ kiểm thử FE đã được cập nhật thêm lịch sử, gỡ quyết toán Manager và lỗi bộ nhớ vai trò sau khi cập nhật giao diện. Suite catalog được chạy lại sau khi sửa bài test để chờ bộ lọc cập nhật URL và giao diện. Các bài browser không ghi nhận lỗi JavaScript hoặc tạo dữ liệu nghiệp vụ thử thật.
- Kiểm tra riêng màn hình 1440px và 390px: bộ lọc so sánh hoạt động, không còn canvas 3D, không tràn ngang; đúng ảnh/sản phẩm xuyên suốt ba bước đặt kho. Đã kiểm tra cả ảnh nguồn cũ và tình huống ảnh nguồn không tải được.
- Build và lint FE đạt. Mobile typecheck/lint và export web/Android/iOS đạt. Luồng mobile được test trên Expo web; chưa có thiết bị thật kết nối để xác nhận bàn phím/thao tác native.
- Chín suite BE an toàn nêu trên đạt 66/66. Đã áp dụng ba phạm vi BE được cho phép: đồng bộ chuyển kho, đề nghị trả sớm và tạo phiếu bảo trì kho nguồn sau chuyển. Không đổi schema, không seed/reset database và không tạo hồ sơ thử thật.
- BE cổng 3000, web 5173 và mobile web 8081 đang chạy. Thanh toán/email ngoài hệ thống vẫn cần kiểm tra với cấu hình thật của nhóm theo mục 5.

## 8. Test nhanh phần vừa hoàn thiện

1. Danh sách kho: tích chọn 2–3 loại → **So sánh ngay** → đối chiếu các cột; bỏ/thay lựa chọn; **Chọn kho** phải giữ đúng ảnh, mã và thông số vào đặt kho.
2. Customer → **Chuyển kho**: chọn yêu cầu thuê và hợp đồng (hiện mã kho, thời hạn), gửi nhu cầu. Staff → **Chuyển kho** phải thấy ở nhóm yêu cầu từ khách; tạo lệnh gắn đúng yêu cầu gốc, chọn kho đích, duyệt rồi hoàn tất sau khi chuyển thực tế. Customer phải thấy **Đã chuyển kho**, vị trí mới và phản hồi. Với lệnh cũ đã hoàn tất nhưng yêu cầu chưa đóng, Staff mở lệnh và bấm **Đồng bộ kết quả cho khách**; không chuyển vật lý lần nữa.
3. Manager → **Phân công**: tìm nhân viên theo tên/email, xem công việc chưa xong; các tài khoản fixture sinh tự động không trộn vào danh sách chọn. Không xóa tài khoản/hồ sơ cũ khỏi database.
4. Customer → **Trả kho** → **Muốn trả kho trước hạn?**: gửi lý do. Manager → **Đề nghị trả trước hạn**: xem công nợ, khoản đã thu, cọc đã lập hóa đơn, ghi rõ điều kiện/lý do và quyết định. Nếu công nợ hoặc thời hạn vừa đổi, tải lại để đối chiếu. Khách xem phản hồi rồi gửi yêu cầu trả kho. Staff tiếp tục kiểm tra thông thường; tiền thuê/cọc không tự hoàn khi duyệt đề nghị.
5. Mobile: Customer mở **Kho đang thuê** → chi tiết → **Đề nghị trả trước hạn**. Manager mở **Đề nghị trả trước hạn** từ tổng quan. Sau chấp thuận, khách mở lại chi tiết và dùng **Yêu cầu trả kho**.
6. Bảo trì: danh sách tạo phiếu chỉ nhận kho trống sẵn sàng. Kho đang thuê không mất khỏi hợp đồng: tra cứu **Kho đang thuê**, tiếp nhận sự cố rồi sắp xếp chuyển kho trước khi sửa. Phiếu bảo trì phát sinh từ trả kho có vấn đề vẫn theo quy trình phân công → sửa → nghiệm thu.

Sau chuyển kho, phiếu bảo trì kho nguồn được tạo tự động trong cùng giao dịch nếu còn thiếu. Manager phân công tại **Phân công nhân viên** → Staff sửa và gửi kết quả → nghiệm thu để đưa kho về trạng thái phù hợp. Với lệnh đã hoàn tất từ trước: mở chi tiết chuyển kho và dùng **Đồng bộ bảo trì kho nguồn** hoặc **Đồng bộ kết quả cho khách**. Không tạo lại phiếu đang có và không đưa kho đã sửa/đang được sử dụng vào bảo trì lần nữa.

Bundle xuất để kiểm tra nằm tại `mobile/dist-review/` và đã được loại khỏi Git. Lệnh dọn thư mục này bị bộ duyệt tự động chặn; không có tài khoản, đơn hoặc giao dịch kiểm thử thật nào được tạo để phải xóa khỏi database.

## 9. Cập nhật lịch sử và phân quyền bảo trì

- Customer web: **Kho & hàng của tôi → Lịch sử đặt kho** (`/customer/booking-history`). Có thể mở nhanh từ Tổng quan, Yêu cầu đặt kho và Kho đang thuê. Xem cả kho đã trả, đơn đã hủy/hết hạn; tìm theo tên, mã kho, đơn hoặc hợp đồng. Thời hạn lấy theo hợp đồng hiện có (kể cả gia hạn), báo giá được ghi rõ là lúc đặt. Mobile có mục Lịch sử đặt kho trong nhóm Kho & hàng của tôi.
- Manager: đã gỡ Quyết toán cọc khỏi menu, tổng quan, thông báo và chặn đường dẫn giao diện cũ ở web/mobile. API và hồ sơ tiền cọc BE vẫn giữ nguyên; thay đổi giao diện không tự duyệt, hoàn tiền hay kết thúc hồ sơ tài chính đang có.
- Bảo trì do Staff tạo tại `/staff/maintenance`: chọn kho trống → hạng mục → ưu tiên → mô tả → Tạo yêu cầu. Manager phân công tại Phân công nhân viên. Lỗi 403 sau cập nhật giao diện được xử lý bằng API Staff rõ ràng và xác minh lại vai trò nếu bộ nhớ phiên của FE vừa được tải lại.
- Bộ kiểm thử `npm run test:history-maintenance` chặn mọi API ghi: kiểm tra 111 đơn, sáu trang hợp đồng, lọc lịch sử, liên kết hợp đồng, gỡ quyết toán Manager và tạo bảo trì sau khi bộ nhớ vai trò bị trống. Không tạo dữ liệu thử thật.
