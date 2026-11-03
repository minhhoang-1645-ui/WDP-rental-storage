# Kiểm chứng source so với TONG_HOP_CHUC_NANG_NESTBOX.md

Ngày: **03/11/2026**. Nhánh local `khang`, HEAD `15ac4db`, có thay đổi uncommitted/untracked trong mobile và docs. Đọc working tree thực tế, không chỉ HEAD. Không fetch/đối chiếu commit Render, không coi local là bản đang deploy.

Đối tượng: [tài liệu tổng hợp](./TONG_HOP_CHUC_NANG_NESTBOX.md). Đây là **báo cáo kiểm chứng**, không phải bản tự sửa nội dung gốc hoặc bản fix nghiệp vụ.

## Sai lệch và thiếu sót cần báo trước

1. **QueryDR chưa có.** Tài liệu đã ghi đúng điều này, nhưng yêu cầu khôi phục giao dịch thành công khi mất IPN **chưa được giải quyết** bằng source hiện tại. Log IPN và trang poll không truy vấn VNPay.
2. **Chưa có kiểm tra merchant riêng trong callback.** HMAC được kiểm tra, nhưng `verify()` không so sánh `vnp_TmnCode` với `VNPAY_TMN_CODE`. Phép thử bằng khóa fixture đã xác nhận nhận payload signed của mã merchant khác. Không suy diễn rằng người không biết khóa có thể giả mạo, hoặc đây là nguyên nhân giao dịch production bị chờ.
3. **Tài liệu thiếu mô tả dedup BANK_TRANSFER.** Field, migration và unique index thực sự có; cả thu trực tiếp và duyệt thông báo cùng đi qua `recordPayment`. Nhưng dữ liệu legacy để null không được backfill, mã tham chiếu giữ nguyên hoa/thường và index production chưa được kiểm chứng.
4. **“Nhiều kho” chưa đủ chính xác:** mỗi Reservation chỉ có một StorageType, quantity 1–3 StorageUnits cùng loại. Không có đơn giỏ hàng trộn nhiều StorageTypes.
5. **Cardinality hóa đơn cần nói rõ:** N kho → N contract, nhưng chỉ **một INITIAL cho cả Reservation**, không phải N INITIAL. Các kỳ recurring cũng tổng hợp theo Reservation.
6. **Mục recurring còn mơ hồ:** không có monthly Cron. Khi tất cả hợp đồng ACTIVE, BE tạo trước các hóa đơn cho chu kỳ 2…M của PAY_MONTHLY. Có script backfill, không phải bộ lịch phát hành mỗi tháng đã được chứng minh chạy trên Render.
7. **Mobile có route không phải tính năng độc lập:** Admin settings/roles/assignments/activity/account-status và cây facility có redirect. Tab Cài đặt đang trỏ route quay về Admin. Tài liệu có cảnh báo nhưng không được tính “57 màn” thành 57 luồng hoạt động hoàn chỉnh.
8. **Mức kiểm chứng phải giữ giới hạn:** exact-unit mobile đã nối dữ liệu tới allocation theo source và helper test; chưa chạy hành trình native → API → DB thực. Chưa chứng minh migration đã apply, lịch chạy trên deployment, IPN merchant đăng ký đúng hoặc mọi action của cả bốn role hoạt động đầu-cuối.

Không thấy cơ sở để viết lại các điểm chưa kiểm chứng thành “đã fix”. Bản tổng hợp nhìn chung có cảnh báo phù hợp nhưng **chưa đủ chính xác để dùng như báo cáo nghiệm thu**.

## Quy ước nhãn

- **VERIFIED:** có bằng chứng source, kèm test khi được nêu; không đồng nghĩa production đã hoạt động.
- **INCORRECT:** câu khẳng định đó trái source hoặc phép thử quan sát được.
- **INCOMPLETE:** thiếu triển khai, thiếu điều kiện hoặc diễn đạt bỏ sót giới hạn.
- **NOT TESTED:** chưa kiểm chứng ở môi trường/đường chạy được nhắc đến.

Một chủ đề có thể VERIFIED ở local nhưng NOT TESTED ở deployment. Ghi nhận khác nhau này không mâu thuẫn.

## 1. VNPay IPN và QueryDR

