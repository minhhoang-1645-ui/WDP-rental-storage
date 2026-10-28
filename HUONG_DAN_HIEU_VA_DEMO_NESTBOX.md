# Hiểu và tự kiểm thử NestBox Storage

Đối chiếu mã nguồn ngày 27/10/2026. Tài liệu này giúp học nghiệp vụ, lần theo code và thực hành review. Checklist chi tiết, lệnh kiểm thử BE được chọn lọc và kết quả kiểm tra nằm trong [HUONG_DAN_TEST_NESTBOX.md](./HUONG_DAN_TEST_NESTBOX.md).

## 1. Project giải quyết việc gì?

NestBox cho khách thuê không gian lưu trữ tại một cơ sở: chọn loại kho, xem báo giá, đặt, thanh toán, nhận bàn giao, gửi/lấy hàng, gia hạn, yêu cầu hỗ trợ và trả kho. Nhân viên xử lý vận hành; quản lý phân công và đối chiếu tài chính; quản trị viên quản lý tài khoản.

Luồng chính:

**Chọn loại kho → Kiểm tra lịch trống/báo giá → Đặt kho → Xác nhận/phân bổ → Thanh toán ban đầu → Đặt lịch → Bàn giao → Sử dụng → Trả kho/kiểm tra → Quyết toán cọc.**

Gia hạn, hỗ trợ, nhập–xuất và chuyển kho là các nhánh trong quá trình sử dụng. Không phải thao tác nào cũng là bước kế tiếp của đặt kho.

## 2. Kiến trúc và dữ liệu cần hiểu

| Thành phần | Công nghệ trong repo | Trách nhiệm |
|---|---|---|
| Web `FE/` | React, TypeScript, Vite, React Router, Tailwind | Hiển thị, form, điều hướng, gọi API, theo dõi cập nhật |
| Mobile `mobile/` | React Native, Expo, Expo Router | Giao diện bốn vai trò; dùng chung BE với web |
| BE `BE/` | NestJS chạy trên Node.js, TypeScript | Xác thực, phân quyền, giá, điều kiện chuyển trạng thái, giao dịch dữ liệu |
| Dữ liệu | Prisma, PostgreSQL trên Supabase | Lưu tài khoản, kho, đơn, hợp đồng, tiền, hàng và lịch sử nghiệp vụ |

Web/mobile gọi HTTP `/api/...` tới BE; BE dùng Prisma làm việc với database. Web/mobile không phải hai hệ thống dữ liệu riêng. Đổi trạng thái trên web phải được nhìn thấy trên mobile khi tải lại đúng hồ sơ.

BE là **NestJS trên Node.js**, không phải Next.js. Đăng nhập hiện do BE tự xử lý: so sánh mật khẩu gốc với hash scrypt và cấp bearer token ngẫu nhiên. Không nên trình bày token này là JWT hoặc nói Supabase Auth đang xác thực tài khoản của app.

Phiên BE hiện lưu trong bộ nhớ, thời hạn tám giờ. Khởi động lại BE làm mất phiên cũ; đăng nhập lại là hành vi dự kiến. Trên mobile native, token được lưu bằng SecureStore; trên web có bộ nhớ phiên phía client. Mật khẩu gõ vào form là mật khẩu gốc, không phải hash.

| Khái niệm | Ý nghĩa | Ví dụ/cách đối chiếu |
|---|---|---|
| `StorageType` | Loại kho khách chọn: kích thước, điều hòa, giá | Kho nhỏ B12 là một lựa chọn danh mục |
| `StorageUnit` | Kho vật lý thực tế tại cơ sở | Mã/vị trí kho được phân bổ cho khách |
| `Reservation` | Yêu cầu đặt loại kho, số lượng, kỳ thuê | Một đơn có thể thuê nhiều kho |
| `ReservationUnit` | Liên kết đơn với kho vật lý trong khoảng ngày | Dùng kiểm tra phân bổ và xung đột lịch |
| `RentalContract` | Hợp đồng gắn với một phân bổ kho | Kiểm tra đủ hợp đồng theo số kho đặt |
| `Invoice` | Khoản phải thanh toán | Ban đầu, định kỳ, gia hạn hoặc quyết toán |
| `Payment` | Khoản tiền đã được ghi nhận | Một hóa đơn có thể có nhiều khoản thu |
| `OnlinePaymentTransaction` | Phiên làm việc với cổng thanh toán | PENDING không đồng nghĩa đã thu tiền |
| `StoredItem` | Mặt hàng của khách trong hợp đồng | Tên, đơn vị và số lượng đang lưu |
| `StockMovement` | Phiếu nhập hoặc xuất hàng | Tồn đổi sau khi hoàn tất kiểm đếm |

