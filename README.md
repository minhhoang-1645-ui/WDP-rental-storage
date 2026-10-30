> Cập nhật 30/10/2026: xem mục **Ký email OTP, file PDF và cấu hình chuyển khoản** ở cuối README. Cần cấu hình email/ngân hàng thật; tài liệu còn nhãn DỰ THẢO khi thông tin bên cho thuê chưa được duyệt.

# NestBox Storage



Single-facility self-storage rental platform.

## Project structure

- FE/: React, TypeScript, Vite, Tailwind CSS, React Router, Lucide React and React Three Fiber.
- BE/: NestJS, TypeScript, Prisma and Supabase PostgreSQL.
- mobile/: React Native, Expo and Expo Router; shares the BE authentication and APIs.
- BE/prisma/migrations/20261003000100_init_persistence/: initial WDP application migration.

The public website, Size Guide, 3D viewer, storage catalog, three-step booking flow and minimum Manager inquiry portal are implemented.

## Environment

Create BE/.env from BE/.env.example and provide:

- DATABASE_URL: runtime transaction-pooler connection.
- DIRECT_URL: direct/session connection used by Prisma migrations.
- INQUIRY_LOOKUP_SECRET: at least 32 random characters.
- SEED_MANAGER_*: development-only Manager seed values.

Never commit .env. Prices that have not been approved remain null; the seed does not create invented prices.

## Database setup

~~~bash
cd BE
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
~~~

The seed is idempotent for catalog records. It creates one development facility, the six approved WDP products, 30 demo physical units and one development Manager account. Existing physical unit statuses are not overwritten on subsequent seed runs.

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
npm install
npm run dev -- --host 127.0.0.1
~~~

Open http://127.0.0.1:5173.

## Routes

Customer:

- /booking: three-step booking flow.
- /booking/confirmation/:id: guest Inquiry or authenticated Reservation confirmation.
- /account/login, /account/register: Customer authentication.
- /account/reservations: the authenticated Customer's Reservations.

Manager:

- /portal/login: internal login using the shared authentication system.
- /manager/inquiries: paginated Inquiry list.
- /manager/inquiries/:id: Inquiry detail, operational status and internal note.

There is no public Manager registration.

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

Manager endpoints require MANAGER or ADMIN. Customers can read only their own Reservations. Guest Inquiry details require the lookup token returned only when the Inquiry is submitted.

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
npm test

cd ../FE
npm run lint
npm run build
~~~

Integration tests use the configured development database and clean up their isolated test records.

## Deferred business rules

This milestone does not implement payment, approved pricing, contracts, permanent physical-unit assignment, check-in/out, renewal, transfer, return inspection, settlement, support incidents or reporting. Inquiry is not a hold or contract. Reservation PENDING is not payment or physical allocation.

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
- Customer chỉ tải tài liệu của mình. Manager xem hồ sơ phục vụ đối chiếu/tài chính. Staff chỉ đọc hợp đồng/phụ lục cần cho vận hành; không thêm quyền thu tiền hay quyết toán. Admin giữ hai mục Tổng quan và Tài khoản.
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