**Nhãn:** VERIFIED với luồng IPN hiện có; INCOMPLETE với QueryDR và kiểm merchant riêng; NOT TESTED với callback/giao dịch thật trên Render.

**File/hàm và bằng chứng:**

- `BE/src/modules/billing/vnpay.service.ts:15` — `paymentUrl`: tạo URL có merchant cấu hình, amount × 100, ngày hết hạn 5 phút, HMAC SHA-512.
- `vnpay.service.ts:31` — `verify`: lọc giá trị string, loại hash khỏi chuỗi ký, sắp xếp canonical, kiểm HMAC bằng `timingSafeEqual`, đọc `vnp_TxnRef` và `vnp_Amount`. **Không so sánh `params.vnp_TmnCode` với `settings().tmnCode`.**
- `BE/src/modules/billing/online-payment.service.ts:57` — `processIpn`: gọi verify; tìm `merchantOrderRef`; khóa transaction và Invoice; kiểm `payload.amountMinor === transaction.amount * 100n`; chỉ thành công tài chính khi cả responseCode và transactionStatus là `00`.
- Cùng hàm: transaction SUCCESS thì trả xác nhận, không ghi thu lần nữa. Nhánh chấp nhận PENDING/EXPIRED; success sau invoice VOID hoặc đơn hết hạn tạo `OnlinePaymentReconciliation`, không kích hoạt kho. `P2002/P2034` chỉ coi đã xong nếu đọc lại trạng thái SUCCESS; chưa xong trả mã tạm 99.
- `BE/src/modules/billing/online-payment.service.ts:137` — `getCustomerStatus`: truy vấn **Prisma**, không gọi HTTP tới VNPay. Có cập nhật trạng thái local EXPIRED và đọc invoice/payment/reconciliation.
- `BE/src/modules/billing/online-payment.controller.ts` — `ipn` và `returnUrl`: return chỉ verify và đọc status; IPN mới đi vào xử lý tiền. Không có endpoint QueryDR.
- Đã tìm `QueryDR`, `querydr`, `queryDr`, `query-dr` trong mã ứng dụng BE: không có triển khai truy vấn giao dịch VNPay.

**Phép thử:** callback `vnp_TmnCode=OTHER`, ký bằng khóa fixture tương ứng HMAC mà service đang dùng, vẫn qua `verify()` khi config merchant là EXPECTED. Đây là thiếu validation riêng; không phải chứng minh có thể vượt HMAC mà không biết khóa.

**Tác động:** mất IPN thì không có cơ chế chủ động lấy trạng thái từ provider; poll frontend chỉ tiếp tục nhìn trạng thái local. Kiểm merchant cần bổ sung trước khi gọi là bộ validation đầy đủ. Chưa xác định nguyên nhân merchant/IPN production vì không có log và phiên deploy được xác minh trong lượt này.

**Sửa tài liệu:** mục 9 giữ nguyên câu “QueryDR chưa triển khai”. Bổ sung chính xác:

> IPN kiểm HMAC, reference, số tiền và hai mã trạng thái. Source hiện chưa kiểm riêng merchant code trong callback. Chưa có QueryDR để phục hồi thanh toán khi IPN không đến. Không kết luận giao dịch provider thành công đã được ghi nhận nếu Payment/Invoice trên BE chưa cập nhật.

Không sửa thành “QueryDR đã fix” hoặc “BE chắc chắn không nhận IPN”; hai câu đó **INCORRECT/không đủ bằng chứng** tương ứng.

## 2. BANK_TRANSFER: field, migration và cross-API

**Nhãn:** VERIFIED về schema/migration và đường ghi chung; INCOMPLETE về phạm vi bảo vệ legacy/chuẩn hóa; NOT TESTED về migration/index và cạnh tranh thật trên shared DB.

**File/hàm và bằng chứng:**

