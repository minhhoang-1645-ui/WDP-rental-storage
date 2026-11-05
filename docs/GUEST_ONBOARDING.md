# Đặt kho qua email và tiếp tục tài khoản

Code mới nối: chọn kho → liên kết email một lần → đặt mật khẩu hoặc đăng nhập ngay tại trang xác minh → tự nhận đơn → chi tiết reservation → ký → thanh toán → bàn giao.

## Các phần thay đổi

- BE: `AccountOnboardingService/Controller` trong GuestBookingModule; xác minh nguyên tử và continuation proof riêng 30 phút, chỉ lưu SHA-256. Context trả email/tóm tắt và nhánh tài khoản chỉ khi có proof hợp lệ. Setup dùng AuthService.register, luôn CUSTOMER, email/họ tên/điện thoại lấy từ booking server. Tài khoản có sẵn phải đăng nhập, không bị thay mật khẩu bởi liên kết booking.
- Reset mật khẩu: token RESET riêng, 30 phút, lưu hash, dùng một lần; cập nhật hash theo chính sách scrypt hiện tại, vô hiệu hóa các reset token khác và phiên đăng nhập trong AuthService sau reset. Phản hồi yêu cầu reset không tiết lộ có tài khoản hay không. Gửi lỗi email cũng giữ phản hồi chung và vô hiệu token không gửi được.
- Rate limit lưu DB theo bucket 15 phút: IP cho create/verify và account endpoints, email cho xác minh/resend/reset; không dùng bộ đếm RAM. Sau reverse proxy có thể nhiều khách chung IP socket; cần cấu hình proxy tin cậy nếu muốn phân biệt IP public, không tự tin X-Forwarded-For.
- Web `/claim-booking`: tự xác minh, email chỉ đọc, đặt/nhập mật khẩu ngay tại chỗ, quên mật khẩu, resend, auto-claim và chuyển tới chi tiết đơn. Lưu continuation ngắn hạn theo thời gian hết hạn để tiếp tục khi reload/đóng trình duyệt; không lưu password. Xóa sau nhận đơn. Lựa chọn wizard được giữ để chọn lại nếu giá/khả dụng thay đổi.
- Mobile `/continue-booking`: nhận token/code/continuation qua scheme `wdp-storage`, lưu continuation trong SecureStore; đặt mật khẩu/đăng nhập bằng cùng API, lưu session qua auth provider hiện có và tự claim. Login có liên kết tới màn tiếp tục/khôi phục. Khi liên kết native không mở được (Expo Go/OS chưa đăng ký scheme), hoàn tất xác minh/tạo tài khoản trên web rồi đăng nhập mobile cùng email; reservation hiện trong danh sách của Customer. Native guest chưa có màn chọn kho công khai riêng; khách chưa đăng nhập chọn kho bằng web hiện có.

## API thêm

POST `/api/guest/account/context`, `/setup`, `/forgot-password`, `/reset-password`, `/resend`. Verify cũ `/api/guest/booking-requests/verify` nay trả bookingCode + continuationToken. Code không phải bằng chứng sở hữu; context/setup cần proof và claim vẫn cần Customer đúng email. Client cũ chỉ dựa bookingCode vẫn có thể đăng nhập/đăng ký rồi claim theo API cũ.

Không đổi PricingService, xác nhận/phân bổ Reservation, snapshot, ký, invoice hay VNPay. Guest verification/setup chưa giữ kho. Claim dùng workflow hiện tại kiểm giá/khả dụng, khóa GuestBookingRequest và transaction Serializable; retry cùng chủ sở hữu trả reservation đã có. Phiên VNPay và hạn giữ Reservation giữ nguyên.

## Bật trên môi trường dùng chung

- Có migration mới `20261105000100_guest_account_onboarding` tạo AccountFlowToken và AccountFlowLimit, chưa apply lên Supabase nhóm. Kiểm tra mọi migration pending trước `npm run prisma:migrate:deploy`, rồi generate/build/restart BE. Deploy web tương ứng. Không chạy db push/reset.
- Dùng EMAIL_PROVIDER/SMTP hoặc Resend hiện có, FRONTEND_PUBLIC_URL (ưu tiên) hoặc FRONTEND_URL đúng tên miền web HTTPS public. Production từ chối localhost. Không có khóa email mới.
- Token đặt lại mật khẩu và booking khác nhau; không gửi mật khẩu qua email. Không log token/body. Không có endpoint lookup email công khai.
- AuthService hiện lưu phiên trong RAM một process; việc revoke/session persistence giữa nhiều instance vẫn chịu giới hạn kiến trúc hiện tại. Không quảng bá đây là hệ thống session phân tán mới.

## Kiểm tra và giới hạn

Test BE mock kiểm one-time/expiry, proof kinds, identity/role, duplicate register, recovery/hash/session revocation, resend/limit và claim ownership/duplicate/price/unavailable/locking. Browser mock kiểm new/existing, email read-only, refresh và auto-claim. Không giả lập callback thành công để ghi tiền. Các kiểm tra này không chứng minh hai request cạnh tranh trên PostgreSQL thật hoặc giao email live.

Cần nghiệm thu sau migration: email thật (đúng domain/expiry/resend), hai request claim đồng thời trên DB test, đổi giá/hết kho, tắt/mở browser, native deep link trên development build và hành trình ký/thanh toán/bàn giao. Không được tuyên bố các bước này đã chạy thành công nếu chưa thực hiện.