Ba điểm dễ nhầm: loại kho khác kho vật lý; hóa đơn khác khoản thu; đơn đã xác nhận khác hợp đồng đã hoạt động. Ảnh danh mục hiện là ảnh tham khảo.

## 3. Hiểu đúng bốn vai trò

| Vai trò | Khu vực web | Phần cần thực hành |
|---|---|---|
| Customer | `/customer` | Đặt, trả tiền, lịch nhận kho, hợp đồng, hàng, gia hạn, hỗ trợ, chuyển/trả kho |
| Staff | `/staff` | Chín nhóm đã chuyển: đặt kho, tư vấn, hỗ trợ, bàn giao, nhập–xuất, gia hạn, chuyển kho, trả kho, bảo trì |
| Manager | `/manager` | Tổng quan/báo cáo, phân công, kho và khách hàng, hợp đồng, hóa đơn, thu tiền và duyệt đề nghị trả sớm; đã gỡ quyết toán cọc khỏi giao diện |
| Admin | `/admin` | Hai mục đã chốt: Tổng quan và Quản lý tài khoản; cấp tài khoản Staff/Manager và cập nhật trạng thái |

Staff có tra cứu kho đang thuê để phục vụ công việc nhưng không có chức năng phân công nhân viên hoặc nghiệp vụ tài chính của Manager. Manager phân công hỗ trợ, bảo trì và phiếu nhập–xuất; không phải mọi yêu cầu đều cần phân công riêng.

Tên file/component còn chữ `Manager` có thể được tái sử dụng cho Staff. Quyền thực tế phải xem route, ngữ cảnh workspace, endpoint, guard và service; không suy ra quyền chỉ từ tên component.

Phạm vi menu Admin hai mục là phạm vi giao diện đã thống nhất. Một số API BE cũ vẫn cho Admin truy cập; không suy luận rằng ẩn menu đồng nghĩa endpoint đã chặn quyền. Khi test API trực tiếp phải đối chiếu guard thực tế.

## 4. Chuẩn bị một lần trước khi test

1. Tại thư mục gốc chạy `.\scripts\start-local.ps1` bằng lệnh PowerShell bên dưới. Không chạy seed/migrate/reset để chuẩn bị buổi review.
2. Mở web http://127.0.0.1:5173/, mobile web http://127.0.0.1:8081/, Swagger http://127.0.0.1:3000/api/docs.
3. Dùng bốn hồ sơ trình duyệt riêng hoặc các trình duyệt khác nhau cho bốn tài khoản. Nhiều tab trong cùng hồ sơ vẫn chia sẻ tài khoản.
4. Ghi lại mã đơn, hóa đơn, hợp đồng, phiếu đang dùng. Dùng đúng các mã đó để tìm bên vai trò khác.
5. Với các bước ghi dữ liệu khi tự thực hành, dùng môi trường thử riêng nếu cần tạo dữ liệu dùng rồi bỏ. Không xóa trực tiếp hợp đồng/khoản thu đã liên kết trong database đang review.

```powershell
cd E:\IELTS\WDP-rental-storage
.\scripts\start-local.ps1
```

Mobile web giúp kiểm tra logic và giao diện, nhưng không thay thế kiểm tra bàn phím/quyền hệ điều hành trên thiết bị thật. Điện thoại thật phải cùng Wi-Fi với máy chạy BE và dùng địa chỉ LAN do script in ra, không dùng localhost của điện thoại. Đặt kho mới/đăng ký Customer hiện dùng luồng web; mobile tập trung quản lý tài khoản và hồ sơ sau đó.

## 5. Tự test một vòng nghiệp vụ hoàn chỉnh

### A. Danh mục, tư vấn và đặt kho

