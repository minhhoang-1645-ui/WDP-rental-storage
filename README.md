> Cập nhật 04/11/2026: bản hiện tại gồm đầy đủ các khu vực Customer, Staff, Manager và Admin, quản lý kho/giá và nhật ký Admin. Xem cấu hình ký OTP, PDF và nhận tiền ở dưới; các báo cáo có ngày cũ trong docs phản ánh source tại thời điểm lập.

# NestBox Storage



Single-facility self-storage rental platform.

## Project structure

- FE/: React, TypeScript, Vite, Tailwind CSS, React Router, Lucide React and React Three Fiber.
- BE/: NestJS, TypeScript, Prisma and Supabase PostgreSQL.
- mobile/: React Native, Expo and Expo Router; shares the BE authentication and APIs.
- BE/prisma/migrations/20261003000100_init_persistence/: initial WDP application migration.

Web và mobile dùng chung API, có danh mục/so sánh kho, đặt thuê, hợp đồng và phụ lục PDF, chữ ký vẽ + email OTP, thanh toán, bàn giao, nhập/xuất hàng, gia hạn, chuyển/trả kho, bảo trì, hỗ trợ và thông báo theo vai trò.

## Environment

Create BE/.env from BE/.env.example and provide:

- DATABASE_URL: runtime transaction-pooler connection.
- DIRECT_URL: direct/session connection used by Prisma migrations.
- INQUIRY_LOOKUP_SECRET: at least 32 random characters.
- SEED_MANAGER_*: development-only Manager seed values.

Never commit .env. Prices that have not been approved remain null; the seed does not create invented prices.

## Chuẩn bị Prisma Client

~~~bash
cd BE
npm ci
npm run prisma:generate
~~~

Không chạy seed/reset/migration trên database nhóm như một bước khởi động. Cấu hình DATABASE_URL theo file .env.example. Nếu cần triển khai migration, người phụ trách phải kiểm tra database đích và toàn bộ migration pending trước; seed là công cụ tạo dữ liệu phát triển.

## Start

Backend:

~~~bash
cd BE
npm run start:dev
~~~

The API runs at http://127.0.0.1:3000/api. Health check: GET /api/health.

Frontend:

~~~bash
cd FE
npm ci
npm run dev -- --host 127.0.0.1
~~~

Open http://127.0.0.1:5173.

## Đường dẫn web và mobile

- Web: `/` xem/chọn kho, `/booking` đặt thuê, `/account/login` đăng nhập. Đăng xuất trở về `/account/login`; không có đăng ký công khai tài khoản nội bộ.
- `/customer`: đơn thuê, thanh toán, hợp đồng, lịch hẹn, hàng hóa và các yêu cầu của khách đăng nhập.
- `/staff`: tiếp nhận và xử lý công việc vận hành.
- `/manager`: quản lý cơ sở, tài chính và phân công theo kho.
- `/admin`: tài khoản, lịch sử đăng nhập và nhật ký hệ thống.
- Mobile: `cd mobile`, `npm ci`, `npm run web -- --host lan --port 8081`. Expo Router dùng khu vực tương ứng của từng vai trò. Trên điện thoại, kết nối cùng mạng với máy chủ và dùng địa chỉ LAN của BE.

## API

Catalog and booking:

- GET /api/booking/catalog
- POST /api/booking/availability
- GET /api/storage
- GET /api/storage/:id
- POST /api/inquiries
- GET /api/inquiries/:id with the private X-Inquiry-Access-Token
- POST /api/reservations with Customer authentication
- GET /api/reservations
- GET /api/reservations/:id

Manager:

- GET /api/manager/inquiries
- GET /api/manager/inquiries/:id
- PATCH /api/manager/inquiries/:id

Quyền được kiểm tra ở BE theo từng endpoint và nghiệp vụ; tên tiền tố `/manager` không đồng nghĩa mọi thao tác dành cho Manager/Admin. Staff dùng các đường dẫn vận hành được cấp quyền; tài chính và phân công thuộc Manager, quản lý tài khoản thuộc Admin. Customer chỉ đọc hồ sơ của mình. Guest Inquiry cần lookup token được trả khi gửi. Danh sách API hiện tại ở `/api/docs`.

## Persistence and availability

