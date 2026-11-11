# RV3 — dữ liệu demo tách biệt, có thể sao lưu và khôi phục

## Kết quả kiểm tra và phạm vi

Đã đọc schema, migrations, seed cũ và dữ liệu thực trong PostgreSQL/Supabase bằng giao dịch **READ ONLY**. Kết nối ứng dụng hiện tại chưa được xác nhận là database demo riêng. Không xóa, seed, reset, migrate, sửa giá hoặc sửa tài khoản trên database đó.

Snapshot kiểm tra ngày 10/11/2026 (số lượng sẽ thay đổi khi nhóm thao tác):

| Nhóm | Bảng và số bản ghi |
|---|---|
| Tài khoản/cấu hình | User 130; AuthSession 17; BusinessPolicy 0; AuditEvent 323; AccountFlowLimit 5; AccountFlowToken 1; SigningChallenge 1 |
| Danh mục | Facility 14; StorageType 19; StorageUnit 99; AdditionalService 17; AdditionalServiceInventory 17; UnitStaffAssignment 6 |
| Tiếp nhận/thuê | GuestBookingRequest 10; GuestBookingService 2; ContactInquiry 2; Reservation 59; ReservationService 6; ReservationUnit 63; RentalContract 60 |
| Tài chính | Invoice 101; Payment 32; PaymentSubmission 2; OnlinePaymentTransaction 39; OnlinePaymentReconciliation 0 |
| Vận hành | HandoverAppointment 22; StoredItem 11; StockMovement 13; StockMovementLine 13; SupportRequest 18; MaintenanceRequest 6 |
| Thay đổi/quyết toán | RenewalRequest 10; TransferRequest 5; ReturnRequest 5; ReturnInspection 5; DepositSettlement 3; DepositSettlementIssue 0; DamageClaim 0 |

**Đây không phải danh sách được phép xóa.** Không suy ra 32 Payment hoặc 39 giao dịch VNPay là dữ liệu giả. Bộ công cụ mới không có chế độ xóa Supabase/shared/production.

Bốn tài khoản `customer@wdp.test`, `staff@wdp.test`, `manager@wdp.test`, `admin@wdp.test` thực sự tồn tại, đúng role, ACTIVE và có định dạng hash scrypt hợp lệ. Salt nằm trong `passwordHash`, không có trường `passwordSalt` riêng trong schema hiện tại. Chưa thử mật khẩu thật của bốn tài khoản này.

Giá tháng thực tế của danh mục chuẩn:

| Mã | Loại | Giá/kho/tháng | Thuê ngày | Tối thiểu ngày |
|---|---|---:|---|---:|
| LK-A01 | Tủ lưu trữ A01 | 650.000 đ | Có | 1 |
| SM-B12 | Kho nhỏ B12 | 1.500.000 đ | Có | 7 |
| SM-C08 | Kho nhỏ C08 | 1.900.000 đ | Có | 7 |
| MD-D04 | Kho vừa D04 | 2.900.000 đ | Không | Không áp dụng |
| MD-E06 | Kho vừa E06 | 3.600.000 đ | Không | Không áp dụng |
| LG-F02 | Kho lớn F02 | 5.500.000 đ | Không | Không áp dụng |

Cả 19 StorageType tại thời điểm kiểm tra có giá tháng dương, gồm 13 loại được đặt tên cho các lần test trước. Bootstrap chỉ lấy LK-A01, SM-B12, MD-D04, LG-F02 và Facility liên quan. Giá, số tháng cọc, điều kiện thuê ngày được sao chép nguyên giá trị hiện hành; không ghi đè danh mục đích đã tồn tại, không dùng giá dự phòng. Không sao chép giao dịch/hồ sơ khách thật.

## Các file mới

- `BE/scripts/rv3-demo.mjs`: CLI inspect/bootstrap/seed/verify/backup/restore/cleanup; mặc định dry-run.
- `BE/scripts/rv3-demo/safety.mjs`: guard, tài khoản được bảo vệ, fingerprint, thứ tự FK.
- `BE/scripts/rv3-demo/seed.mjs`: fixture và kiểm tra tính nhất quán bằng service hiện tại.
- `BE/scripts/rv3-demo/safety.test.mjs`: test guard, thông tin xác thực và FK.
- `BE/scripts/rv3-demo/integration.mjs`: tự tạo cụm PostgreSQL tạm, migrate **chỉ database mới tách biệt**, kiểm thử và dừng cụm.
- `BE/package.json`: thêm các lệnh RV3; không thay seed cũ.