1. Chưa đăng nhập: mở Danh sách và So sánh kho; lọc nhóm kích thước, mở chi tiết. Đối chiếu tên, mã, ảnh, diện tích, điều hòa và giá.
2. Bấm chọn một kho. Ba bước đặt kho phải giữ đúng sản phẩm/ảnh; thay lựa chọn phải cập nhật thông tin tương ứng.
3. Chọn ngày thuê, kỳ thuê, số lượng và dịch vụ. Đổi ngày hoặc số lượng: báo giá/khả dụng cũ phải được kiểm tra lại. Không đủ kho thì không được gửi tiếp.
4. Đăng nhập Customer và gửi đơn. Ghi mã đơn; mở Yêu cầu đặt kho để đọc trạng thái và bước tiếp theo.
5. Khi đủ điều kiện, đơn tự `CONFIRMED`, phân bổ kho, sinh hợp đồng/hóa đơn và hạn giữ 24 giờ. Nếu còn `PENDING`, Staff mở cùng mã để kiểm tra ngoại lệ; đừng chờ một nút duyệt cho đơn đã tự xác nhận.
6. Kiểm tra riêng luồng chưa đăng nhập: yêu cầu xác minh email chưa phải giữ kho. Chỉ tiếp tục qua email khi dịch vụ gửi thật hoạt động. Luồng yêu cầu liên hệ tạo hồ sơ tư vấn, không phải hợp đồng ACTIVE.

### B. Thanh toán ban đầu và nhận kho

1. Customer mở Thanh toán, tìm đúng hóa đơn của đơn vừa tạo. So sánh khoản phải trả ban đầu, tổng kỳ thuê, cọc và dịch vụ.
2. Dùng phương thức hiện được cấu hình. Sau khi thanh toán, kiểm tra **hóa đơn PAID, số đã thu và lịch sử tiền**. Gửi thông báo chuyển khoản hoặc mở QR chưa tự chứng minh BE đã thu tiền. Manager xử lý phần cần đối chiếu theo hồ sơ thực tế.
3. Sau PAID, hợp đồng đủ điều kiện chuyển `READY_FOR_HANDOVER`; Customer đặt lịch nhận kho. Lịch hợp lệ có thể tự `CONFIRMED`.
4. Staff mở Lịch bàn giao, tìm đúng đơn, kiểm tra khách, số kho, thời gian và điều kiện. Chỉ hoàn tất khi đến giờ hẹn, từ ngày bắt đầu thuê và còn trong kỳ thuê.
5. Quay lại Customer: hợp đồng `ACTIVE`, kho đang thuê hiện đúng vị trí. Staff hoàn tất bàn giao khác với chỉ xác nhận thời gian hẹn.

Nếu demo 28/10/2026 và muốn bàn giao trong buổi, chọn bắt đầu 28/10/2026 cùng giờ hẹn phù hợp. Không chọn kỳ thuê tương lai rồi mong kích hoạt sớm. Ngày kết thúc không tính vào thời gian sử dụng; ví dụ 28/10/2026 → 28/01/2027 thì ngày sử dụng cuối là 27/01/2027.

### C. Nhập hàng, xuất hàng và đối chiếu tồn

1. Customer có hợp đồng ACTIVE → Nhập – xuất hàng → tạo phiếu IN, ví dụ tên “Thùng tài liệu”, đơn vị “thùng”, yêu cầu 5.
2. Trước khi hoàn tất, Hàng đang lưu chưa được tăng 5 chỉ vì đã gửi yêu cầu.
3. Manager → Phân công nhân viên → tìm mã phiếu → chọn Staff → lưu.
4. Staff được giao mở phiếu, kiểm đếm, ghi số thực tế và hoàn tất. Customer xem lại Hàng đang lưu và lịch sử phiếu.
5. Ví dụ thực nhận 5, sau đó xuất 2 thì còn 3. Xuất vượt tồn phải bị chặn. Đổi sang Staff khác không được hoàn tất thay người được giao.

### D. Hỗ trợ và thông báo