- Users, catalog, physical units, Inquiries and Reservations persist in PostgreSQL.
- Public registration always creates CUSTOMER; request bodies cannot elevate roles.
- Passwords use salted scrypt hashes and are never returned.
- Bearer sessions remain intentionally in process memory and expire after eight hours. A backend restart signs users out, but their accounts persist and can log in again.
- Availability checks the complete requested interval and quantity.
- MAINTENANCE, RESERVED and physically OCCUPIED units are unavailable.
- An OCCUPIED unit is never released because a planned end date passed.
- Only confirmed Reservation allocations block future intervals. PENDING does not assign or hold a physical unit.
- Final Inquiry and Reservation submission revalidates availability in a database transaction. It does not create a temporary hold.
- Deterministic idempotency keys prevent repeated identical submissions from creating duplicate records.

## Verification

~~~bash
cd BE
npm run lint
npm run build
npm run test:unit

cd ../FE
npm run lint
npm run build
~~~

`npm run test:unit` không cần ghi dữ liệu lên database nhóm. `npm run test:flows` dùng database PostgreSQL tạm riêng như mô tả dưới đây. Không chạy toàn bộ integration test cũ bằng `npm test` trên database nhóm khi chưa kiểm tra cấu hình đích.

## Phạm vi hiện tại theo vai trò

- Customer: chọn/đặt kho; ký hợp đồng và phụ lục; hóa đơn/thanh toán; hẹn nhận kho; hàng đang lưu và nhập/xuất; lịch sử thuê; yêu cầu gia hạn/chuyển/trả kho/hỗ trợ và thông báo.
- Staff: tiếp nhận và xử lý các yêu cầu vận hành, bàn giao, nhập/xuất, chuyển/trả kho, gia hạn, hỗ trợ và bảo trì theo quyền API và phân công.
- Manager: báo cáo/hồ sơ đối chiếu; phân công theo kho; quản lý loại kho, kho vật lý, giá và dịch vụ; xác minh thu tiền, đối soát, quyết toán cọc, xử lý chuyển cấp và nghiệm thu.
- Admin: tổng quan, tài khoản/vai trò/trạng thái, lịch sử đăng nhập và nhật ký hoạt động theo bản merge mới.

Các khu vực dùng /customer, /staff, /manager và /admin; BE kiểm tra quyền độc lập với giao diện. Một đơn thuê có 1–3 kho vật lý thuộc cùng một loại; thuê nhiều loại cần các đơn riêng.

UNIT_STAFF_ASSIGNMENTS_ENABLED=true bật chức năng một kho – một Staff sau khi bảng quan hệ đã có. Manager phân công người cụ thể; yêu cầu mới/backlog chưa giao được tự gán khi có một người phụ trách phù hợp. Việc đã giao/đang xử lý không tự đổi người. Yêu cầu nhiều kho có người phụ trách khác nhau cần Manager phân công.

## Ký email OTP, file PDF và cấu hình chuyển khoản (30/10/2026)

Phần này bổ sung luồng ký và chứng từ; không thay schema, không chạy migration hay sửa dữ liệu trên database nhóm.

### Chuẩn bị máy chạy

1. Dùng Node theo yêu cầu engine của Nest/Expo; cài dependency bằng `npm ci` trong `BE`, `FE`, `mobile` sau khi nhận code và lockfile mới. Chạy `npm run prisma:generate` trong BE nếu chưa sinh Prisma Client (không chạy seed/reset/migrate lên database nhóm).
2. Điền cấu hình riêng vào `BE/.env`, dựa trên `BE/.env.example`. Không commit `.env` hay khóa bí mật. FE dùng `VITE_API_URL`; mobile dùng `EXPO_PUBLIC_API_URL`. Điện thoại thật phải dùng IP LAN của máy chạy BE, không dùng `localhost`.
3. Chạy BE `npm run start:dev`, web `npm run dev`, mobile `npx expo start`. Sau khi cập nhật dependency native, tạo lại development build nếu app hiện tại thiếu `expo-file-system`/`expo-sharing`.

### Email xác thực chữ ký