Không sửa FE, Mobile, service nghiệp vụ, Prisma schema hoặc migration. Không commit/push/deploy.

## Giữ tài khoản và thông tin xác thực

`bootstrap` đọc bốn User từ nguồn trong transaction READ ONLY, rồi chép nguyên User ID, email, role, trạng thái, hash/salt và dữ liệu hồ sơ sang database demo **trống đã có schema**. So sánh toàn bộ bốn bản ghi trước commit. Không giải mã mật khẩu, không tạo mật khẩu mới, không reset hash, không in hash/password/token. Nếu thiếu tài khoản, sai role, DISABLED hoặc hash không hợp lệ thì dừng.

Seed và cleanup không có lệnh cập nhật/xóa User. Khi đã bootstrap, những lần seed sau giữ nguyên mọi User. Nếu muốn dùng một nguồn mới chưa có đủ bốn tài khoản, phải tạo chúng qua cơ chế auth hiện hành với secret được cấp riêng; script này không tự đoán mật khẩu hoặc tạo tài khoản thay thế.

Database demo chứa bản sao hash của tài khoản thật, vì vậy vẫn là dữ liệu nhạy cảm: chỉ chạy trên máy tin cậy, không công khai PostgreSQL ra Internet, không đưa file backup vào Git. Backup đầy đủ được mã hóa AES-256-GCM với khóa cung cấp lúc chạy.

## Bộ demo được tạo

12 StorageUnit: mỗi loại 3 ô, có mã `RV3-TU-*`, `RV3-NHO-*`, `RV3-VUA-*`, `RV3-LON-*`, tầng/khu/hàng/vị trí riêng. Cả 12 được phân công cho Staff cố định bởi Manager. Sau seed: 7 AVAILABLE, 2 RESERVED, 2 OCCUPIED, 1 MAINTENANCE.

| Hồ sơ | Tình huống và quan hệ |
|---|---|
| RV3-DAT-01 | Ngoại lệ PENDING để Staff xử lý; chưa có allocation, contract hoặc invoice. Không mô tả đây là kết quả thông thường của luồng tự xác nhận. |
| RV3-DAT-02 | CONFIRMED, tủ đã phân bổ; 1 hợp đồng chưa xác nhận, 1 INITIAL OPEN. Khách cần ký trước khi trả tiền. |
| RV3-DAT-03 | CONFIRMED, 1 kho nhỏ; hợp đồng giả định ký giấy được ghi nhãn lịch sử demo; INITIAL thu CASH mô phỏng qua BillingService; bàn giao chìa khóa sớm qua AppointmentsService, vẫn READY_FOR_HANDOVER tới ngày thuê. |
| RV3-DAT-04 | 1 kho vừa ACTIVE từ hôm seed, hợp đồng có xác nhận và INITIAL PAID; bàn giao qua service; PAY_MONTHLY có 2 hóa đơn kỳ sau OPEN. |
| RV3-DAT-05 | 1 kho lớn, thuê PREPAID 3 tháng, đến hạn trả đúng hôm seed; hợp đồng/bàn giao lịch sử **mô phỏng** rõ ràng; INITIAL PAID qua BillingService; ReturnRequest và inspection PENDING tạo qua ReturnsService. |

Tổng ban đầu: 5 Reservation; 4 ReservationUnit; 4 RentalContract; 6 Invoice (4 INITIAL + 2 RECURRING); 3 Payment CASH có reference `RV3-FIXTURE-*`; 1 PaymentSubmission DEMO chờ Manager xác nhận; 3 HandoverAppointment COMPLETED. Submission không cộng vào amountPaid/doanh thu.

PricingService tính tất cả quote và snapshot. ContractsService tạo contract từ allocation; BillingService phát hành INITIAL/RECURRING và ghi nhận Payment, cập nhật trạng thái hóa đơn/hợp đồng theo quy tắc hiện tại. Không chèn Invoice PAID bằng SQL, không tạo giao dịch VNPay hay giả kết quả IPN/QueryDR.