1. Customer gửi vấn đề gắn đúng hồ sơ. Manager phân công Staff.
2. Staff được giao bắt đầu, ghi kết quả hoặc chuyển xử lý tiếp nếu không giải quyết được.
3. Hồ sơ ESCALATED được xử lý bằng quyền vận hành Staff theo bản chuyển quyền hiện tại; phân công vẫn thuộc Manager. Đừng theo chú thích cũ còn chữ Manager để đổi tài khoản sai.
4. Customer mở chuông thông báo hoặc Kiểm tra mới. Đối chiếu phản hồi/trạng thái và link mở đúng hồ sơ.
5. Giữ một form đang nhập ở vai trò khác khi có cập nhật: nội dung không được mất. Đã đọc thông báo không có nghĩa là công việc đã hoàn tất. Ứng dụng kiểm tra khoảng 30 giây/lần khi đang mở; đây chưa phải push khi app đã đóng.

### E. Gia hạn

1. Dùng hợp đồng ACTIVE theo tháng; Customer chọn thêm kỳ thuê và kế hoạch thanh toán.
2. Đối chiếu hạn cũ, hạn mới và tiền. Khi đủ điều kiện hệ thống tự duyệt; ngoại lệ PENDING do Staff kiểm tra.
3. `APPROVED_PENDING_PAYMENT`: Customer phải thanh toán hóa đơn kích hoạt gia hạn. Duyệt chưa phải đã đổi xong thời hạn.
4. Sau khi BE xác nhận khoản kích hoạt: gia hạn `COMPLETED`, hạn hợp đồng/phân bổ được cập nhật. Không thu lại cọc cho gia hạn này. Nếu trả theo tháng, các hóa đơn kỳ tiếp theo vẫn có thể còn phải trả.
5. Không trình bày bản in gia hạn như phụ lục đã ký: API phụ lục có chữ ký chưa được triển khai.

### F. Chuyển kho

1. Customer gửi nhu cầu qua Hỗ trợ/Chuyển đổi kho. Staff mở hồ sơ và hợp đồng nguồn.
2. Staff tạo/duyệt chuyển theo quyền hiện có, chọn kho đích hợp lệ; BE kiểm tra loại kho và lịch trống. Bản hiện tại không phải tự nâng cấp tùy ý sang loại kho khác.
3. Sau `APPROVED`, vị trí sử dụng chưa được coi là đã chuyển xong. Thực hiện chuyển thực tế rồi Staff hoàn tất.
4. Khi hoàn tất, yêu cầu chuyển kho gốc của Customer được đồng bộ đã giải quyết trong cùng giao dịch. Customer thấy kho nguồn/đích và kết quả, hợp đồng trỏ đến kho mới. Lệnh cũ có thể dùng **Đồng bộ kết quả cho khách**; không di chuyển lần nữa.

### G. Trả kho, cọc và bảo trì

1. Trả đúng hạn: tạo yêu cầu trực tiếp. Trả trước hạn: khách gửi **Đề nghị trả trước hạn**; Manager đối chiếu công nợ/cọc, ghi điều kiện và chấp thuận hoặc từ chối. Sau chấp thuận đúng kỳ thuê, khách mới tạo hồ sơ trả. Không tự hoàn tiền thuê/cọc và không sửa ngày database để vượt điều kiện.
2. Customer yêu cầu trả → Staff bắt đầu kiểm tra → ghi PASS hoặc vấn đề cho từng kho → xác nhận nhận trả.
3. Kiểm tra hợp đồng kết thúc và phân bổ được giải phóng. Kho có vấn đề cần bảo trì không được hiện sẵn sàng chỉ vì khách đã trả.
4. Theo yêu cầu mới, giao diện Manager đã gỡ quyết toán cọc. Hồ sơ cọc và API BE vẫn được giữ nguyên; không tự hoàn tiền hay đánh dấu hồ sơ tài chính đã xong từ thay đổi giao diện.
5. Trường hợp sạch và không có cọc có thể tự kết thúc; có cọc/vấn đề thì theo hồ sơ quyết toán. Không mặc định mọi hồ sơ đều có cùng số bước.
6. Chuyển kho hoàn tất tự tạo phiếu kiểm tra/bảo trì kho nguồn còn thiếu; lệnh cũ đồng bộ từ chi tiết chuyển kho. Không tạo phiếu trùng hoặc làm lại kho đã sửa xong. Với bảo trì: Staff báo kho đủ điều kiện hoặc phát sinh từ kiểm tra trả; Manager phân công; Staff được giao bắt đầu và gửi kết quả; Staff có quyền xử lý nghiệm thu trong phân hệ vận hành hiện tại. Chỉ sau nghiệm thu mới hoàn tất bảo trì.