- Chọn `EMAIL_PROVIDER=smtp`, điền đủ `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `FRONTEND_URL`. Cổng 465 thường dùng `SMTP_SECURE=true`; cổng 587 dùng STARTTLS (`false`). Dùng thông tin do nhà cung cấp email cấp, không dùng mật khẩu tài khoản thông thường khi nhà cung cấp yêu cầu app password.
- Hoặc dùng `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, địa chỉ gửi đã xác minh ở `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `FRONTEND_URL`. Chỉ dùng một nhà cung cấp mỗi môi trường.
- `npm run email:verify-smtp` kiểm tra kết nối SMTP; không tự gửi email cho khách. Việc gửi thử thật phải được nhóm chủ động thực hiện với người nhận của mình.
- Luồng: mở PDF → đồng ý nội dung → vẽ chữ ký → gửi mã đến email của tài khoản đăng nhập → nhập 6 số → lưu chữ ký. Cùng luồng áp dụng cho phụ lục gia hạn. Hóa đơn chỉ được thanh toán khi tài liệu cần thiết đã được ký.
- Mã hiệu lực 10 phút, tối đa 5 lần thử, gửi lại sau 60 giây, tối đa 10 lượt gửi/tài khoản/giờ. Mã gắn với đúng khách, tài liệu, nội dung, tên ký và ảnh chữ ký; không trả mã trong API hay ghi mã vào log. `EMAIL_PROVIDER=development` không thay thế email OTP.
- **Chưa có cấu hình email thì không ký mới được.** Không có mã mặc định hay nút bỏ qua OTP. Hồ sơ đã ký trước đây vẫn đọc được và được ghi rõ không có bằng chứng OTP.
- Mã đang chờ được giữ trong bộ nhớ một tiến trình BE; khởi động lại làm mã hết hiệu lực và khách phải gửi lại. Khi triển khai nhiều tiến trình/replica cần bổ sung kho challenge dùng chung (ví dụ Redis) trước khi mở rộng; phiên bản này dành cho một tiến trình. Bằng chứng xác thực đã thành công được lưu cùng snapshot trong database hiện có.

### Thông tin bên cho thuê và PDF

- Điền **thông tin pháp nhân thật**: `CONTRACT_LEGAL_NAME`, `CONTRACT_TAX_CODE`, `CONTRACT_ADDRESS`, `CONTRACT_REPRESENTATIVE`. Kiểm tra các điều khoản mẫu trong `BE/src/modules/documents/document-policy.ts`; chỉ sau khi bên cho thuê đã duyệt mới đặt `CONTRACT_TERMS_APPROVED=true` và chốt `CONTRACT_TERMS_VERSION`.
- Khi thiếu thông tin hoặc chưa duyệt, hợp đồng/phụ lục được đánh dấu **DỰ THẢO - CHƯA PHÁT HÀNH CHÍNH THỨC**. Không có pháp nhân hay mã số thuế giả. Tên thương hiệu mẫu là NestBox Storage.
- Thông tin/điều khoản và giá chốt vào nội dung ký; thay cấu hình sau đó không biến tài liệu dự thảo đã ký thành bản chính thức. Hồ sơ cũ giữ nguyên nội dung cũ, không tự thêm điều khoản mới hoặc chứng nhận OTP hồi tố.
- Web: nút **Xem / in PDF** mở file trong trình đọc PDF (dùng biểu tượng in hoặc Ctrl+P); **Tải PDF** lưu file. Mobile: **Mở / lưu / in PDF** dùng ứng dụng PDF/chia sẻ của thiết bị. File tải qua bearer token; không nhúng token trong URL công khai.
- Customer chỉ tải tài liệu của mình. Manager xem hồ sơ phục vụ đối chiếu/tài chính. Staff chỉ đọc hợp đồng/phụ lục cần cho vận hành; không thêm quyền thu tiền hay quyết toán. Admin có Tổng quan, Tài khoản, Lịch sử đăng nhập và Nhật ký hoạt động theo bản merge mới.
- PDF hợp đồng/phụ lục có chữ ký đã lưu, tên, thời điểm, thông tin OTP nếu có và mã kiểm tra nội dung. PDF hóa đơn có chi tiết tiền thuê/cọc/dịch vụ/phí, đã thu/còn nợ, lịch sử thu và ảnh chữ ký sao chiếu từ hợp đồng/phụ lục liên quan. Chữ ký sao chiếu không phải lần ký hóa đơn mới.
- Chữ ký vẽ + email OTP là bằng chứng xác nhận trong hệ thống, không tự trở thành chữ ký số được chứng thực hoặc bảo đảm mọi yêu cầu pháp lý. Chứng từ nội bộ không thay hóa đơn điện tử thuế. Nhóm cần thẩm định mẫu và thông tin phát hành trước khi dùng chính thức.

### Chuyển khoản / QR

- Điền đủ `WDP_BANK_NAME`, `WDP_BANK_CODE` (BIN ngân hàng 6 số), `WDP_BANK_ACCOUNT_NUMBER` (1–19 ký tự chữ/số), `WDP_BANK_ACCOUNT_NAME`; thông tin phải khớp tài khoản nhận thật. API chỉ trả thông tin công khai cần để chuyển tiền.
- QR được tạo ngay trong app, đúng số tiền còn nợ hoặc khoản khách chọn không vượt số dư, kèm mã hóa đơn. Khách kiểm tra người nhận/số tiền trong app ngân hàng trước khi chuyển.
- Sau khi chuyển thực tế, bấm **Tôi đã chuyển khoản**, nhập mã giao dịch nếu có và gửi thông báo. Hóa đơn vẫn chờ đối chiếu; Manager kiểm tra tiền thực nhận rồi xác nhận hoặc từ chối. Bấm QR/gửi thông báo không tự đánh dấu đã thanh toán. Yêu cầu có khóa chống gửi trùng và chặn thu vượt số dư.
- Tự xác nhận qua VNPay chỉ hoạt động khi cấu hình đủ `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL` và IPN công khai `/api/payments/vnpay/ipn` tại nhà cung cấp. Trang quay về của trình duyệt không phải bằng chứng đã thu tiền. Chưa cấu hình thì giữ kênh tắt, không giả lập giao dịch thật.

### Kiểm tra lại trước review

1. Dùng customer của nhóm đặt kho → Staff xác nhận → Customer mở PDF, ký và xác thực email → xem số phải trả của hóa đơn → chuyển khoản và gửi thông báo → Manager đối chiếu → Customer thấy cập nhật và đặt lịch bàn giao → Staff ghi biên bản bàn giao.
2. Gia hạn: yêu cầu → chấp thuận → xem/ký phụ lục + OTP → thanh toán hóa đơn kích hoạt → kiểm tra hạn thuê mới. PDF hóa đơn gia hạn có chữ ký phụ lục liên quan.
3. Đổi lựa chọn hợp đồng/kho khi tạo hỗ trợ, chuyển kho, nhập/xuất; kiểm tra mã kho và kỳ thuê đã chọn, không còn giữ hóa đơn/kho của hồ sơ trước. Tìm không dấu được trong danh sách dài; dùng bàn phím hoặc chạm lựa chọn.
4. Kiểm thử tự động BE: `npm run test:unit`. Luồng đầy đủ `npm run test:flows` chỉ dùng database PostgreSQL dùng một lần ở `127.0.0.1:55439`; email và cổng thanh toán được chặn bằng mock. Script xóa database thử và dừng server thử khi xong; không chạy trên Supabase của nhóm.
5. Web: `npm run build`, `npm test` (cần máy chủ web/mobile và helper chỉ đọc theo các script). Mobile: `npm run typecheck`, `npm run lint`, export Android. Các fixture chỉ nằm trong bộ nhớ kiểm thử, không phải tài khoản/hóa đơn mẫu đưa vào hệ thống thật.

Kết quả kiểm chứng cho bản cập nhật này: BE build/lint và 120 kiểm thử đơn vị đạt; luồng API bốn vai trò với OTP/PDF/chuyển khoản/bàn giao/gia hạn/chuyển kho/bảo trì/trả sớm/quyết toán chạy đạt trên PostgreSQL tạm rồi xóa database thử. Web build/lint đạt; các bộ kiểm tra vai trò, phân công, hành trình thuê, thông báo, báo giá, lựa chọn kho, ký OTP và tải PDF chạy bằng API chặn trong trình duyệt, không thêm dữ liệu demo vào database nhóm. Mobile typecheck/lint và export Android đạt; các màn hình được kiểm tra thêm trên Expo web. Chưa kiểm thử gửi email/chuyển tiền thật vì chưa có cấu hình, và chưa chạy thực tế trên điện thoại Android/iOS trong lượt này. Bản chạy local hiện dùng BE đã build (`node dist/main.js`); sau khi sửa BE cần build và khởi động lại, hoặc dùng `npm run start:dev` khi phát triển.

### Chuyển kho và hồ sơ hợp đồng (31/10/2026)

- Chuyển giữa các kho vật lý cùng loại; không đổi giá, cọc hoặc thời hạn. Danh sách kho đích kiểm tra toàn bộ kỳ thuê còn lại, loại kho nguồn, cho tìm không dấu theo mã/tên/tầng/khu vực và xem lý do kho chưa thể chọn. BE vẫn kiểm tra lại và giữ kho trong giao dịch khi duyệt.
- Sau khi chuyển thực tế, Staff hoàn tất lệnh: hợp đồng trỏ sang kho mới; lịch sử kho cũ, kho mới, thời điểm và người xác nhận được giữ trong TransferRequest hiện có. Yêu cầu của khách được đồng bộ và kho cũ có phiếu bảo trì.
- Trong hồ sơ hợp đồng của Customer/Staff/Manager có lịch sử chuyển và PDF biên bản đính kèm cho từng lệnh đã hoàn tất. Nội dung, chữ ký và mã kiểm tra của hợp đồng gốc không bị sửa. Biên bản là trích xuất ghi nhận vận hành, không giả định khách đã ký thêm một văn bản mới. Customer chỉ xuất biên bản của hợp đồng của mình. Không đổi schema hoặc chạy migration/backfill.

- Hồ sơ hợp đồng cũng tổng hợp các lần gia hạn: hạn cũ/mới, số tháng, báo giá đã chốt, người yêu cầu/duyệt, ngày ký phụ lục, hóa đơn và trạng thái thanh toán/kích hoạt. Mỗi phụ lục mở lại đúng file của lần gia hạn đó; không ghi đè bản hợp đồng hoặc phụ lục đã ký trước.

## Rà soát bản merge ngày 04/11/2026

- Giữ các chức năng mới của bản merge: quản lý kho/giá/dịch vụ ở Manager; lịch sử đăng nhập và nhật ký ở Admin. Sửa mô tả điều hướng cho đúng quyền từng vai trò trên web/mobile.
- Thanh toán web dùng lại hộp chi tiết hóa đơn và số dư còn phải trả; lọc đúng đơn thuê/hóa đơn khi đi từ thông báo. Chặn thanh toán khi chưa ký, hóa đơn đã hủy hoặc hết hạn giữ kho; cập nhật kết quả VNPay và đối soát thay vì giữ trạng thái cũ.
- Web/mobile tiếp tục kiểm tra hồ sơ đối soát đang chờ duyệt hoặc chờ hoàn tiền, kể cả hóa đơn đã được trả qua kênh khác. Khi hoàn tất, hiển thị ghi chú xử lý và cho đóng kết quả, mở khóa thao tác; không tự tạo lại giao dịch tranh chấp. Kiểm tra hồi quy bao gồm tải lại màn hình và hóa đơn còn nợ/đã trả.
- BE kiểm tra merchant và kiểu tham số callback VNPay; giao dịch thành công nhưng số dư đã đổi được chuyển sang đối soát, không ghi thu trùng. Phân công theo kho xử lý cả backlog chưa giao khi chọn lại cùng nhân viên; nhập/xuất lấy kho hiện tại trong giao dịch sau khi chuyển kho.
- Danh mục/so sánh hiển thị kích thước của đúng loại kho, phân biệt nhóm có nhiều kích thước. Trình sửa kho dùng lựa chọn tìm kiếm và yêu cầu số ngày tối thiểu nếu bật thuê ngày.
- Mobile sửa chọn ngày, ngày không hợp lệ/quá khứ, giới hạn lịch dịch vụ, bộ lọc nhật ký, nút xác nhận và điều hướng; tránh thanh điều hướng che công việc cuối danh sách. Sửa cảnh báo React từ biểu tượng và tránh tạo nhiều vòng kiểm tra thanh toán cùng lúc.
- Kiểm chứng: 192 kiểm thử BE đạt; 18 nhóm kiểm tra giao diện/luồng đạt. Luồng HTTP bốn vai trò chạy đạt trên PostgreSQL riêng rồi xóa database thử. BE/web build và lint đạt; mobile typecheck/lint và export Android đạt. Màn hình được kiểm tra trên desktop và Expo web, chưa xác nhận trên điện thoại Android/iOS thật.
- Không thay schema, không seed/reset/migrate database nhóm hoặc thêm dữ liệu demo vào đó. File thử và ảnh kiểm tra nằm trong thư mục artifacts bị Git bỏ qua.
- Máy local đã có cấu hình SMTP; chưa gửi email thật trong lượt kiểm tra này. Thông tin ngân hàng và khóa VNPay vẫn cần nhóm bổ sung vào cấu hình riêng trước khi thanh toán thật. Luồng kiểm thử dùng nhà cung cấp giả lập trong môi trường tách biệt.

## Hoàn thiện và kiểm tra ngày 05/11/2026

- Customer có thể sửa tên/số điện thoại của chính mình qua `PATCH /api/auth/me`; email, vai trò và trạng thái không sửa được từ hồ sơ. Khi thiếu thông tin đặt kho, web/mobile dẫn sang hồ sơ rồi quay lại bước xác nhận, giữ lựa chọn và báo giá. Lưu lỗi giữ nguyên nội dung để thử lại; không thông báo thành công trước phản hồi BE.
- Web xử lý ngày hoặc bước đặt kho hỏng trong URL/bản lưu, có nút thử lại báo giá. Danh sách chọn hỗ trợ tìm không dấu, bỏ qua mục bị khóa khi dùng bàn phím và thoát bằng Tab. Sửa tràn màn hình nhỏ ở thanh đầu trang và nhóm thao tác.
- Web/mobile giữ phiên khi kiểm tra tài khoản bị mất kết nối, cho thử lại; chỉ xóa phiên khi thực sự hết hạn/vô hiệu hóa hoặc đăng xuất. Khi trình duyệt chặn/hết dung lượng lưu trữ, tab hiện tại vẫn dùng được; dữ liệu dự phòng chỉ nằm trong bộ nhớ và mất khi tải lại. Đăng xuất/đổi tài khoản ở tab khác xóa giao diện cũ và xác thực lại vai trò. API không gửi yêu cầu cần đăng nhập khi đã mất token và không nhận phản hồi cũ của tài khoản trước.
- Các bộ lọc/tìm kiếm chỉ đọc không còn giữ trạng thái “đang sửa” làm ngừng cập nhật tự động. Form nghiệp vụ đang sửa vẫn được bảo vệ khi làm mới. Mobile chỉ giữ bản nháp của màn hình đang mở; kiểm tra báo giá cũ bị hủy khi đổi lựa chọn, không áp dụng phản hồi đến muộn.
- Ngày nghiệp vụ dùng ngày Việt Nam (UTC+7) cho kiểm tra quá hạn, trả kho, ngày đặt tối thiểu và ngày chuyển kho. Không đổi cách lưu các cột `@db.Date` hay mốc thanh toán thực tế. Kho khách chưa trả vẫn hiện người đang thuê dù qua ngày kết thúc dự kiến; không nhường thông tin người sử dụng cho một đơn tương lai.
- Đăng nhập có giới hạn lượt theo IP socket và giới hạn tác vụ băm mật khẩu đồng thời; không tin `X-Forwarded-For` do client tự gửi. Khi triển khai sau reverse proxy, cần cấu hình giới hạn truy cập tại gateway phù hợp vì BE hiện thấy IP của proxy.
- `GET /api/health/ready` kiểm tra kết nối DB bằng `SELECT 1`, có thời hạn chờ và dùng chung truy vấn đang chạy; lỗi không lộ chuỗi kết nối. Đây không phải xác nhận toàn bộ schema, email hay thanh toán sẵn sàng. Phiên và OTP vẫn ở bộ nhớ: chạy **một BE process**, không bật cluster/multiple replicas; khởi động lại BE sẽ cần đăng nhập lại.
- `npm run check:production` trong BE chỉ kiểm tra cấu hình, không gửi email/chuyển tiền/ghi DB và không in khóa bí mật. Chỉ cần ít nhất một kênh nhận tiền hợp lệ (ngân hàng hoặc VNPay thật). Gateway VNPay kiểm tra đúng hostname/protocol/port; môi trường production không chấp nhận sandbox.

### Cấu hình trước khi đưa cho khách thật

1. Cấp domain HTTPS, cấu hình `FRONTEND_PUBLIC_URL`, CORS `FRONTEND_URL`, reverse proxy và API công khai. Web production mặc định gọi `/api` cùng origin; nếu API khác origin phải đặt `VITE_API_URL` trước build. Mobile release phải đặt `EXPO_PUBLIC_API_URL` bằng URL HTTPS thật trước export/build; địa chỉ local/emulator không dùng cho bản phát hành.
2. Điền thông tin cơ sở và pháp nhân thật, duyệt điều khoản và phiên bản hợp đồng; không xem thông tin minh họa hoặc PDF dự thảo là hồ sơ pháp lý đã duyệt. Các biến `VITE_FACILITY_*` và `CONTRACT_*` cần do đơn vị vận hành xác nhận.
3. SMTP local đã kiểm tra kết nối/xác thực thành công ngày 05/11, **chưa gửi email**. Cần nghiệm thu email OTP thực tế, đúng link domain triển khai và hộp thư nhận trước khi cho khách ký.
4. Điền ngân hàng nhận tiền hoặc merchant VNPay thật, cấu hình IPN HTTPS do VNPay truy cập được. Thử nhận tiền/đối soát với người phụ trách; bộ kiểm thử dùng provider giả lập không chứng minh giao dịch thật đã hoạt động.
5. Chạy `npm run check:production`, kiểm tra `/api/health/ready`, rồi nghiệm thu một hành trình thuê trên môi trường riêng và điện thoại thật. Không chạy seed/reset/migration/test ghi dữ liệu vào database nhóm chỉ để demo.

### Chạy lại bộ kiểm tra

BE: `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:production-config`; kiểm tra HTTP đầy đủ bằng `npm run test:flows` trên PostgreSQL tạm do script tự quản lý. Web: `npm run lint`, `npm run build`, `npm test`. Mobile: `npm run typecheck`, `npm run lint`, `npx expo export --platform android --output-dir artifacts/android`.

Kết quả ngày 05/11: **235 kiểm thử BE (31 file), 6 kiểm tra cấu hình và đủ 22 lệnh kiểm thử FE đạt**; trong đó 21 nhóm kiểm tra giao diện/luồng trên web/Expo web và một nhóm kiểm tra helper ngày/gateway. Luồng HTTP bốn vai trò đạt trên PostgreSQL tạm; database thử đã xóa và server thử đã dừng. Build/lint BE và web đạt; mobile typecheck/lint và export Android đạt. Kiểm tra thêm mất mạng, storage bị chặn/hết dung lượng, chuyển tài khoản giữa hai tab, ngày Việt Nam qua nửa đêm và màn hình 320/390/1440 px. Không gửi email hay chuyển tiền thật, chưa nghiệm thu trên điện thoại Android/iOS thật. Schema và dữ liệu nghiệp vụ của nhóm không thay đổi bởi bộ test; các artifact kiểm tra nằm trong thư mục bị Git bỏ qua.

Các test trình duyệt cần web ở cổng 5173, Expo web ở 8081 và helper chỉ đọc ở 3001 (`node scripts/read-only-smoke-server.mjs` trong BE sau build). Helper chỉ phục vụ catalog/giá trong giao dịch read-only và lịch trống giả lập, không phải một BE thay thế để chạy project. Trên Windows dùng Edge đã cài; nếu dùng trình duyệt khác đặt `WDP_BROWSER_PATH` hoặc cài browser tương ứng của Playwright. API của các thao tác thử bị chặn trong trình duyệt, không tạo tài khoản/hợp đồng/thanh toán mẫu trên DB nhóm. Dừng helper sau khi kiểm tra.

Tham khảo quy trình thực tế: [Shurgard](https://www.shurgard.com/en-gb/self-storage/why-shurgard/faqs/mobile-app) về tài khoản/kho/hóa đơn; [Safestore](https://www.safestore.co.uk/faqs/) về hợp đồng, thanh toán và nhận/trả kho; [Storable](https://www.storable.com/products/facility-management-software/) về vận hành cơ sở. Chỉ áp dụng cách tổ chức thông tin và công việc phù hợp; không tự thêm chính sách bảo hiểm, chu kỳ thu tiền hoặc thời hạn báo trước của các đơn vị khác vào nghiệp vụ NestBox.