Các xác nhận hợp đồng trả tiền trong bộ fixture là **giả định hồ sơ lịch sử ký giấy**, nhãn `RV3-DEMO-PAPER-HISTORY`, có ghi rõ mô phỏng. Không có chữ ký khách thật hoặc bằng chứng OTP giả; không kiểm thử end-to-end ký email bằng địa chỉ `.test`. Hợp đồng RV3-DAT-02 còn nguyên để demo luồng ký thực tế với hạ tầng email phù hợp. Lịch sử RV3-DAT-05 được nhập riêng vì service đúng nghiệp vụ không cho kích hoạt mới một kỳ thuê đã hết hạn.

Hàng của RV3-DAT-04: Customer yêu cầu nhập 10 thùng, Manager giao Staff, Staff kiểm đếm **8** và ghi lý do chênh lệch; tồn = 8. Một IN yêu cầu thêm 3 và một OUT yêu cầu lấy 2 ở ASSIGNED; `actualQty=null`, tồn vẫn 8. Có support được giao Staff, maintenance vệ sinh kho chưa cho thuê, renewal PENDING dùng quote gia hạn không tính lại cọc. Renewal fixture giữ PENDING để demo màn duyệt ngoại lệ; không thay đổi luồng tự duyệt của ứng dụng.

Không tạo TransferRequest hoặc DepositSettlement giả khi chưa có điều kiện; màn trả kho dẫn tiếp tới kiểm tra và quyết toán thật trong demo. Customer tự vận chuyển, Staff hướng dẫn và kiểm đếm, Manager phân công.

## Cách chạy an toàn

Chạy trong `BE`. Cần Node dependencies đã cài và PostgreSQL có `pg_dump`, `pg_restore`. Build trước khi chạy seed để dùng đúng service hiện tại:

```powershell
npm run build
npm run demo:rv3:inspect
```

Lệnh inspect cuối dùng `.env` hiện có theo chế độ READ ONLY nếu chưa cấu hình target. Chỉ in count, trạng thái account, giá và fingerprint; không in connection string hoặc hash.

Tạo **database local mới, trống**, ví dụ `nestbox_rv3_demo_rv3`, bằng pgAdmin với quyền local của bạn. Không dùng `wdp_storage`, không chọn Supabase chung. Cấp URL riêng qua biến môi trường một cách bảo mật:

```powershell
# Nhập URL bí mật qua môi trường riêng, không lưu vào source/Git hoặc đưa lên chat.
# RV3_DEMO_DATABASE_URL phải trỏ tới localhost/127.0.0.1 và DB nestbox_rv3_demo_*.
$env:RV3_DEMO_MODE = 'ISOLATED_DEMO'
$env:RV3_PG_BIN = 'D:\PostgreSQL\bin'
npm run demo:rv3:inspect
# Lấy fingerprint an toàn từ inspect, không phải URL:
$env:RV3_DEMO_DATABASE_FINGERPRINT = '<fingerprint-target>'
```

Chỉ trên database local mới này, chạy migrations hiện tại. Prisma CLI dùng DIRECT_URL; không được để nó trỏ về Supabase:

```powershell
$rv3PreviousDirect = $env:DIRECT_URL
try {
  $env:DIRECT_URL = $env:RV3_DEMO_DATABASE_URL
  npm run prisma:migrate:deploy
} finally {
  if ($null -eq $rv3PreviousDirect) { Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue }
  else { $env:DIRECT_URL = $rv3PreviousDirect }
}
npm run demo:rv3:bootstrap
npm run demo:rv3:bootstrap -- --apply --confirm=$env:RV3_DEMO_DATABASE_FINGERPRINT
npm run seed:rv3-demo
npm run seed:rv3-demo -- --apply --confirm=$env:RV3_DEMO_DATABASE_FINGERPRINT
npm run demo:rv3:verify
```

