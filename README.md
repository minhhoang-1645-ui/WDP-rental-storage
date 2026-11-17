# NestBox Storage — báo cáo mã nguồn và chức năng hiện tại

**Ngày đối chiếu: 10/11/2026. Mốc Git: `c775ebf` (`merge branch hoang`).** Báo cáo mô tả mã đã merge và các thay đổi local chưa commit, không quy toàn bộ tính năng của nhóm thành thay đổi mới của một lượt chỉnh sửa.

Đã lập danh mục mã nguồn BE, web, mobile, schema/migrations, cấu hình mẫu và kiểm thử; đối chiếu controller, service nghiệp vụ, quyền, router, biểu mẫu, báo giá, thông báo và báo cáo. Không tính thư viện, mã sinh tự động, bản build, ảnh/video hoặc khóa bí mật là mã nghiệp vụ cần đọc. Có mã nguồn không đồng nghĩa đã nghiệm thu mọi tình huống sử dụng thực tế.

**Lượt lập báo cáo này chỉ sửa tài liệu**, không sửa chức năng, schema, mật khẩu hoặc dữ liệu database. Kết quả kiểm thử dưới đây là kết quả đã ghi nhận trong lượt hoàn thiện trước ngày 10/11, không phải vừa chạy lại toàn bộ khi viết báo cáo. Đây là báo cáo tổng hợp chính; tài liệu cũ còn trong repo chỉ dùng để tham khảo lịch sử theo ngày.

## Mục lục