- `BE/prisma/schema.prisma:1018` — model `Payment` có nullable `bankDestinationKey`, `bankTransactionReference` và `@@unique([bankDestinationKey, bankTransactionReference])`; thêm `idempotencyKey @unique` riêng.
- `BE/prisma/migrations/20261030000100_payment_bank_transfer_dedup/migration.sql:1` — ADD COLUMN hai field và CREATE UNIQUE INDEX. Không UPDATE dữ liệu legacy, không CHECK bắt buộc hai field cho mọi BANK_TRANSFER.
- `BE/src/modules/billing/billing.service.ts:600` — `paymentInput`: BANK_TRANSFER phải có `reference`; trim chuỗi, gán `bankTransactionReference=reference`; client không được tự quyết định destination key.
- `billing.service.ts:650` — `bankDestinationKey`: SHA-256 của bankCode + dấu phân cách + accountNumber cấu hình BE. Không phải key theo invoice hay theo customer.
- `billing.service.ts:201` — `recordPayment`: khóa invoice, kiểm khóa idempotency, ký và số dư; tạo Payment kèm hai field. Unique/P2002 được xử lý thành xung đột giao dịch đã ghi nhận.
- `billing.service.ts:354` — `verifyPaymentSubmission`: yêu cầu Manager đưa reference đã đối chiếu (ngoại trừ nhánh demo được kiểm soát), gọi **cùng `recordPayment`** trong transaction với key `payment-submission:<id>`.
- Source chỉ có hai điểm `tx.payment.create` ngoài test/generated: thu BANK_TRANSFER/CASH ở recordPayment; thu VNPAY ở recordVerifiedOnlinePayment. Không thấy đường BANK_TRANSFER nghiệp vụ thứ ba tự ghi thiếu key trong `BE/src`.

**Phạm vi:** index không gồm `invoiceId`, nên một cặp destination/reference đã dùng không thể ghi lại ở hóa đơn khác, kể cả gọi hai API khác nhau, **khi index thực sự đã apply**. Idempotency chỉ bảo vệ retry cùng key; composite index bảo vệ thay key.

Giới hạn đã xác minh: legacy null giữ nguyên nên không bị composite index chặn như record mới; `REF-1` và `ref-1` được lưu thành hai chuỗi khác nhau. Chưa xác định chính sách hoa/thường của từng ngân hàng nên không khẳng định mọi biến thể là cùng giao dịch. Đổi định danh tài khoản cấu hình cũng đổi destination scope. Migration không tự chứng minh đã chạy trong DB.

**Tác động:** tài liệu thiếu các điều kiện này dễ khiến nhóm nghĩ “không bao giờ thu trùng”. Cross-API cho record mới có cơ chế thật; bảo vệ toàn bộ sao kê/legacy và xác thực mã giao dịch ngân hàng không được tự suy ra.

**Sửa tài liệu:** thêm vào mục 9:

> Thu chuyển khoản trực tiếp và duyệt thông báo dùng chung recordPayment. Record BANK_TRANSFER mới có destination key do server sinh và reference do người đối chiếu xác nhận; DB unique theo hai field chống dùng lại trên hóa đơn khác. Phải apply migration 20261030000100_payment_bank_transfer_dedup. Record legacy null không được backfill; reference hiện chỉ trim, chưa có chính sách chuẩn hóa hoa/thường. Cơ chế này không tự xác minh sao kê với ngân hàng.

## 3. Nhiều StorageUnits và nhiều StorageTypes

**Nhãn:** VERIFIED về một loại/nhiều kho cùng loại; INCOMPLETE về cách diễn đạt tài liệu.

**File/hàm và bằng chứng:**

- `BE/prisma/schema.prisma:519` — Reservation có **một** `storageTypeId` và một `quantity`, không có bảng dòng hàng nhiều StorageTypes trong một đơn.
- `BE/src/modules/booking/booking.service.ts:752` — `validateDraft`: nhận một `productId`; quantity phải là số nguyên từ 1 tới 3.
- `booking.service.ts:682` — `checkAvailabilityForDraft`: candidates `where: {storageTypeId: draft.productId, status:'AVAILABLE'}`.
- `booking.service.ts:483` — `confirmReservation`: SQL khóa StorageUnit với `storageTypeId = reservation.storageTypeId`, sau đó chọn quantity kho khả dụng.
- `mobile/src/app/customer/booking.tsx:24` — Draft có một productId; body ở dòng 55 không có cart nhiều loại.

**Tác động:** khách muốn một tủ và một kho lớn phải tạo các đơn riêng; không nên demo như một lần checkout trộn loại. Quantity nhiều không có nghĩa nhiều StorageTypes.