Giữ DATABASE_URL nguồn khác target khi dùng CLI; guard chặn nếu hai URL cùng fingerprint. Muốn chạy Backend cho buổi demo, dùng **terminal khác** cấu hình DATABASE_URL = URL demo, DIRECT_URL = URL demo rồi khởi động Backend. FE/Mobile cùng trỏ tới Backend demo đó; không để một client vẫn dùng API Render/Supabase cũ. Android Emulator dùng `10.0.2.2` khi Backend ở máy Windows. Không sửa cấu hình deployment hiện tại tự động.

Chỉ tại Backend demo có thể bật `DEMO_PAYMENT_ENABLED=true` để Manager xử lý submission mô phỏng và `UNIT_STAFF_ASSIGNMENTS_ENABLED=true` sau khi đã áp dụng migration vào demo. CLI chỉ bật cờ demo thanh toán tạm trong tiến trình riêng khi tạo submission; không ghi cờ vào cấu hình production. Không cần VNPay để chạy các fixture CASH.

## Dry-run, chống trùng và dọn dẹp

Các lệnh inspect/seed/bootstrap/backup/restore/cleanup mặc định không áp dụng. `--apply` cần đồng thời:

- Target khai báo riêng, local, tên `nestbox_rv3_demo_*`, khác DATABASE_URL của ứng dụng.
- `RV3_DEMO_MODE=ISOLATED_DEMO`; NODE_ENV khác production.
- Fingerprint trong biến môi trường và `--confirm` khớp target.

Seed dùng một transaction Serializable/advisory lock. Service lồng nhau dùng chung transaction, lỗi thì rollback toàn bộ. Bộ đã có đủ thì chỉ verify, không tạo thêm hoặc khôi phục trạng thái về ban đầu. Dữ liệu tồn tại dở dang/không thuộc bộ demo thì dừng. Manifest riêng chứa ID sở hữu, không chứa password/hash, nằm trong `BE/artifacts/rv3-demo/` đã bị Git ignore. Không xóa manifest bằng tay; nếu mất manifest thì cleanup từ chối, dùng database demo mới hoặc quy trình khôi phục.

Cleanup chỉ lấy các ID ghi trong manifest; nếu phát sinh bất kỳ hồ sơ nghiệp vụ không thuộc manifest thì dừng, kể cả tại demo local. Không có nút xóa tất cả test cũ trên Supabase. Không xóa User, AuthSession, AccountFlowToken/Limit, SigningChallenge, AuditEvent, BusinessPolicy, Facility, StorageType, AdditionalService/Inventory hoặc migrations. Nhờ vậy tài khoản, cấu hình, danh mục và audit vẫn nguyên vẹn.

Các bảng có thể nằm trong kế hoạch cleanup (chỉ ID thuộc manifest; số 0 vẫn được báo cáo): StorageUnit, UnitStaffAssignment, GuestBookingRequest/Service, ContactInquiry, Reservation/Service/Unit, RentalContract, Invoice, Payment, PaymentSubmission, HandoverAppointment, StoredItem, StockMovement/Line, RenewalRequest, TransferRequest, ReturnRequest/Inspection, DepositSettlement/Issue, SupportRequest, MaintenanceRequest, DamageClaim. Số bản ghi thực và thứ tự xóa in ở dry-run, không lấy cứng số trên tài liệu.

Có OnlinePaymentTransaction/OnlinePaymentReconciliation thì từ chối cleanup hoàn toàn. Payment chỉ được dọn nếu CASH, đúng reference RV3-FIXTURE, đúng nhãn DEMO, không liên kết online transaction; submission cũng phải đúng nhãn/reference demo. Không xóa chứng từ tài chính không nhận diện được.

Thứ tự xóa được tính từ FK thực trong PostgreSQL, con trước cha, không tắt ràng buộc, không TRUNCATE/CASCADE/DROP. Có dependency từ bảng phải giữ sang bảng sẽ xóa hoặc chu kỳ cần đánh giá thì dừng. Dùng khóa bảng và kiểm tra lại toàn bộ snapshot để chống race trước khi xóa.

```powershell
# Tạo khóa một lần, giữ trong nơi lưu bí mật; không in ra console hoặc commit.
$env:RV3_DEMO_BACKUP_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
npm run demo:rv3:cleanup
# Đọc bảng/count và lấy planHash do chính dry-run vừa trả về:
npm run demo:rv3:cleanup -- --apply --confirm=$env:RV3_DEMO_DATABASE_FINGERPRINT --plan=<planHash>
```