1. [Mục đích và kiến trúc](#1-mục-đích-và-kiến-trúc)
2. [Chức năng bốn vai trò](#2-chức-năng-bốn-vai-trò)
3. [Các luồng nghiệp vụ](#3-các-luồng-nghiệp-vụ)
4. [Cách tính tiền](#4-cách-tính-tiền)
5. [Dữ liệu và lịch sử](#5-dữ-liệu-và-lịch-sử)
6. [Giao diện web và mobile](#6-giao-diện-web-và-mobile)
7. [Thông báo và công việc](#7-thông-báo-và-công-việc)
8. [Báo cáo và biểu đồ Manager](#8-báo-cáo-và-biểu-đồ-manager)
9. [Tự động hóa](#9-tự-động-hóa)
10. [Các phần BE](#10-các-phần-be)
11. [Thay đổi local chưa commit](#11-thay-đổi-local-chưa-commit)
12. [Kiểm thử đã ghi nhận](#12-kiểm-thử-đã-ghi-nhận)
13. [Dữ liệu demo RV10](#13-dữ-liệu-demo-rv10)
14. [Cấu hình và chạy dự án](#14-cấu-hình-và-chạy-dự-án)
15. [Giới hạn cần biết](#15-giới-hạn-cần-biết)
16. [Bản đồ mã nguồn](#16-bản-đồ-mã-nguồn)

## 1. Mục đích và kiến trúc

NestBox là ứng dụng thuê kho tự lưu trữ tại một cơ sở. Khách chọn kho, thời gian và dịch vụ; hệ thống quản lý kho vật lý, hợp đồng, khoản thu, nhận kho, hàng gửi/lấy, gia hạn, chuyển/trả kho và hỗ trợ. Staff xử lý vận hành; Manager quản lý tài chính, ngoại lệ, nhân viên và danh mục; Admin quản lý tài khoản và nhật ký.

| Thành phần | Công nghệ khai báo trong dự án | Vai trò |
| --- | --- | --- |
| `BE/` | Node.js, NestJS 12, TypeScript, Prisma 7, `pg` | API và quy tắc nghiệp vụ |
| Database | PostgreSQL; cấu hình nhóm dùng Supabase PostgreSQL | Dữ liệu dùng chung |
| `FE/` | React 19, TypeScript 6, Vite 8, Router 7, Tailwind 4 | Website bốn vai trò |
| `mobile/` | Expo 57, React Native 0.86, Expo Router, SecureStore, SVG | Ứng dụng dùng chung BE |
| Tài liệu | PDFKit và mẫu/phông chữ trong BE | Hợp đồng, phụ lục, hóa đơn, biên bản chuyển kho |
| Email | Nodemailer/SMTP hoặc Resend | Xác minh, khôi phục tài khoản, OTP ký |
| Thu tiền | Chuyển khoản ngân hàng/QR, VNPay | Ghi nhận khoản thu và đối soát |
| Kiểm thử | Vitest, Node test, Playwright, script smoke | Nghiệp vụ, UI, quyền và xử lý lỗi |

BE **không phải Next.js**. Supabase là database; đăng nhập dùng cơ chế riêng của NestJS, không phải Supabase Auth. API mặc định `/api` trên cổng 3000, Swagger `/api/docs`; web 5173, Expo web 8081. Web và mobile không có database nghiệp vụ riêng.

### Đăng nhập và bảo vệ dữ liệu

- Mật khẩu băm bằng **scrypt kèm salt**, không trả mật khẩu gốc qua API.
- Bearer token là chuỗi ngẫu nhiên, không phải JWT; database lưu SHA-256 của token trong `AuthSession`.
- Phiên thường 8 giờ, chọn ghi nhớ đăng nhập 30 ngày.
- **Phiên đăng nhập hiện lưu trong database**, qua migration `20261106000100_persist_auth_sessions`. Mô tả cũ “restart BE làm mất toàn bộ phiên vì lưu RAM” không còn đúng.
- Xác thực phiên có kiểm tra trạng thái tài khoản hiện tại. Tài khoản bị vô hiệu hóa không tiếp tục dùng API được bảo vệ.
- Đăng xuất thu hồi phiên hiện tại; đặt lại mật khẩu thu hồi các phiên của tài khoản.
- Đăng ký công khai luôn tạo CUSTOMER; gửi trường role không nâng quyền.
- Có giới hạn tần suất đăng nhập và số tác vụ băm mật khẩu đồng thời.
- Router, API guard và service cùng kiểm tra quyền; đổi URL hoặc menu không thay đổi quyền thật.
- Customer chỉ truy cập hồ sơ của mình. Các luồng hoàn tất việc được giao kiểm tra Staff phụ trách.
- Có transaction, khóa bản ghi, phiên bản cập nhật và khóa chống gửi trùng ở các thao tác quan trọng; không phải mọi endpoint đều dùng cùng một cơ chế.
- Nhật ký không lưu nguyên body chứa mật khẩu, OTP hoặc chữ ký.

## 2. Chức năng bốn vai trò

Vai trò chia theo trách nhiệm. Cùng đọc một hợp đồng khi cần phối hợp không có nghĩa cùng được sửa hoặc xử lý mọi bước.

| Công việc | Customer | Staff | Manager | Admin |
| --- | --- | --- | --- | --- |
| Đặt kho | Tạo/theo dõi của mình | Tiếp nhận, xử lý ngoại lệ | Xem số liệu/hồ sơ cần quản lý | Không xử lý |
| Hợp đồng/phụ lục | Ký của mình | Tra cứu vận hành | Tra cứu, đối chiếu | Không ký thay |
| Thanh toán | Trả tiền, gửi chứng từ | Không duyệt tiền | Ghi nhận/kiểm tra thu, đối soát | Không xử lý |
| Bàn giao | Đặt lịch, theo dõi | Bàn giao thực tế | Theo dõi khi cần | Không xử lý |
| Nhập/xuất hàng | Tạo phiếu, xem tồn | Kiểm đếm, hoàn tất | Phân công/tra cứu cần thiết | Không xử lý |
| Gia hạn | Gửi, ký, trả tiền | Xử lý yêu cầu cần duyệt | Theo dõi tài chính/hồ sơ | Không xử lý |
| Chuyển cùng loại | Gửi yêu cầu, theo dõi | Lập, chọn đích, duyệt, hoàn tất | Tra cứu khi cần | Không xử lý |
| Trả thông thường | Gửi, lấy hết hàng | Kiểm tra/kết thúc vật lý | Quyết toán cọc | Không xử lý |
| Trả sớm | Gửi đề nghị | Thực hiện sau chấp thuận | Quyết định điều kiện | Không xử lý |
| Hỗ trợ | Gửi/theo dõi | Giải quyết thông thường | Quyết định hồ sơ chuyển lên | Không xử lý |
| Bảo trì | Báo sự cố qua hỗ trợ | Tạo, thực hiện | Phân công, nghiệm thu/làm lại | Không xử lý |
| Phân công | Không | Xem kho/việc được giao | Gán Staff phụ trách kho | Không phân công vận hành |
| Kho, giá, thiết bị | Xem để thuê | Tra cứu để làm việc | Quản lý danh mục/số lượng | Không vận hành danh mục |
| Báo cáo | Hồ sơ/tiền của mình | Công việc của mình | Số liệu cơ sở/biểu đồ | Tổng quan quản trị |
| Tài khoản nội bộ | Không tạo | Không tạo | Không tạo quản trị viên | Tạo Staff/Manager, trạng thái |
| Nhật ký hệ thống | Không | Không | Không quản trị nhật ký | Tra cứu/lọc |

### Customer — người thuê kho

Gốc `/customer`. Đã có tổng quan, thông báo/việc cần làm, đơn đặt và chi tiết, kho đang thuê, lịch sử đặt thuê, hàng đang lưu, phiếu nhập/xuất, hợp đồng, thanh toán/lịch sử thu, lịch nhận kho, gia hạn, chuyển/trả kho/cọc, hỗ trợ và hồ sơ cá nhân.

Khách xem trạng thái và bước tiếp theo theo lời dành cho người thuê. Lịch sử đặt thuê có liên kết hợp đồng. Hồ sơ hoàn tất vẫn tra cứu được; đọc thông báo không đóng yêu cầu.

### Staff — nhân viên vận hành

Gốc `/staff`. Chín nhóm chính đúng phạm vi đã chốt:

1. Yêu cầu đặt kho.
2. Yêu cầu tư vấn.
3. Hỗ trợ khách hàng.
4. Lịch bàn giao.
5. Nhập – xuất hàng.
6. Gia hạn kho.
7. Chuyển kho.
8. Trả kho.
9. Bảo trì kho.

Có bàn làm việc, kho được giao, thông báo và tra cứu hồ sơ cần thiết. Staff không phân công nhân viên thay Manager, không xác nhận thu/hoàn cọc, không tự nghiệm thu bảo trì của mình. Bàn giao có người nhận, tình trạng, chìa khóa và ghi chú; thông tin khách được điền sẵn khi phù hợp. Phiếu hàng phân biệt số yêu cầu và số thực tế.

### Manager — quản lý cơ sở

Gốc `/manager`. Menu chính gom thành **bảy nhóm**:

| Nhóm | Nội dung |
| --- | --- |
| Tổng quan | Số liệu hiện tại, việc quản lý, cập nhật mới |
| Phân công nhân viên | Phụ trách từng kho, xử lý việc chưa có người |
| Phê duyệt ngoại lệ | Trả sớm, hỗ trợ chuyển lên, nghiệm thu bảo trì |
| Tài chính | Hóa đơn/nợ, khoản thu, chuyển khoản, đối soát VNPay, cọc |
| Hồ sơ thuê | Khách, hợp đồng, kỳ thuê và lịch sử |
| Kho & bảng giá | Loại kho, kho vật lý, giá, thiết bị/dịch vụ và số lượng |
| Báo cáo | Bộ lọc, biểu đồ, số liệu theo loại kho, CSV |

Manager không tiếp nhận lại toàn bộ chín công việc Staff. Quyết toán cọc hiện **được khôi phục cho Manager** theo quyết định mới hơn của người dùng. API đọc vận hành phục vụ báo cáo không đồng nghĩa Manager được thực hiện mọi hành động của Staff.

### Admin — tài khoản và nhật ký

Gốc `/admin`: tổng quan, quản lý tài khoản, lịch sử đăng nhập và nhật ký hoạt động. Tạo tài khoản Staff/Manager; xem/lọc và quản lý ACTIVE/DISABLED; không tự vô hiệu hóa chính mình. Nhật ký lọc thời gian, vai trò, người thực hiện và kết quả.

Không có trình chỉnh quyền tùy ý, không tạo Admin qua đăng ký công khai, không vận hành kho/tài chính thay Staff/Manager. Một số route Admin cũ tồn tại để chuyển hướng tương thích, không phải quyền mới.

## 3. Các luồng nghiệp vụ

### 3.1. Xem kho và đặt thuê

1. Khách xem ảnh, tên/mã, kích thước, điều kiện kho và giá; có thể so sánh 2–3 loại.
2. Chọn ngày, thời hạn, số lượng, kho vật lý khi giao diện hỗ trợ lựa chọn và dịch vụ.
3. FE yêu cầu báo giá/lịch trống; **BE tính tiền và kiểm tra khả dụng**.
4. Khách đọc khoản đầu và chi phí cả kỳ, gửi yêu cầu.
5. Đủ điều kiện thì tự xác nhận, tạo phân bổ kho, hợp đồng và hóa đơn đầu. Hồ sơ chưa tự xác nhận được còn cần Staff xử lý.
6. Xác nhận khóa kho/kiểm tra toàn khoảng thuê trong transaction. PENDING chưa giữ kho vật lý.
7. Đơn xác nhận có hạn giữ thanh toán 24 giờ; BE xử lý hết hạn đủ điều kiện, giải phóng phân bổ và cập nhật hồ sơ liên quan.

Báo giá không phải hóa đơn đã thu; kiểm tra trống không phải cam kết giữ chỗ. Kho đang có người dùng thực tế không tự thành trống khi ngày dự kiến qua. Kho bảo trì không được coi là sẵn sàng.

### 3.2. Khách chưa có tài khoản

Có đặt vãng lai, email xác minh và nhận yêu cầu vào tài khoản. Người chưa có tài khoản đặt mật khẩu sau xác minh; người có tài khoản đăng nhập để nhận đúng email. Liên kết có hạn/token riêng; có gửi lại và khôi phục mật khẩu. Xác minh bản nháp không đồng nghĩa đã thu hoặc bàn giao. Token tài khoản/khôi phục lưu DB, khác OTP ký.

### 3.3. Hợp đồng, chữ ký và OTP

1. Đơn xác nhận tạo hợp đồng cho từng kho được phân bổ.
2. Khách mở PDF, đọc đúng phiên bản, đồng ý, nhập tên và vẽ chữ ký.
3. BE gửi mã tới email tài khoản; mã gắn với người ký, tài liệu, hash nội dung, tên và ảnh chữ ký.
4. Xác minh đúng thì lưu chữ ký, tên, thời điểm, bản nội dung và dấu vết xác thực.
5. Mọi hợp đồng trong đơn cần được xác nhận trước khi trả hóa đơn đầu.

OTP 6 số, 10 phút, chờ ít nhất 60 giây gửi lại, tối đa 5 lần nhập sai; có giới hạn phát hành. **Challenge OTP ký vẫn ở RAM**: restart BE có thể mất mã đang chờ, không mất chữ ký đã lưu hoặc toàn bộ phiên đăng nhập.

BE xuất PDF thật có nút xem/in/tải: hợp đồng, phụ lục gia hạn, biên bản chuyển đã hoàn tất và hóa đơn; ảnh chữ ký đã lưu được đưa vào tài liệu tương ứng. File dựng từ dữ liệu/snapshot khi yêu cầu, không phải mọi PDF đã có file cố định trên ổ đĩa.

Thiếu/chưa duyệt thông tin bên cho thuê thì PDF mang nhãn **DỰ THẢO**. Chữ ký vẽ + email OTP là xác nhận trong hệ thống; chưa tích hợp chữ ký số được chứng thực hoặc chứng minh mẫu đã được kiểm duyệt pháp lý. PDF hóa đơn không tự là hóa đơn điện tử thuế đã phát hành.

### 3.4. Thanh toán

- **Chuyển khoản QR:** cần ngân hàng nhận tiền; QR điền thông tin khoản chuyển. Khách gửi thông tin/chứng từ, Manager đối chiếu tiền thực nhận rồi xác nhận/từ chối.
- **VNPay qua trang thanh toán:** BE tạo giao dịch/URL có chữ ký; khách thanh toán ở cổng.
- **QR/đường mở VNPay:** vẫn thuộc giao dịch VNPay, không là một cơ chế tự xác nhận tiền độc lập.

BE kiểm tra ký trước khi tạo/ghi thu liên quan. VNPay kiểm chữ ký phản hồi, tiền, mã đơn và chống lặp; **trang quay về không tự là bằng chứng trả thành công**. Có IPN và hồ sơ đối soát trường hợp ngoại lệ.

Hóa đơn có tổng/đã thu/còn thu. Tham chiếu ngân hàng chống sử dụng trùng. Trả đủ hóa đơn đầu đưa hợp đồng sang sẵn sàng bàn giao theo quy tắc BE.

Endpoint thanh toán demo vẫn có trong source, nhưng cần cấu hình bật, giới hạn tài khoản và không hoạt động ở production. Không coi là thanh toán thật hoặc mặc định bật cho mọi người.

### 3.5. Nhận chìa khóa và bàn giao

1. Đã ký và trả đủ hóa đơn đầu mới đặt lịch nhận kho.
2. Lịch hợp lệ hiện tự xác nhận; xác nhận thủ công còn hỗ trợ hồ sơ REQUESTED.
3. Nhận chìa khóa sớm tối đa **3 ngày trước ngày thuê**, không hẹn từ ngày kết thúc trở đi.
4. Staff đối chiếu người nhận, kho, hiện trạng, chìa khóa và biên bản; không hoàn tất trước giờ hẹn.
5. Đã đến ngày bắt đầu thì kích hoạt hợp đồng, kho OCCUPIED. Nếu nhận chìa khóa sớm, BE kiểm tra định kỳ để kích hoạt đúng ngày khi vẫn đủ điều kiện.

Bàn giao kho không tự tạo lượng hàng gửi vào; hàng theo phiếu nhập/xuất riêng.

### 3.6. Nhập/xuất và vị trí hàng

1. Khách chọn hợp đồng đang hoạt động, có tên/mã kho/thời gian để phân biệt.
2. Nhập khai báo hàng mới khi cần; xuất chọn hàng còn tồn của đúng hợp đồng.
3. Khai số lượng, đơn vị chuẩn, lịch và ghi chú.
4. Có Staff phụ trách phù hợp thì tự giao; chưa có người thì Manager phân công.
5. Staff được giao kiểm đếm và hoàn tất. **Lúc hoàn tất mới tăng/giảm tồn**, không trừ khi mới gửi yêu cầu.

BE chặn xuất quá tồn, hoàn tất việc của người khác, sửa tồn khi hợp đồng kết thúc và kết quả cho dòng ngoài phiếu. API trả mã kho/tầng/khu cho hàng và phiếu, giúp biết hàng ở đâu. Sau chuyển kho, vị trí hiện tại theo phân bổ mới của hợp đồng.

Đơn vị hàng mới trên giao diện: Thùng, Kiện, Cái, Bộ, Túi, Bao, Cuộn, Đôi, Tấm, Pallet. Hàng cũ giữ đơn vị lịch sử. Đây là chuẩn hóa form, không phải database có enum bắt buộc cho mọi đơn vị.

**Vận chuyển:** khách tự tổ chức bốc xếp/vận chuyển/sắp đồ hoặc thuê đơn vị riêng. Staff đối chiếu kho, kiểm đếm/ghi nhận. Giá thuê xe đẩy/thiết bị không gồm xe vận tải và nhân công; chưa có module đội vận chuyển.

### 3.7. Gia hạn

1. Khách chọn đơn thuê tháng đang hoạt động, chưa có yêu cầu còn chờ; xem báo giá và phương án trả.
2. BE kiểm ngày kết thúc hiện tại và lịch tương lai. Đủ điều kiện thì tự duyệt/lập hóa đơn kích hoạt và phụ lục; còn PENDING do Staff xử lý.
3. APPROVED_PENDING_PAYMENT là **đã duyệt nhưng chưa gia hạn xong**.
4. Khách ký phụ lục bằng OTP, trả khoản kích hoạt.
5. Khi nhận thanh toán hợp lệ, BE cập nhật ngày hết hạn cho đơn/hợp đồng/phân bổ và hoàn tất. Không gia hạn một phần thiếu kho trong cùng đơn.
6. Các kỳ gia hạn trả từng tháng tiếp theo được phát hành khi tới hạn theo tác vụ BE.

Không thu lại cọc. Lưu ngày cũ/mới, tháng, giá/ưu đãi, phương án trả, người xử lý và phụ lục. Hợp đồng có lịch sử gia hạn.

### 3.8. Chuyển kho

Hiện chỉ **cùng StorageType**, giữ giá/loại hợp đồng; chưa phải nâng/hạ loại.

1. Khách gửi yêu cầu đúng đơn/hợp đồng/kho; bản đầu lưu dưới hồ sơ hỗ trợ.
2. Staff tiếp nhận ở hộp chuyển kho, tạo lệnh liên kết yêu cầu gốc.
3. Chọn đích cùng loại, tìm theo mã/vị trí và xem điều kiện không chọn được; kiểm tra toàn kỳ còn lại.
4. Duyệt khóa/kiểm tra lại nguồn–đích/hợp đồng để tránh dữ liệu cũ.
5. Staff xác nhận chuyển thực tế; BE giải phóng phân bổ cũ, cập nhật kho trên hợp đồng và trạng thái nguồn–đích, lưu người/thời điểm.
6. Đồng bộ yêu cầu gốc đã giải quyết; có gọi lại an toàn cho hồ sơ hoàn tất trước đây khi liên kết hợp lệ.
7. Nguồn đưa vào bảo trì có phiếu chống tạo trùng, không tự mở như kho sẵn sàng.
8. Hợp đồng có lịch sử và biên bản chuyển PDF.

Không đoán ghép yêu cầu cũ chỉ bằng văn bản khi thiếu liên kết. Ghi nhận chuyển bằng bản ghi/tài liệu riêng, không sửa chữ ký ban đầu để giả khách đã ký kho mới từ đầu.

### 3.9. Trả kho và trả trước hạn

Đúng hạn gửi yêu cầu khi đủ điều kiện. Trước hạn gửi **Đề nghị trả kho trước hạn**; Manager đối chiếu công nợ/cọc, ghi điều kiện và chấp thuận/từ chối trước khi Staff làm. Quyết định gắn đúng kỳ hiện tại; không tự tính phạt, hoàn tiền thuê còn lại hoặc xóa hóa đơn. Luồng trả sớm tái sử dụng `SupportRequest` với dữ liệu nhận diện/quyết định, không có bảng EarlyReturn riêng.

Staff kiểm từng kho PASS/ISSUE_FOUND rồi hoàn tất vật lý. BE chặn khi còn phiếu hàng chưa xong hoặc tồn lớn hơn 0; cần xuất hết và kiểm đếm trước.

Hoàn tất thì kết thúc hợp đồng, giải phóng phân bổ; kho đạt trở lại sẵn sàng, kho có vấn đề bảo trì. Lập quyết toán từ cọc lịch sử, không lấy cọc theo giá danh mục mới.

### 3.10. Quyết toán cọc

Manager xem cọc đã thu, vấn đề kiểm tra, phí được duyệt, khấu trừ, số hoàn và còn phải thu thêm. Ghi nhận hoàn tiền là bước riêng; duyệt số hoàn không đồng nghĩa đã trả cho khách. Kiểm tra đạt và không cọc có thể tự kết thúc; các trường hợp khác theo hồ sơ tài chính.

### 3.11. Hỗ trợ, bảo trì, phụ trách kho

Hỗ trợ: khách gửi → tự giao nếu xác định được người → Staff giải quyết hoặc chuyển Manager → phản hồi kết quả. Không dùng “đã hướng dẫn thanh toán” để giả hoàn tất chuyển kho thực tế.

Bảo trì: Staff tạo trên kho đủ điều kiện hoặc phiếu phát sinh từ chuyển/trả → thực hiện → chờ nghiệm thu → Manager xác nhận/làm lại → kho sẵn sàng theo điều kiện BE. Kho đang thuê có sự cố qua hỗ trợ/chuyển phù hợp, không mặc nhiên rút khỏi hợp đồng để bảo trì.

Một kho có một Staff phụ trách đang hiệu lực; một Staff có thể nhiều kho. Đổi người lưu kết thúc phân công cũ và tạo mới. Hỗ trợ, bảo trì và phiếu hàng đủ điều kiện tự giao theo quan hệ này. Khi phân kho, BE tìm cả việc chưa giao phù hợp, không ghi đè việc thủ công/lịch sử.

Phụ thuộc `UNIT_STAFF_ASSIGNMENTS_ENABLED` và migration. Không phải mọi danh sách Staff luôn chỉ riêng dữ liệu một kho; phạm vi đọc và hành động quy định từng nghiệp vụ.

## 4. Cách tính tiền

Nguồn tính là `BE/src/modules/pricing/pricing.service.ts`; FE trình bày lại, không tự quyết số tiền thu.

| Khoản | Công thức/quy tắc hiện tại |
| --- | --- |
| Thuê tháng | Giá kho/tháng × số kho × số tháng, trừ ưu đãi hợp lệ |
| Thuê ngày | Chỉ loại cho phép; giá tháng × ngày × số kho / 30, làm tròn VND theo BE |
| Trả từng tháng | Không giảm theo chính sách trả trước |
| Trả trước 3/6/12 tháng | Giảm lần lượt 5%/10%/15% tiền thuê; hiện viết trong code |
| Cọc tủ lưu trữ | 0 |
| Cọc kho nhỏ thuê ngày | Tiền thuê sau ưu đãi của kỳ ngắn theo BE |
| Cọc trường hợp còn lại | Một tháng giá tháng × số kho |
| Mua vật tư | Giá sản phẩm × số lượng, một lần |
| Thuê thiết bị ngày | Giá thiết bị/ngày × số thiết bị × số ngày |
| Thuê thiết bị tháng | Giá thiết bị/tháng lịch × số thiết bị × số tháng hợp lệ |

Khoảng nhiều tháng phải khớp tháng lịch; không tùy ý quy đổi mọi cặp ngày thành tháng thập phân. Thuê thiết bị nằm trong kỳ thuê; BE phân bổ phần dịch vụ vào kỳ tương ứng. Dịch vụ chưa có giá không tự coi miễn phí. Cọc thu một lần, không là tiền thuê tháng cuối.

**Tổng cả kỳ** = thuê sau ưu đãi + cọc + vật tư/thiết bị/dịch vụ.

**Khoản đầu** nếu trả từng tháng = thuê kỳ đầu + cọc + vật tư một lần + dịch vụ thuộc kỳ đầu. Trả trước/thuê ngắn hạn có khoản đầu theo toàn báo giá tương ứng.

**Các kỳ sau** là phần còn lại theo lịch, không thu cọc lại. Hóa đơn xác định số hiện được trả/còn nợ; báo giá trước đặt chỉ là dự kiến.

Ví dụ minh họa công thức, không là bảng giá mọi kho:

| Một kho 1.500.000 đ/tháng × 3 tháng, trả từng tháng, không dịch vụ | Tiền |
| --- | ---: |
| Thuê cả 3 tháng | 4.500.000 đ |
| Cọc một lần | 1.500.000 đ |
| Tổng cả kỳ gồm cọc | 6.000.000 đ |
| Đầu tiên: thuê tháng đầu + cọc | 3.000.000 đ |
| Tháng thứ hai | 1.500.000 đ |
| Tháng thứ ba | 1.500.000 đ |

Các số 1,5/3/6 triệu có thể cùng đúng, nhưng phải ghi tên khoản; không cộng tổng cả kỳ thêm vào khoản đầu. Tủ 650.000 đ/tháng × 3, không cọc: tổng 1.950.000 đ, đầu 650.000 đ, hai kỳ sau 1.300.000 đ. Code chưa có cấu phần tính thuế hoàn chỉnh; không tự thêm VAT khi dữ liệu không có.

## 5. Dữ liệu và lịch sử

Schema khai báo **35 model, 42 enum, 28 thư mục migration**; đây không phải xác nhận mọi database đã chạy đủ migration.

| Nhóm | Model |
| --- | --- |
| Tài khoản/nhật ký | `User`, `AuthSession`, `AccountFlowToken`, `AccountFlowLimit`, `AuditEvent` |
| Cơ sở/kho | `Facility`, `StorageType`, `StorageUnit`, `UnitStaffAssignment` |
| Dịch vụ | `AdditionalService`, `AdditionalServiceInventory` |
| Tiếp nhận/đặt | `ContactInquiry`, `GuestBookingRequest`, `GuestBookingService`, `Reservation`, `ReservationService`, `ReservationUnit` |
| Thuê/thay đổi | `RentalContract`, `RenewalRequest`, `TransferRequest`, `HandoverAppointment` |
| Hàng | `StoredItem`, `StockMovement`, `StockMovementLine` |
| Trả/bảo trì | `ReturnRequest`, `ReturnInspection`, `MaintenanceRequest` |
| Hỗ trợ | `SupportRequest` |
| Thu tiền | `Invoice`, `Payment`, `PaymentSubmission`, `OnlinePaymentTransaction`, `OnlinePaymentReconciliation` |
| Cọc | `DepositSettlement`, `DepositSettlementIssue` |

- StorageType là loại thương mại/kích thước/giá; StorageUnit là kho vật lý/mã/vị trí/trạng thái.
- Reservation là đơn loại–thời gian–số lượng; ReservationUnit là từng phân bổ; RentalContract thuộc từng phân bổ.
- Đơn nhiều kho có nhiều hợp đồng; ký/bàn giao/kết thúc cần kiểm đủ.
- Invoice là phải thu; Payment là đã ghi thu; PaymentSubmission chỉ là khách báo đã chuyển.
- Tiền hóa đơn/thu dùng BigInt ở DB, chuyển định dạng an toàn cho API.
- Snapshot giữ giá/điều khoản đã chốt; đổi danh mục không viết lại lịch sử.
- Có chữ ký/chấp thuận, lịch sử gia hạn/chuyển và tài liệu riêng.
- Vị trí hàng hiện tại theo hợp đồng. Phiếu StockMovement chưa có snapshot kho vật lý độc lập; xem kèm lịch sử chuyển để diễn giải vị trí quá khứ.

## 6. Giao diện web và mobile

### Web

Đã có danh mục/chi tiết, ảnh và ảnh thay thế, đặt theo bước, báo giá tách đầu/cả kỳ, so sánh kho, bốn khu vực, tìm kiếm/lọc/trạng thái, hộp hành động và PDF.

`/size-guide` hiện là **so sánh loại kho**, không yêu cầu thao tác mô hình 3D. Dependencies/mã 3D cũ còn không đồng nghĩa trang chính dùng chúng. Ảnh minh họa có nhãn; không gọi là ảnh thực tế riêng từng kho.

Ô chọn quan trọng thêm tên/mã kho, khách, thời gian/vị trí/số việc khi API có; có chọn tìm kiếm cho danh sách dài. Lựa chọn ngắn như trạng thái/ưu tiên/kỳ lọc vẫn có thể là select; không tuyên bố thay mọi select bằng một widget.

API client xử lý hết phiên/sai quyền/timeout/mất mạng, hủy request khi đổi phiên, kiểm token trước/sau để tránh dữ liệu tài khoản cũ cập nhật vào mới. Có cơ chế refresh tránh ghi đè biểu mẫu đang sửa.

### Mobile

Expo Router dưới `mobile/src/app` tách Customer/Staff/Manager/Admin; có đăng nhập/lưu phiên, menu đúng role, danh sách/chi tiết/hành động, thông báo, đặt thuê, hàng, ký/tài liệu và báo cáo. Staff có bàn việc cần xử lý và danh mục. Manager có bộ lọc/ba biểu đồ tròn SVG. Màn hình dài cuộn, thông tin kho/tiền/đơn vị tương ứng web.

Route cũ Admin settings/facility hay customer floor-plan có chuyển hướng tương thích. Web/mobile có helper tương ứng riêng, chưa đóng gói hết thành một thư viện duy nhất; sửa cách tính/trình bày phải đối chiếu cả hai.

### Đường dẫn web chính

| Khu vực | Route |
| --- | --- |
| Công khai | `/`, `/storage`, `/storage/:id`, `/size-guide`, `/booking`, `/booking/confirmation/:id`, `/claim-booking`, `/account/login`, `/account/register` |
| Customer | `/customer/reservations`, `rentals`, `booking-history`, `stored-items`, `stock-movements`, `contracts`, `payments`, `appointments`, `renewals`, `transfers`, `returns`, `support`, `notifications`, `profile` (cùng gốc `/customer/`) |
| Staff | `/staff/assigned-units`, `/staff/notifications`, chín nhóm vận hành và chi tiết dưới `/staff` |
| Manager | `/manager/assignments`, `reviews`, `finance`, `rental-records`, `facility`, `reports`, `catalog`, `units` (cùng gốc `/manager/`) |
| Admin | `/admin`, `/admin/users`, `/admin/login-history`, `/admin/activity` |

Logout web về `/account/login`; `/portal/login`, `/login` và một số route cũ tương thích. Staff dùng API `/staff/management/...` cho màn hình vận hành dùng chung; tên component `Manager...` không cấp quyền Manager.

## 7. Thông báo và công việc

Thông báo tạo từ dữ liệu nghiệp vụ role được đọc. Web kiểm tra định kỳ khoảng **15 giây** khi phù hợp, refresh khi quay lại/mạng trở lại và sau thay đổi; mobile cập nhật khi app hoạt động. Có làm mới và báo nguồn chưa tải được.

- **Chưa đọc:** cập nhật chưa mở trên thiết bị/trình duyệt đó.
- **Cần thực hiện:** hồ sơ còn bước thuộc trách nhiệm role.
- **Tất cả:** cả cập nhật/hồ sơ hoàn tất trong dữ liệu đã tải.
- Chưa đọc xếp cập nhật mới; việc cần xử lý giữ theo mức cần làm tương ứng.
- Thẻ nhóm/menu có số và link đúng hồ sơ; badge đếm hồ sơ, không mỗi lần refresh thêm một việc.
- Đọc thông báo không duyệt đơn, xác nhận tiền hoặc hoàn tất phiếu.
- Trạng thái đọc theo tài khoản trên thiết bị, chưa có hộp thư đọc/chưa đọc đồng bộ qua DB.

Chưa là WebSocket/SSE hoặc push nền Android/iOS. Đóng app chưa có cam kết nhận ngay thông báo; email OTP là kênh riêng.

## 8. Báo cáo và biểu đồ Manager

Web/mobile có lọc **ngày/tuần/tháng/năm**, toàn thời gian, khoảng tùy chọn và loại kho; tuần thứ Hai–Chủ nhật, ngày UTC+7. Có gom trục thời gian, so tiền thuê trên hóa đơn với tiền ghi nhận thu, bảng số lượt/đã xác nhận/số kho/tiền thuê, sắp xếp lượt/tiền/tên, xuất CSV hóa đơn theo bộ lọc.

CSV tách thuê/cọc/dịch vụ/phí/tổng/đã thu/còn thu, xử lý ký tự đặc biệt và giá trị có thể bị bảng tính đọc như công thức.

**Ba biểu đồ tròn:**

| Biểu đồ | Ý nghĩa |
| --- | --- |
| Tình trạng kho hiện tại | Sẵn sàng, đang dùng, bảo trì, khác; ảnh chụp hiện tại, không giả lịch sử khi lọc ngày |
| Lượt đặt theo loại | Một đơn gửi tính một lượt dù nhiều kho, không đồng nghĩa tất cả đã thuê thành công |
| Tiền thuê theo loại | Thuê trên hóa đơn phát hành trong khoảng chọn, sau ưu đãi; không cọc/dịch vụ/phí |

Có chú giải/giá trị/tỷ lệ, gộp nhóm nhỏ mà giữ tổng. Xử lý không dữ liệu/100% một nhóm/thiếu tiền riêng, không tự coi số thiếu là 0.

### Cách đọc số liệu

- Hóa đơn theo **ngày phát hành**, khoản thu theo **ngày nhận**, lượt đặt theo **ngày tạo**.
- VOID không cộng vào tổng hóa đơn đang phân tích.
- Đã thu cho hóa đơn trong kỳ khác tiền nhận trong kỳ (có thể thu hóa đơn kỳ trước).
- Còn thu/quá hạn theo trạng thái hiện tại, không là công nợ lịch sử tại ngày quá khứ.
- Cọc không cộng vào biểu đồ tiền thuê; tổng nhận có thể gồm cọc/dịch vụ.
- Chưa có sổ chi phí/khấu hao/thuế đầy đủ để tính lợi nhuận ròng.
- Biểu đồ lấy API, không dùng AI tạo số/kết luận. Tính chủ yếu ở client sau khi tải trang dữ liệu; quy mô lớn cần đánh giá API tổng hợp/hiệu năng.
- Báo cáo toàn dữ liệu nhóm theo bộ lọc, không mặc định RV10-only.

## 9. Tự động hóa

| Đã tự động | Điều kiện/giới hạn |
| --- | --- |
| Giá/ưu đãi/cọc/dịch vụ | Chính sách BE và có giá hợp lệ |
| Kiểm trống/xác nhận/cấp kho | Đủ toàn kỳ, hàng/thiết bị, không xung đột |
| Hợp đồng/hóa đơn đầu | Đơn xác nhận |
| Hết hạn giữ chưa trả | Tác vụ và điều kiện khoản đã trả/giao dịch đang xử lý |
| Lịch nhận hợp lệ | Ký, trả đủ và đúng cửa sổ |
| Kích hoạt sau nhận chìa khóa sớm | Tới ngày, hợp đồng/kho vẫn hợp lệ |
| Hóa đơn định kỳ | Kỳ thuê và phương án trả |
| Duyệt gia hạn hợp lệ | Không xung đột; vẫn ký/trả khoản kích hoạt |
| Giao hỗ trợ/bảo trì/phiếu hàng | Bật phụ trách kho, tìm được Staff hợp lệ |
| Tồn khi hoàn tất | Kiểm đếm/transaction/khóa tồn |
| Chuyển kho/yêu cầu gốc | Liên kết hợp lệ và hoàn tất |
| Phiếu bảo trì sau chuyển/trả | Điều kiện nghiệp vụ, chống trùng |
| Số việc/thông báo | Tải lại trong app, chưa push nền |
| Lập quyết toán | Dựa cọc/kiểm tra, hoàn tiền vẫn có bước người |

Vẫn cần người: kiểm đếm, bàn giao thực, đối chiếu ngân hàng thủ công, quyết định trả sớm/phí, nghiệm thu, đối soát ngoại lệ, xác nhận hoàn tiền. Không tự chứng nhận hoạt động vật lý/tiền thực chưa kiểm chứng.

## 10. Các phần BE

Có 26 thư mục module; hai là bộ khung, không phải 26 bộ nghiệp vụ độc lập hoàn chỉnh.

| Module | Nội dung |
| --- | --- |
| `auth` | Tài khoản, đăng nhập, phiên DB, hồ sơ, guard |
| `users` | Repository Prisma; bản memory phục vụ test |
| `audit` | Ghi/tra cứu nhật ký Admin |
| `booking` | Danh mục, trống, chọn/đặt, tư vấn, xác nhận/hết hạn |
| `guest-booking` | Vãng lai, email, nhận đơn, tạo/khôi phục tài khoản |
| `pricing` | Giá ngày/tháng, ưu đãi/cọc, phân kỳ dịch vụ |
| `storage` | Danh sách/chi tiết công khai |
| `additional-services` | Danh mục, khả dụng/tồn, giữ/hoàn/giao vật tư |
| `contracts` | Hợp đồng, ký, lịch sử gia hạn/chuyển |
| `signing` | OTP, bằng chứng gắn tài liệu |
| `documents` | PDF hợp đồng/phụ lục/chuyển/hóa đơn |
| `billing` | Hóa đơn, thu, chứng từ, VNPay, đối soát |
| `appointments` | Lịch, biên bản, kích hoạt đúng ngày |
| `rentals-active` | Kỳ thuê và hồ sơ liên quan |
| `stock-movements` | Tồn, phiếu, giao/kiểm đếm |
| `renewals` | Báo giá, duyệt, phụ lục, hóa đơn/kích hoạt |
| `transfers` | Cùng loại, chọn đích, duyệt/hoàn tất, đồng bộ |
| `returns` | Trả, kiểm tra, điều kiện sớm, kết thúc vật lý |
| `deposit-settlements` | Khấu trừ/hoàn cọc, ghi hoàn tiền |
| `support` | Yêu cầu, giao, giải quyết/chuyển cấp |
| `maintenance` | Bảo trì, thực hiện/nghiệm thu |
| `unit-staff` | Phụ trách, giao việc, tìm việc chưa giao |
| `manager` | Tổng quan, khách/kho, loại/giá/vật lý |
| `health` | Liveness và kết nối DB có timeout |
| `facilities` | Hiện rỗng, chưa CRUD cấu hình cơ sở đầy đủ |
| `rentals` | Hiện rỗng; API thuê ở `rentals-active` |

`app.controller.ts` mẫu có trong source nhưng không đăng ký ở AppModule; không tính “Hello” là tính năng. API hiện hành xem controller/Swagger, không lấy danh sách cũ làm chuẩn.

Manager có tạo/cập nhật loại, giá/ảnh, kho vật lý. Loại có lịch sử không tùy ý đổi cấu trúc; kiểm phiên bản khi lưu; sửa giá danh mục không viết lại hồ sơ cũ. Chưa có màn Admin cấu hình mọi tham số hệ thống.

## 11. Thay đổi local chưa commit

Các thay đổi working tree so với `c775ebf` tại lúc rà soát:

| Phần | Đã chỉnh |
| --- | --- |
| Báo giá web/mobile | Rõ khoản đầu/thuê/cọc/dịch vụ/kỳ sau, giữ thay đổi chưa push từ hôm trước |
| Thiết bị | Rõ sản phẩm mua một lần, thiết bị/ngày/tháng lịch; không gồm vận chuyển/nhân công |
| Hàng | BE thêm kho/tầng/khu, web/mobile hiển thị/tìm vị trí |
| Phiếu | Combo đơn vị chuẩn mới, thêm ngữ cảnh kho/hợp đồng, giữ đơn vị lịch sử |
| Bàn giao | Điền sẵn khách/người nhận phù hợp, vẫn đối chiếu thực tế |
| Lịch sử thuê | Khôi phục link hợp đồng |
| Báo cáo | Helper số liệu, ngày/tuần/tháng/năm/loại, trục thời gian, bảng/CSV |
| Biểu đồ | Ba tròn web/mobile, tỷ lệ/chú giải, rỗng/thiếu/gộp nhóm |
| Thông báo | Chưa đọc mới xếp đúng, giữ riêng việc cần làm |
| UI | Vùng giá/phiếu/báo cáo phù hợp màn hẹp |
| Demo | Script RV10 có plan/rollback/apply bổ sung, không reset nhóm |
| Test | Hai nhóm review mới, cập nhật bài theo merge, đủ 26 nhóm FE |
| Cấu hình local | Origin Expo web trong allowlist; không công khai khóa |
| Báo cáo này | Hợp nhất mô tả hiện tại, sửa mô tả phiên RAM đã cũ |

File chính: `BE/src/modules/stock-movements/stock-movements.service.ts`, `BE/scripts/prepare-review-demo.mjs`, `FE/src/components/booking/QuoteBreakdown.tsx`, `FE/src/pages/manager/ManagerAnalyticsPage.tsx`, `FE/src/components/manager/ReportCharts.tsx`, `ReportPie.tsx`, helper `reporting.ts`, `report-pie.ts`, `stock-units.ts` và tương ứng dưới `mobile/src`.

Không chạy migration/schema mới cho cải tiến 10/11. RV10 được nạp riêng theo yêu cầu trước, không tự phát sinh khi test/start. Các thay đổi này **chưa tự commit/push**; tính năng đã merge của thành viên khác được mô tả là trạng thái hiện tại, không nhận là thay đổi local mới.

## 12. Kiểm thử đã ghi nhận

Kết quả lượt hoàn thiện trước ngày 10/11:

| Kiểm tra | Kết quả/giới hạn |
| --- | --- |
| BE build/lint | Đạt |
| BE unit | 268 bài, 34 file được chọn: đạt |
| Cấu hình | 6 bài đạt; không chứng minh tích hợp ngoài chạy thật |
| FE build/lint | Đạt, còn cảnh báo dưới |
| FE smoke | 26 nhóm đạt sau cập nhật/rerun các nhóm có lỗi |
| Mobile typecheck/lint | Đạt |
| Android bundle export | Đạt, không là APK/điện thoại thật |
| UI review | 320/390/1440 px |
| API thật | Login bốn RV10, hàng/kho, báo cáo web/Expo; Staff gọi tài chính Manager 403 |
| CORS | Origin local web/Expo được, ngoài allowlist chặn |
| File tài khoản | Git bỏ qua, Vite 403 cả thường/`?raw`/`?import` |

26 nhóm FE: workflows, portal, roles, workspaces, booking, automatic, catalog, usability, early-return, history-maintenance, manager-review, completion, role-navigation, notifications, pricing, stock-picker, inventory, admin-audit, customer-resilience, session-resilience, mobile-resilience, runtime-boundaries, priority-notifications, review-business, review-ui, guest-onboarding.

Phạm vi gồm quyền/route, ký/thanh toán, giá, chuyển/trả/bảo trì, thông báo mới và việc cần làm, chọn kho/hàng, thiếu dữ liệu, mất mạng, đổi phiên/tài khoản, biểu đồ/bộ lọc/CSV. Nhiều bài UI dùng fixture API để không ghi nghiệp vụ vào DB nhóm. Login thật vẫn tạo phiên/nhật ký bình thường.

Còn ba cảnh báo Fast Refresh layout và một regex; build web cảnh báo chunk trên 500 KB. Không gọi là hết cảnh báo. Không gửi email hoặc tiền thật trong lượt test; chưa nghiệm thu Android/iOS thật, mọi màn hình/tình huống hoặc tải lớn. Log lượt sớm có lỗi trước khi sửa không là một lần full-run sạch từ đầu.

Lượt viết báo cáo chỉ đối chiếu source và tài liệu, không lặp lại các bài trên.

## 13. Dữ liệu demo RV10

Đã nạp DB nhóm theo cho phép trước, namespace `nestbox-review-20261110`, mã/tên **RV10**, ghi rõ mô phỏng; không xóa dữ liệu sẵn có.

- Tài khoản: `review.rv10.admin@nestbox.test`, `review.rv10.manager@nestbox.test`, `review.rv10.staff@nestbox.test`, `review.rv10.customer@nestbox.test`.
- Mật khẩu ngẫu nhiên ở file riêng bị Git bỏ qua `FE/artifacts/review-20261110/accounts.local.json`; không đưa vào README/commit. Chuyển máy cần quản lý file riêng ngoài Git.
- Đang dùng `RV10-SM-01`, `RV10-SM-02`, `RV10-MD-03`; trống `RV10-SM-04`; bảo trì `RV10-MD-05`.
- Ba đơn `RV10-DAT-01..03`, hợp đồng `RV10-HD-01..03`, thuê ba tháng/trả từng tháng; năm kho có Staff phụ trách.
- Tồn ban đầu: 12 thùng hồ sơ SM-01, 8 thùng sách SM-02, 2 tủ (Cái) MD-03.
- `RV10-XUAT-01` giao Staff xuất 2 thùng SM-01; trước hoàn tất vẫn 12, hoàn tất đúng còn 10.
- `RV10-HOTRO-01`, `RV10-BAOTRI-01` để diễn hỗ trợ/bảo trì.
- Chín hóa đơn mô phỏng: thuê 17.700.000 đ, cọc 5.900.000 đ, tổng 23.600.000 đ; thu mô phỏng 11.800.000 đ, sáu kỳ sau còn 11.800.000 đ. Không tiền thật.

Đó là trạng thái sau chuẩn bị, có thể đổi khi đã demo. Tổng báo cáo còn dữ liệu nhóm khác, không so thẳng tổng RV10. Hợp đồng RV10 là lịch sử mô phỏng, không tạo bằng chứng OTP/chữ ký thật giả. Email `.test` không nhận thư; demo ký mới cần email thật/cấu hình.

`BE/scripts/prepare-review-demo.mjs`: mặc định plan; `--verify` transaction rollback; `--apply` mới nạp bổ sung. Không tự chạy theo server/test, chặn production, không reset mật khẩu/xóa dữ liệu, dừng khi bộ dữ liệu không nhất quán. Không chạy seed cũ để lấy mật khẩu vì có thể đổi tài khoản nhóm.

Thứ tự diễn nhanh: Customer xem tồn/phiếu → Staff hoàn tất xuất → Customer refresh thấy giảm → Staff hỗ trợ/bảo trì → Manager nghiệm thu/tài chính/biểu đồ → Admin tài khoản/nhật ký. Đặt mới/gia hạn/chuyển/trả theo điều kiện mục 3.

## 14. Cấu hình và chạy dự án

Dùng `.env.example` từng phần, không chép bí mật vào source/tài liệu.

| Nhóm | Biến |
| --- | --- |
| Database | `DATABASE_URL`, `DIRECT_URL` |
| API/web | `PORT`, `FRONTEND_URL`, `FRONTEND_PUBLIC_URL`, FE `VITE_API_URL` |
| Mobile | `EXPO_PUBLIC_API_URL` truy cập được từ thiết bị |
| Vãng lai | `INQUIRY_LOOKUP_SECRET` và email |
| SMTP | `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` |
| Resend | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, người gửi hợp lệ |
| Ngân hàng | `WDP_BANK_NAME`, `WDP_BANK_CODE`, `WDP_BANK_ACCOUNT_NUMBER`, `WDP_BANK_ACCOUNT_NAME` |
| VNPay | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL`, chính sách sandbox |
| Bên cho thuê | `CONTRACT_LEGAL_NAME`, `CONTRACT_TAX_CODE`, `CONTRACT_ADDRESS`, `CONTRACT_REPRESENTATIVE`, `CONTRACT_TERMS_VERSION`, `CONTRACT_TERMS_APPROVED` |
| Phụ trách kho | `UNIT_STAFF_ASSIGNMENTS_ENABLED`, DB có migration phù hợp |
| Demo | `DEMO_PAYMENT_ENABLED` mặc định false, không production |

Cấu hình mẫu không chứng minh máy có cấu hình thật hợp lệ. Origin `FRONTEND_URL` ngăn bằng dấu phẩy, local thường cần localhost/127.0.0.1 ở 5173/8081. Điện thoại dùng IP LAN máy BE; localhost trên điện thoại là chính điện thoại.

Mỗi khối ở terminal riêng, từ thư mục project:

```powershell
cd BE
npm ci
npm run prisma:generate
npm run start:dev
```

```powershell
cd FE
npm ci
npm run dev -- --host 127.0.0.1
```

```powershell
cd mobile
npm ci
npm run web -- --host lan --port 8081
```

Dependencies đã đúng lockfile có thể bỏ cài lại. Generate Client không áp migration. **Không reset/seed/migrate DB nhóm như bước mỗi lần khởi động.** Khi cần migration, kiểm DB đích/pending trước.

Mặc định: web `http://127.0.0.1:5173`; Expo `http://localhost:8081`; API `http://127.0.0.1:3000/api`; Swagger `http://127.0.0.1:3000/api/docs`.

`GET /api/health` kiểm API phản hồi; `/api/health/ready` kiểm DB có timeout, không kiểm gửi email/ngân hàng/VNPay. Báo cáo không khẳng định server còn chạy dựa kết quả lượt trước.

Các lệnh kiểm mã:

```powershell
# Trong BE
npm run build
npm run lint
npm run test:unit
npm run test:production-config
```

```powershell
# Trong FE
npm run build
npm run lint
npm test
```

```powershell
# Trong mobile
npm run typecheck
npm run lint
```

Không tự chạy mọi test/seed/backfill BE trên DB nhóm; bài tích hợp có thể ghi dữ liệu, cần đọc cấu hình và dùng DB test phù hợp. `check:production` là kiểm cấu hình, không chứng nhận đã vận hành thực tế.

## 15. Giới hạn cần biết

| Nội dung | Tình trạng |
| --- | --- |
| Email | Có kết nối, cần cấu hình/kiểm gửi nhận thật; không bỏ qua ký |
| Ngân hàng/VNPay | Có code, cần merchant/tài khoản/callback và test end-to-end thật |
| Hợp đồng | Có PDF/snapshot/chữ ký; thiếu/chưa duyệt pháp nhân/điều khoản thì dự thảo |
| Thuế/chữ ký số | Chưa tích hợp nhà cung cấp hóa đơn thuế/chữ ký số chứng thực |
| Đổi khác loại | Chưa đổi giá/chênh lệch/loại hợp đồng; hiện chỉ cùng loại |
| Trả sớm | Có đề nghị/duyệt, chưa công thức hoàn/phạt tự động đầy đủ |
| Cấu hình Admin | Chưa bộ thông số tùy ý; env và chính sách code |
| Thông báo | Polling, read theo thiết bị, chưa push/đồng bộ DB |
| Nhiều BE instance | OTP và một số limit RAM cần kho chung/cách triển khai phù hợp; phiên đã DB |
| Hàng quá khứ | Có tồn/vị trí hiện tại; chưa snapshot vị trí độc lập mọi phiếu |
| Vận chuyển | Có trách nhiệm rõ, chưa đội xe/nhân công/phí vận tải riêng |
| Tài chính | Thuê/thu/cọc/nợ/biểu đồ, chưa chi phí/lợi nhuận/kế toán đầy đủ |
| Demo cũ | Còn script/dữ liệu nhiều người; không xóa đại trà DB, RV10 gắn nhãn |
| Native | Expo web/check/bundle đã kiểm, còn điện thoại thật |
| Vận hành | Cần thử tải, backup/restore, HTTPS, giám sát, bí mật và nghiệm thu tích hợp |
| Chất lượng | Test đạt đã nêu không bảo đảm không còn lỗi mọi tình huống |

## 16. Bản đồ mã nguồn

| Nội dung | Vị trí |
| --- | --- |
| Khởi động/module | `BE/src/main.ts`, `BE/src/app.module.ts` |
| DB | `BE/prisma/schema.prisma`, `BE/prisma/migrations/` |
| Auth/quyền | `BE/src/modules/auth/`, `users/` |
| Đặt/cấp kho | `BE/src/modules/booking/booking.service.ts` |
| Giá | `BE/src/modules/pricing/pricing.service.ts` |
| Thiết bị | `BE/src/modules/additional-services/` |
| Ký/PDF | `BE/src/modules/contracts/`, `signing/`, `documents/` |
| Thu/VNPay | `BE/src/modules/billing/` |
| Bàn giao | `BE/src/modules/appointments/appointments.service.ts` |
| Hàng | `BE/src/modules/stock-movements/stock-movements.service.ts` |
| Thay đổi thuê | `BE/src/modules/renewals/`, `transfers/`, `returns/`, `deposit-settlements/` |
| Giao việc/bảo trì | `BE/src/modules/unit-staff/`, `support/`, `maintenance/` |
| Danh mục/nhật ký | `BE/src/modules/manager/`, `audit/` |
| Router web | `FE/src/app/router.tsx` |
| API/phiên web | `FE/src/services/api.ts`, `FE/src/auth/` |
| Quyền UI | `FE/src/utils/operation-access.ts`, `manager-review-access.ts`, `portal-routing.ts` |
| Đặt/giá web | `FE/src/pages/public/BookingWizardPage.tsx`, `FE/src/components/booking/` |
| So sánh | `FE/src/pages/public/SizeGuideExperiencePage.tsx` |
| Bốn khu web | `FE/src/pages/customer/`, `staff/`, `manager/`, `admin/` |
| Thông báo | `FE/src/activity/`, `FE/src/utils/activity.ts`, `notification-tools.ts` |
| Hàng web | `FE/src/pages/stock/`, `FE/src/utils/stock.ts`, `stock-units.ts` |
| Báo cáo web | `FE/src/pages/manager/ManagerAnalyticsPage.tsx`, `FE/src/components/manager/ReportCharts.tsx`, `ReportPie.tsx`, `FE/src/utils/reporting.ts`, `report-pie.ts` |
| UI chung | `FE/src/styles/`, `FE/src/components/` |
| Route mobile | `mobile/src/app/` |
| API/phiên mobile | `mobile/src/services/api.ts`, `mobile/src/auth/` |
| Màn mobile | `mobile/src/operations/`, `portals/`, `stock/` |
| Thông báo/biểu đồ mobile | `mobile/src/activity/`, `mobile/src/operations/reports.tsx`, `mobile/src/components/report-pie.tsx` |
| Test | `BE/src/**/*.spec.ts`, `BE/test/`, `FE/scripts/`, `BE/scripts/production-readiness.test.mjs` |

Danh mục văn bản lập trước khi viết lại README: **671 tệp, khoảng 55.664 dòng** được chọn — BE 236/20.769 dòng; FE 222/25.627; mobile 207/7.709; tài liệu 5/1.519; script gốc 1/40. Có source/test/config/migration được chọn, không toàn asset/mã sinh; không là tỷ lệ hoàn thiện. Có 62 tệp liên quan test ở BE, 31 FE; tệp tồn tại khác số bài đã chạy.

Đối chiếu mã hiện hành khi tài liệu cũ mâu thuẫn. Đặc biệt, không tiếp tục dùng nhận định cũ rằng phiên đăng nhập chỉ ở RAM; phần còn lưu tạm liên quan ký là challenge OTP.