**Sửa tài liệu:** mục 6 thay “chọn loại, số lượng” bằng:

> Mỗi Reservation thuê 1–3 StorageUnits của đúng một StorageType. Muốn thuê nhiều loại phải tạo các Reservation riêng. Chọn kho cụ thể phải đủ số lượng và cùng loại với productId.

## 4. Cardinality Reservation → Contract → Invoice

**Nhãn:** VERIFIED bằng source và mock test; INCOMPLETE vì tài liệu chưa nêu đủ quan hệ/số lượng.

**File/hàm và bằng chứng:**

- `BE/src/modules/contracts/contracts.service.ts:32` — `ensureForConfirmedReservation`: yêu cầu CONFIRMED, allocations bằng quantity; lặp các unit rồi upsert contract bằng `reservationUnitId`.
- `BE/prisma/schema.prisma:622` — `RentalContract.reservationUnitId @unique`: một contract ứng với một allocation.
- `BE/src/modules/billing/billing.service.ts:44` — `ensureInitialInvoice`: yêu cầu số contracts và units đều bằng quantity; upsert **một Invoice** theo `(reservationId,billingCycle=1)`.
- `billing.service.ts:81` — `ensureRecurringInvoices`: đòi mọi contract ACTIVE; chỉ MONTHLY + PAY_MONTHLY; lặp `cycle=2..termMonths`; rental mỗi invoice bằng monthlyUnitPrice × quantity; cọc bằng 0.
- `BE/prisma/schema.prisma:808` — Invoice gắn `reservationId`, không gắn một contractId; unique `(reservationId,billingCycle)`. Gia hạn có `(renewalRequestId,renewalCycle)` riêng, không đồng nhất với chu kỳ thuê gốc.

**Test bổ sung:** 2 units, 3 tháng PAY_MONTHLY, đơn giá fixture 100, cọc fixture 200 → 2 upsert contract; 1 INITIAL tổng 400; 2 RECURRING tổng 200 mỗi kỳ. Số fixture chỉ dùng kiểm chứng, không phải giá dự án/DB.

**Tác động:** không được nhân số hóa đơn ban đầu theo số hợp đồng hoặc thu cọc lặp cho mỗi chu kỳ. Phải ký đủ N hợp đồng nhưng thanh toán initial tổng hợp theo đơn.

**Sửa tài liệu:** thêm vào mục 2/6/9:

> Một Reservation có N allocation và N hợp đồng, với N=quantity (1–3). Đơn có một INITIAL tổng hợp. PAY_MONTHLY M tháng có thêm M−1 RECURRING tổng hợp theo Reservation; PREPAID/ngày không tạo các recurring này. Renewal/settlement có nhánh hóa đơn riêng.

## 5. Exact-unit từ Mobile 2D tới allocation cuối

**Nhãn:** VERIFIED về đường truyền source và helper; NOT TESTED đầu-cuối native → HTTP → DB thật/cạnh tranh thực tế.

**File/hàm và bằng chứng:**

- `mobile/src/app/customer/discover.tsx` — `StorageDiscoveryScreen`, nút Đặt kho này (tìm `picked &&`): router truyền `product`, `unit=picked.id`, `unitCode`, ngày, periodMode, durationMonths. Không chỉ truyền tên hiển thị.
- `mobile/src/app/customer/booking.tsx:32` — khởi tạo draft `selectedUnitIds: params.unit ? [params.unit] : []`.
- `booking.tsx:50` — update chỉ xóa unit khi đổi productId/quantity, không xóa khi đổi paymentPlan/ngày; các thay đổi vẫn phải check lại.
- `booking.tsx:55`, `check` và `submit`: body có selectedUnitIds; check availability và unit-map; submit POST `/reservations` bằng body đó.
- `BE/src/modules/booking/booking.service.ts:654` — `selectedUnitIds` kiểm đủ count, ID hợp lệ và không trùng. `validateDraft` parse field; `createReservation` lưu IDs trong availabilitySnapshot.
- `booking.service.ts:663`, `:669` — `selectedUnitIdsFromSnapshot`, `snapshotWithSelection` đọc/ghi IDs.
- `booking.service.ts:523`, `:673` — confirm đọc snapshot, gọi `requireSelectedUnits` từ candidates đã khóa/loại xung đột. Nếu không còn đúng kho thì báo conflict; không lặng lẽ tự đổi sang unit khác.