### H. Admin, báo cáo và đối chiếu cuối vòng

1. Admin chỉ hai mục menu; xem tài khoản, tìm kiếm, kiểm tra trạng thái. Chỉ thực hành tạo/khóa tài khoản trên môi trường thử hoặc tài khoản đã xác định phù hợp; không khóa tài khoản đang demo.
2. Manager lọc báo cáo theo kỳ, đối chiếu hóa đơn và lịch sử thu. Tổng hóa đơn phát hành khác tiền thực thu; kiểm tra CSV nếu có xuất.
3. Customer đối chiếu đơn/hợp đồng/hóa đơn/hàng/hỗ trợ cùng mã hồ sơ. Web và mobile tải lại phải cùng trạng thái.

## 6. Tự đối chiếu tiền để giải thích được

Theo `BE/src/modules/pricing/pricing.service.ts` hiện tại, chưa cộng phí/thuế chưa có dữ liệu:

| Trường hợp | Quy tắc chính |
|---|---|
| Thuê tháng | Giá tháng × số tháng lịch × số kho |
| Thuê ngắn ngày đủ điều kiện | Giá tháng × số ngày × số kho / 30, làm tròn theo BE; không phải loại nào cũng được thuê ngày |
| Trả trước | Kỳ 3/6/12 tháng giảm tiền thuê tương ứng 5%/10%/15%; không giảm tiền cọc |
| Cọc tủ lưu trữ | Không thu cọc |
| Cọc kho nhỏ thuê ngày | Bằng tiền thuê tính được |
| Cọc các trường hợp còn lại | Một tháng giá niêm yết × số kho |
| Dịch vụ mua một lần | Đơn giá × số lượng |
| Dịch vụ theo ngày | Đơn giá × số lượng × ngày dịch vụ |
| Dịch vụ theo tháng | Đơn giá × số lượng × số tháng lịch dịch vụ; kỳ dịch vụ phải hợp lệ và nằm trong kỳ thuê kho |

Ví dụ **giả sử báo giá kho nhỏ là 1.500.000đ/tháng**, thuê 1 kho trong 3 tháng, không dịch vụ:

- Trả hàng tháng: tiền thuê cả kỳ 4.500.000đ + cọc 1.500.000đ = tổng dự kiến 6.000.000đ. Ban đầu dự kiến trả 3.000.000đ; hai tháng sau mỗi tháng 1.500.000đ.
- Trả trước: giảm 5% của 4.500.000đ = 225.000đ. Tiền thuê còn 4.275.000đ; cộng cọc 1.500.000đ = 5.775.000đ.

Đây là bài tính để đối chiếu, không phải sửa giá của hệ thống. Tổng giá trị cả kỳ khác số cần trả ban đầu. Báo giá API và hóa đơn phát hành là nơi đối chiếu thực tế; đừng tự suy cọc chỉ từ một trường danh mục khi báo giá áp dụng quy tắc theo loại/kỳ thuê.

## 7. Các trạng thái nên nhớ

| Hồ sơ | Luồng thông thường | Nhánh cần biết |
|---|---|---|
| Đơn | PENDING → CONFIRMED | Có thể tự xác nhận ngay; REJECTED/CANCELLED/EXPIRED là nhánh khác |
| Hợp đồng | PENDING_PAYMENT → READY_FOR_HANDOVER → ACTIVE → COMPLETED | Bị hủy thì CANCELLED |
| Hóa đơn | OPEN → PARTIALLY_PAID → PAID | Có thể trả đủ một lần bỏ qua PARTIALLY_PAID; VOID không tiếp tục thu |
| Lịch bàn giao | CONFIRMED → COMPLETED | REQUESTED cho trường hợp cần kiểm tra; có CANCELLED |
| Nhập–xuất | REQUESTED → ASSIGNED → COMPLETED | Tồn đổi ở bước cuối |
| Hỗ trợ | OPEN → ASSIGNED → IN_PROGRESS → RESOLVED | Có thể ESCALATED trước RESOLVED |
| Gia hạn | PENDING → APPROVED_PENDING_PAYMENT → COMPLETED | Có thể tự duyệt hoặc REJECTED |
| Chuyển kho | REQUESTED → APPROVED → COMPLETED | Có thể REJECTED |
| Trả kho | REQUESTED → INSPECTION_IN_PROGRESS → PENDING_SETTLEMENT → COMPLETED | Có ISSUE_FOUND và nhánh tự quyết toán đủ điều kiện |
| Bảo trì | OPEN → IN_PROGRESS → AWAITING_VERIFICATION → COMPLETED | Không tự sẵn sàng ở AWAITING_VERIFICATION |