Cleanup apply tự backup trước, xác minh `pg_restore --list`, rồi khóa/kiểm tra snapshot vẫn đúng mới DELETE trong transaction. Nếu thay đổi từ dry-run hoặc backup lỗi thì dừng. Cần giữ khóa backup an toàn cho tới hết thời gian cần khôi phục; mất khóa thì không giải mã được.

## Khôi phục

Backup là pg_dump custom đầy đủ được mã hóa AES-256-GCM, có authenticated metadata và hash. Bản dump tạm bị xóa sau khi mã hóa; không ghi URL/password vào tham số dòng lệnh PostgreSQL. Backup không đưa lên Git.

Tạo một database **local khác, trống, chưa migrate**, ví dụ `nestbox_rv3_demo_recovery`. Trỏ target/fingerprint tới đó, cấp lại chính khóa backup đã giữ và chạy:

```powershell
npm run demo:rv3:restore -- --backup=<duong-dan-file.rv3backup>
npm run demo:rv3:restore -- --apply --confirm=$env:RV3_DEMO_DATABASE_FINGERPRINT --backup=<duong-dan-file.rv3backup>
```

Restore kiểm tra chữ ký GCM, hash archive rồi pg_restore trong một transaction, không `--clean`, không ghi đè database có bảng. Kiểm tra tài khoản/hồ sơ bằng demo:rv3:verify trước khi trỏ Backend demo sang database phục hồi. Manifest gắn fingerprint database cũ nên không dùng để dọn database recovery; giữ bản recovery để đối chiếu hoặc tạo demo sạch riêng. Không tự phục hồi đè lên Supabase.

## Kiểm thử và giới hạn chứng cứ

```powershell
npm run test:rv3-demo
npm run test:rv3-demo:integration
npm run build
npm run lint
```

Integration khởi tạo PostgreSQL tạm, tạo ba database riêng (nguồn test, đích demo, recovery); áp dụng chính migrations repository vào hai database mới, không dùng migrate reset. Nó tạo mật khẩu ngẫu nhiên trong bộ test bằng AuthService.encodePassword; không phải thay mật khẩu bốn tài khoản Supabase. Sau test dừng cụm, không tự xóa đệ quy dữ liệu trên máy. Các thư mục tạm `nestbox-rv3-isolated-*` và archive mã hóa dùng khóa tạm chỉ phục vụ test, không phải backup khôi phục Supabase.

Đã kiểm tra: dry-run không ghi; guard từ chối sai đích/confirmation; giữ hash và ID; seed hai lần không trùng; xác nhận bốn role qua AuthService và token session thật trong DB test; quan hệ allocation/contract/invoice; INITIAL/recurring và số tiền; không tạo VNPay; handover sớm chưa kích hoạt; ACTIVE có ký/thu/bàn giao; tồn thực tế bằng 8, phiếu chờ chưa thay tồn; đọc danh sách Customer/Staff; dashboard và tổng báo cáo Manager khớp fixture; Admin repository thấy đủ bốn account; backup mã hóa khôi phục thực tế; cleanup giữ tài khoản/catalog và từ chối hồ sơ/tiền không xác định, plan cũ.

Kết quả kiểm tra hồi quy: 6 safety tests; 43 tests có sẵn về roles, admin safety, payment eligibility, stock safety, pricing boundaries. Backend build đạt; lint không lỗi, có 2 warning cũ tại damage-claims.service.ts và reporting.service.ts. Node/pg có phát deprecation warning khi service/adapter thực hiện query song song; không thay đổi service ngoài phạm vi nhiệm vụ này.

Chưa tuyên bố test UI Customer Mobile/Staff Web/Manager Web/Admin Web end-to-end hoặc đăng nhập live bằng mật khẩu cũ. Chưa cấu hình API demo cho các client, chưa triển khai, chưa ghi/xóa Supabase. Dữ liệu fixture hiển thị qua đúng service đọc hiện hành đã được kiểm tra ở DB test; kiểm tra UI cuối cùng cần chạy các client với cùng Backend demo.