**Test bổ sung:** snapshot giữ unit-b; requireSelectedUnits chọn đúng unit-b thay unit-a; ID thiếu, ID lặp và count sai đều bị chặn.

**Giới hạn:** test helper và lần theo source chưa chứng minh trải nghiệm mọi biến thể route/đổi ngày/network trên emulator. Nhánh chọn từ sơ đồ hiện là một unit; muốn quantity nhiều dùng luồng đặt có số lượng. Không thể suy ra đã có chọn trộn loại.

**Tác động:** exact-unit đã được nối, không phải sơ đồ chỉ trang trí; nhưng không nên viết đã test DB/native toàn bộ. Nếu unit mất khả dụng khách cần đổi kho/thời gian.

**Sửa tài liệu:** giữ mô tả đã nối ở mục 5 nhưng thêm:

> selectedUnitIds đi vào snapshot và được kiểm lại khi allocation. Đã kiểm helper với mock; chưa kiểm E2E mobile thật tới DB ở lần rà này. Mã hiển thị unitCode không phải căn cứ phân bổ; căn cứ là ID và kiểm tra BE.

## 6. Authentication: opaque token, TTL và restart

**Nhãn:** VERIFIED. NOT TESTED với cấu hình nhiều instance/deployment thật.

**File/hàm và bằng chứng:**

- `BE/src/modules/auth/auth.service.ts:9`: `sessions = new Map` theo instance AuthService.
- `:10`: `sessionTtlMs = 8 * 60 * 60 * 1000`.
- `:75` — `createSession`: `randomBytes(32).toString('hex')`; key trong Map là SHA-256 token, không phải JWT ký có claim.
- `:58` — `getUserByToken`: kiểm Map và expiresAt; đọc lại user, chặn account DISABLED. `logout` xóa key của phiên.
- Không có nạp session Map từ DB khi tạo AuthService mới. Restart tiến trình/new instance làm token cũ không hợp lệ; vẫn giữ tài khoản trong DB.
- `mobile/src/services/auth-storage.ts` dùng SecureStore, nhưng lưu ở máy không khôi phục Map BE. Hai instance BE không chia sẻ session mặc định.

**Tác động:** deploy/restart có thể yêu cầu đăng nhập lại; không chẩn đoán đây tự động là lỗi FE/VNPay. Không quảng bá JWT, Supabase Auth hoặc persistent session/refresh token khi source chưa có.

**Sửa tài liệu:** mục 4 hiện đúng, giữ nguyên. Thêm rõ nếu cần:

> Đây là token opaque, TTL tuyệt đối 8 giờ kể từ tạo phiên; đọc API không gia hạn TTL. Token phía client còn lưu không đồng nghĩa server còn phiên. Nhiều instance cần session store chung/sticky strategy trước khi bảo đảm đăng nhập ổn định.

Unit auth hiện có kiểm đăng ký/role, sai credentials, logout, disabled và hết hạn 8 giờ. Restart deployment thật chưa thử.

## 7. Recurring billing có scheduler không?

**Nhãn:** VERIFIED về trigger tại activation; INCOMPLETE ở tài liệu; NOT TESTED trên deployment.

**File/hàm và bằng chứng:**

- `BE/src/modules/appointments/appointments.service.ts:184` — `activateContracts`: đổi đủ contracts READY_FOR_HANDOVER sang ACTIVE, đủ units sang OCCUPIED, rồi **gọi `billing.ensureRecurringInvoices` tại dòng 201 trong cùng transaction**.
- `AppointmentsService.completeHandover` gọi activate khi đã tới ngày thuê; `activateDueHandovers` gọi khi nhận chìa sớm và ngày thuê đến. Timer onModuleInit chạy 30 giây và một lần lúc start.
- `BE/src/modules/billing/billing.service.ts:81`: vòng for 2…M tạo **toàn bộ kỳ còn lại ngay ở thời điểm activation**, dueAt bằng đầu kỳ, không đợi đến từng tháng mới tạo.
- `billing.service.ts:535` — `backfillRecurringInvoices` phục hồi cho các reservation đã active; `BE/src/scripts/backfill-recurring-invoices.ts:9` gọi từ script thủ công/package script.
- Tìm callsites ngoài test/generated chỉ thấy activation và backfill. Không thấy `ScheduleModule`, `@Cron` hoặc timer phát hành recurring hằng tháng trong BE.