## 8. Test nhánh lỗi, phân quyền và UX

Một chức năng chỉ đạt khi thử được cả trường hợp đúng và bị chặn:

- Login: đúng/sai mật khẩu, hết phiên, đăng xuất, restart BE rồi đăng nhập lại.
- Quyền: Customer mở URL Staff/Manager/Admin; Staff mở phân công/tài chính; Admin mở URL vận hành cũ. UI phải giữ đúng khu vực; API trực tiếp đối chiếu đúng guard riêng.
- Quyền sở hữu: Customer không đọc/sửa đơn hoặc hàng của Customer khác; Staff không hoàn tất phiếu được giao cho người khác.
- Ngày/số lượng: quá khứ, kỳ không hợp lệ, số âm/0, vượt giới hạn, hết kho, xuất vượt tồn.
- Đồng thời: bấm gửi hai lần; hai người đặt cùng kho/cùng kỳ; API phải chặn phân bổ xung đột. Test đồng thời bằng môi trường thử riêng hoặc bài tự động, không tạo đơn rác ở database đang dùng.
- Tiền: hủy thanh toán, phiên chờ, tải lại khi chờ, hết hạn, hóa đơn VOID, đã PAID rồi không thu lần nữa. Không dùng dấu “đã mở cổng thanh toán” làm tiêu chí đạt.
- Form/thông báo: mất mạng rồi thử lại, dữ liệu form được giữ, cập nhật mới không ghi đè nội dung đang nhập, link thông báo đúng vai trò/hồ sơ.
- Giao diện: màn hình máy tính và điện thoại, bàn phím, ô mật khẩu, menu, nút gửi, bảng dài, trang rỗng, ảnh lỗi, nhiều trang dữ liệu.

Mẫu ghi kết quả: `Mã test | Vai trò | URL | Mã hồ sơ | Thao tác | Mong đợi | Thực tế | Đạt/Lỗi | Ảnh/Thời điểm`. Không ghi token/mật khẩu vào báo cáo.

## 9. Tự tìm nguyên nhân lỗi bằng Network và Swagger

Mở DevTools → Network → Fetch/XHR → thực hiện đúng một thao tác → chọn request lỗi. Đọc URL, HTTP status và Response; không chỉ xem dòng đỏ ở Console.

| Hiện tượng | Cần kiểm tra |
|---|---|
| Không có request | Form validation, nút disabled, thông báo ở màn hình |
| Không kết nối/Failed to fetch | BE còn chạy không, API URL, CORS, Wi-Fi/LAN trên điện thoại |
| 400 | Dữ liệu đầu vào, ngày, số lượng và message Response |
| 401 | Login sai thông tin hoặc phiên thiếu/hết hạn; restart BE thì login lại |
| 403 | Sai vai trò hoặc không phải người được giao |
| 404 | Sai mã, hồ sơ không tồn tại hoặc không thuộc tài khoản |
| 409 | Sai trạng thái, không còn kho, chưa đến giờ, tồn không đủ hoặc xung đột; đọc message để phân biệt chặn đúng với lỗi |
| 500 | Ghi thời điểm/mã hồ sơ, xem log BE và kết nối database |

Thông báo React DevTools không phải lỗi login. Một HTTP 401 tự nó cũng chưa chứng minh Supabase bị sự cố. Swagger mô tả endpoint, request và quyền; đọc GET trước. Các nút POST/PATCH có thể ghi dữ liệu thật, không bấm thử tùy ý trên dữ liệu đang review.

## 10. Lần theo code để trả lời giảng viên

Ví dụ lần theo nhập–xuất: trang/form → client API → controller → service kiểm tra hợp đồng/quyền/tồn → transaction Prisma → trả trạng thái → màn hình/thông báo cập nhật.