**Tác động:** source có tự tạo recurring cho activation thành công; không đúng nếu nói “recurring hoàn toàn thủ công”, cũng không đúng nếu nói “có job tự phát hành mỗi tháng”. Hóa đơn tương lai có thể hiện ngay. Timer trong process chỉ chạy khi BE đang chạy; chưa xác minh Render/version/uptime.

**Sửa tài liệu:** thay đoạn thứ hai mục 9 bằng:

> Khi activation đủ tất cả contract, BE tự tạo upfront recurring chu kỳ 2…M của hợp đồng MONTHLY/PAY_MONTHLY trong transaction. Không có monthly issuance cron. Nhận chìa sớm đi qua activation sweep 30 giây khi tới ngày thuê. Script backfill chỉ dùng khi chủ động chạy đúng môi trường. Chưa xác minh lịch hoạt động trên Render.

## 8. Role và chuyển trạng thái hợp lệ

**Nhãn:** VERIFIED về guard/source kiểm tra chính; NOT TESTED toàn bộ transition với DB/UI thật.

**File/hàm và bằng chứng:**

- `BE/src/modules/auth/roles.guard.ts:10` — `canActivate`: namespace customer/staff/manager/admin phải đúng role. Metadata rộng `@Roles('MANAGER','ADMIN')` trong controller cũ không tự cho Admin dùng `/manager/...`.
- `roles.guard.ts:16`: `ManagerAssignment` chỉ POST/PATCH, role MANAGER, namespace manager. `StaffWorkflow`/`StaffLookup` chỉ cho Staff ở `/staff/management`, hoặc Manager GET theo điều kiện; lookup Staff chỉ GET.
- `BE/src/modules/support/manager-support.controller.ts:12`: resolve Manager có `@ManagerAssignment`, không bị nhánh StaffWorkflow chặn như lỗi cũ. `SupportService.resolveManager` đi qua transition với vai trò Manager và đòi ESCALATED.
- `BE/src/modules/maintenance/manager-maintenance.controller.ts:51` và `:57`: verify/reject-verification có `@ManagerAssignment`; service `verify`/`rejectVerification` ở `maintenance.service.ts:109`/`:129` đòi AWAITING_VERIFICATION.
- Service vẫn có các check role lịch sử cho ADMIN; quyền HTTP hiệu lực còn bị guard giới hạn. Không trình bày service check rộng như quyền sử dụng thực sự trên portal.

| Luồng | Quy tắc source tiêu biểu |
|---|---|
| Booking | Customer tạo; tự confirm khi đủ; thao tác vận hành Staff dùng alias; CONFIRMED cần allocation đầy đủ |
| Support | OPEN/ASSIGNED theo phân công; Staff được giao → IN_PROGRESS → RESOLVED hoặc ESCALATED; Manager resolve ESCALATED |
| Maintenance | OPEN → IN_PROGRESS bởi Staff được giao → AWAITING_VERIFICATION; Manager → COMPLETED hoặc trả lại IN_PROGRESS |
| Appointment | Customer đủ điều kiện tạo thẳng CONFIRMED; Staff hoàn tất đúng giờ; ACTIVE chỉ khi tới ngày thuê và đủ điều kiện |
| Renewal | PENDING → APPROVED_PENDING_PAYMENT tự động/Staff theo điều kiện; ký phụ lục + thu đủ khoản cần thiết mới COMPLETED |
| Transfer | ACTIVE contract/OCCUPIED source; REQUESTED → APPROVED/REJECTED → COMPLETED sau chuyển thực tế; kiểm kho đích cùng loại |
| Return | Staff kiểm tra/trả thực tế; Manager quyết định nhánh trả sớm và xử lý tiền cọc |
| Payment | Customer không tự ghi Payment; Manager xác minh thủ công; VNPay IPN hợp lệ đi đường thu tự động |
| Admin | Quản lý tài khoản theo controller; không dùng role Admin làm quyền vận hành tất cả |