| Cần hiểu | File/thư mục bắt đầu |
|---|---|
| URL web và role guard | `FE/src/app/router.tsx`, `FE/src/auth/` |
| Menu Staff/Manager | `FE/src/components/manager/operations-navigation.ts` |
| Menu Admin | `FE/src/pages/admin/AdminLayout.tsx` |
| Web gọi BE | `FE/src/services/`, `FE/src/services/api.ts` |
| Chọn kho/báo giá/form | `FE/src/pages/public/BookingWizardPage.tsx` |
| Thông báo và bước tiếp theo | `FE/src/activity/`, `FE/src/utils/activity.ts`, `FE/src/utils/workflow-guide.ts` |
| Mobile routes và gọi API | `mobile/src/app/`, `mobile/src/services/` |
| BE đăng nhập/quyền | `BE/src/modules/auth/auth.service.ts`, `roles.guard.ts`, `operation-access.ts` |
| BE nghiệp vụ | `BE/src/modules/booking`, `pricing`, `billing`, `appointments`, `stock-movements`, `renewals`, `support`, `transfers`, `returns`, `deposit-settlements`, `maintenance` |
| Quan hệ database | `BE/prisma/schema.prisma` |

Các controller nhận HTTP và kiểm tra quyền; service chứa điều kiện nghiệp vụ; Prisma transaction giúp các thay đổi liên quan cùng thành công hoặc cùng rollback. Các thao tác có idempotency giúp retry không tạo lặp cho cùng lần gửi.

## 11. Chạy test và trình bày review

Trong `FE/`: `npm test`, `npm run build`, `npm run lint`. Cần BE, FE và Expo web đang chạy. Các suite có kiểm tra cả web/mobile web và chặn gửi nghiệp vụ thử thật; xem phạm vi trong checklist liên kết đầu tài liệu.

Trong `mobile/`: `npm run typecheck`, `npm run lint`. Export nếu cần kiểm tra bundle theo lệnh ở checklist.

Không dùng `npm test` BE mặc định trên database đang dùng: nhiều integration test tạo/xóa dữ liệu. Dùng đúng chín suite mock đã ghi tại mục 4 của checklist hoặc database thử riêng. Không cần chạy lại toàn bộ test chỉ để bắt đầu buổi trình bày.

Kịch bản review khoảng 15–20 phút: giải thích bốn vai trò và mô hình kho (2 phút), chọn/đặt/báo giá (3 phút), thanh toán/bàn giao với hồ sơ đủ điều kiện (4 phút), nhập–xuất và phân công (3 phút), gia hạn/hỗ trợ và thông báo (3 phút), trả kho/cọc bằng hồ sơ đã đến hạn cùng Admin/báo cáo (3–5 phút).

Chuẩn bị trước hồ sơ cho từng trạng thái. Đơn mới hôm nay chưa đến hạn vẫn có thể trình bày nhánh đề nghị trả sớm có Manager duyệt; trả đúng hạn dùng hồ sơ đã đến hạn. Không sửa ngày database để ép luồng. Nếu cổng thanh toán/email chưa hoạt động trong môi trường local, trình bày đúng giới hạn và dùng hồ sơ đã thanh toán để giới thiệu phần sau. Ảnh/liên hệ tham khảo, phụ lục chưa ký và thông báo chưa phải closed-app push cũng cần được mô tả đúng.

## Thay đổi theo yêu cầu mới

Lịch sử đơn và kho đã trả nằm trong **Lịch sử đặt kho** trên web/mobile. Kho đang thuê chỉ hiển thị kỳ thuê còn hoạt động; một kho đã trả không phải bị mất dữ liệu khi rời danh sách này. Lịch sử ghép toàn bộ đơn của tài khoản với hợp đồng của chính tài khoản, dùng mã đơn công khai để đối chiếu với reference của hợp đồng.

Mục quyết toán cọc đã được gỡ khỏi khu vực Manager trên giao diện, kể cả thông báo và đường dẫn cũ. BE và hồ sơ tài chính cọc hiện có vẫn giữ nguyên; không trình bày thay đổi giao diện là đã xóa/cải tổ nghiệp vụ cọc của BE. Bảo trì vẫn thuộc Staff; Manager phân công và theo dõi qua nhân sự/báo cáo.