**Tác động:** không có căn cứ giữ kết luận cũ “Manager bị chặn vĩnh viễn ở resolve/verify” cho source hiện tại. Tuy nhiên enum không phải state machine cho phép nhảy tùy ý; có guard và service, trạng thái phải đúng.

**Sửa tài liệu:** mục 3/13 nhìn chung đúng. Bổ sung ví dụ ManagerAssignment là marker ngoại lệ cho **resolve/nghiệm thu**, không chỉ có nghĩa phân công. Phụ lục A là metadata route, không thay kiểm chứng quyền endpoint thực. Ghi rõ chưa E2E toàn bộ transition.

## 9. VNPay 5 phút và Reservation 24 giờ

**Nhãn:** VERIFIED; NOT TESTED độ trễ/timing trên deployment.

**File/hàm và bằng chứng:**

- `BE/src/modules/billing/online-payment.service.ts:9`: `ONLINE_PAYMENT_TTL_MS=5*60_000`; create/getCustomerStatus dùng TTL này để nhận diện EXPIRED.
- `BE/src/modules/billing/vnpay.service.ts:23`: `vnp_ExpireDate = createdAt + 5 phút`, không còn URL provider 15 phút trong source đang kiểm.
- `BE/src/modules/booking/booking.service.ts:18`: `AUTOMATIC_RESERVATION_HOLD_MS=24*60*60_000`; `confirmReservation:537` gán expiresAt bằng thời điểm confirm + 24 giờ.
- `booking.service.ts:568` — `expireUnpaidAutomaticReservations`: chọn CONFIRMED hết hạn, INITIAL chưa thu tiền và không có transaction PENDING mới trong cửa sổ 5 phút bảo vệ; giải phóng allocation, hủy invoice/contract tương ứng. `onModuleInit` quét mỗi 60 giây.
- `OnlinePaymentService.processIpn`: local EXPIRED vẫn có thể được xử lý success nếu đơn/hóa đơn đủ điều kiện. Đơn hết hạn không được tự hồi sinh; tạo reconciliation khi nhận success hợp lệ.

**Tác động:** đóng tab/hết phiên VNPay không hủy đơn ngay. Có thể thử lại khi đơn còn hạn; đơn có khoản đã thu hoặc phiên bảo vệ không bị quét như đơn chưa thu. Deadline và lúc sweep thực thi là hai thời điểm khác nhau.

**Sửa tài liệu:** mục 6/9/20 hiện đúng, giữ nguyên. Nếu nói “5 phút tự hủy Reservation” thì **INCORRECT**; phải ghi:

> 5 phút là phiên online; 24 giờ là hạn giữ đơn tự xác nhận. Expiration sweep còn kiểm trạng thái thu tiền và phiên đang xử lý, không hủy vô điều kiện đúng từng giây.

## 10. Mobile: chức năng thật, màn dùng chung và redirect

**Nhãn:** VERIFIED về cấu trúc source; INCOMPLETE nếu coi số file màn là số chức năng; NOT TESTED mọi action native/BE đầu-cuối.

**File/hàm và bằng chứng:**

- `mobile/src/app/customer/booking.tsx` gửi API availability/unit-map/reservations, không chỉ mock UI. `mobile/src/portals/invoice-payment.tsx` kết nối cấu hình, thông báo chuyển khoản và OnlinePayment.
- `mobile/src/portals/online-payment.tsx:54`: poll GET `/customer/online-payments/:id`; `open` ở dòng 80 trở đi POST phiên rồi `WebBrowser.openBrowserAsync`. Poll dùng AppState; chưa có native payment callback deep-link route xử lý đầy đủ. Sử dụng scheme trong app.json không tự chứng minh đã có luồng đó.
- `mobile/src/app/staff/[resource]/index.tsx` chọn ResourceList hoặc PortalList; `mobile/src/app/manager/[resource]/index.tsx` export ResourceList. Cần cả `operations/model.ts`, `portals/resources.ts`, guard và API path mapper để xác định resource hợp lệ. Có route động không cho phép mọi resource.
- `mobile/src/app/admin/settings.tsx:2` redirect `/admin`; `roles.tsx`/`account-status.tsx` redirect `/admin/users`; `assignments.tsx`/`activity.tsx` redirect `/admin`; `admin/facility/_layout.tsx` redirect toàn cây.
- `mobile/src/components/bottom-nav.tsx:34` vẫn có tab Cài đặt trỏ `/admin/settings`. **Tab có UI nhưng không có settings workflow phía sau.**
- `mobile/src/components/storage-yard.tsx` tạo bố cục minh họa từ units theo nhóm; không dùng hình học khảo sát để vẽ nhà/sân theo thực địa.
- Phụ lục B có 57 file màn đã loại _layout; một số là redirect, còn cây facility có parent redirect dù file con vẫn chứa export component. Không đếm file con này như luồng Admin tới được.

**Tác động:** “mobile đủ mọi chức năng như web/57 chức năng hoạt động” không được chứng minh. Có nhiều API và form thật, nhưng còn redirect, khác UI và phụ thuộc cấu hình dịch vụ/native.

**Sửa tài liệu:** mục 16/phụ lục B ghi rõ:

> 57 là số file route/màn được liệt kê, không phải số chức năng đã test. Các route dưới admin/facility bị chặn bởi parent redirect; settings và các alias được đánh dấu riêng. Luồng VNPay mở browser/poll BE chưa tự quay về native hoàn chỉnh. Chưa nghiệm thu tất cả action bốn role trên Android/iOS.

Mục 20 đã nêu tab Cài đặt chưa thật, giữ cảnh báo đó thay vì bỏ nó sau đợt làm đẹp UI.

## Kết quả test an toàn trong lượt này

| Lệnh/kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| `BE: npm run test:unit` | **24 file / 130 test đạt** | Chọn đúng các suite package script; mock/unit, không chạy `npm test` toàn bộ vì có suite integration kết nối DB |
| 6 test tạm `.source-verification.spec.ts` | **6/6 đạt** | HMAC với merchant mismatch; bank destination/reference; thiếu reference; snapshot exact-unit; count/ID trùng; 2 contract/1 INITIAL/2 recurring bằng mock |
| Source schema + migration + callsite | Đã đối chiếu | Không xác nhận Prisma migration đã apply trong DB thật |
| VNPay merchant/deployed logs/QueryDR production | **NOT TESTED** | Không dùng credential, không gửi callback giả vào production |
| Native exact-unit và mọi role/action | **NOT TESTED đầu-cuối trong lượt này** | Không tạo reservation/payment thật |

Lưu ý: test tái hiện thiếu merchant check **đạt** nghĩa là đã xác nhận hành vi hiện tại còn thiếu kiểm tra, không có nghĩa lỗ hổng đã được sửa. Tương tự bank reference khác hoa/thường là hành vi quan sát, không kết luận quy tắc reference từng ngân hàng.

File test tạm do lượt audit tạo đã được gỡ sau khi chạy; không đổi service, guard, schema hoặc migration. Bản tổng hợp gốc giữ nguyên để xem sai lệch trước. Báo cáo này là tài liệu mới; không deploy/push/commit hoặc sửa payment production.

## Thứ tự xử lý đề nghị

1. VNPay: QueryDR có validation đầy đủ và xử lý idempotent/late payment; bổ sung kiểm merchant riêng; kiểm chứng cấu hình IPN và commit đang deploy bằng quyền truy cập phù hợp.
2. Kiểm chứng migration dedup đã apply ở môi trường mục tiêu theo quy trình nhóm; thống nhất reference/cách đối chiếu legacy, không tự backfill các giao dịch lịch sử khi chưa đủ căn cứ.
3. Sửa nội dung tài liệu về một loại/1–3 unit, cardinality hóa đơn và recurring upfront; không cần đổi nghiệp vụ nếu đó là chính sách nhóm muốn.
4. Test E2E chọn unit và cạnh tranh cùng unit trên DB thử cô lập; test chuyển khoản trực tiếp vs duyệt submission dùng cùng reference với unique index thật.
5. Bỏ shortcut Admin settings hoặc triển khai chức năng được đặc tả; hoàn thành test action bốn role, không dùng số màn/bundle build làm bằng chứng nghiệp vụ.
