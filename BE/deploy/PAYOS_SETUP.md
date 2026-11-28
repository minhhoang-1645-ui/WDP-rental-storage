# Triển khai payOS Pay-in

NestBox dùng SDK Node.js chính thức `@payos/node` 2.0.6. [Tài liệu SDK](https://payos.vn/docs/sdks/back-end/node/) · [Tài liệu API](https://payos.vn/docs/api/)

## Local và Render

- Thêm `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` vào môi trường Backend. Local dùng `BE/.env`. Render dùng Environment của dịch vụ Backend. Đặt `FRONTEND_PUBLIC_URL` là URL Web mà khách có thể truy cập qua HTTPS. Giữ credentials ở Backend.
- Giữ `PAYOS_ENABLED=false` và `PAYOS_CUTOVER=false` trong giai đoạn chuẩn bị. Khi kiểm tra cầu nối Vercel từ local, dùng `FRONTEND_PUBLIC_URL=https://wdp-rental-storage-q6xp.vercel.app`. Kiểm tra migration `20261127000600_payos_payin` theo quy trình release của repo. Triển khai Web return bridge trước khi tạo link thật.
- Return URL và cancel URL dùng cùng trang `/customer/payments/payos-return/mobile` cho Mobile hoặc `/customer/payments/payos-return` cho Web. URL mang định danh hóa đơn/phiên NestBox. Mobile mở lại qua `wdp-storage://customer/payment-result`. App tra kết quả từ Backend.
- Trong bảng điều khiển kênh thanh toán tại my.payos.vn, đăng ký webhook `https://<backend-public-host>/api/payments/payos/webhook`. Xác nhận mẫu đăng ký trả HTTP 200. Duy trì VNPay IPN và cấu hình cũ để nhận callback đến muộn. [Webhook payOS](https://payos.vn/docs/du-lieu-tra-ve/webhook/)
- Khi đã nghiệm thu quy trình, bật cùng lúc `PAYOS_CUTOVER=true` và `PAYOS_ENABLED=true`. SETTLEMENT giữ kênh tiền mặt và các hồ sơ chuyển khoản lịch sử đã tồn tại. Thanh toán ghi nhận thực tế dùng số dư hóa đơn.

## Kiểm tra và khôi phục

- Kiểm thử tự động dùng SDK fixture và PostgreSQL cách ly. Khi đã có phép thử thật, chọn hóa đơn thử giá trị nhỏ do hệ thống tạo, dùng kênh đã đăng ký và đối chiếu số dư, tham chiếu giao dịch ngân hàng, bảng Khoản thu và Báo cáo BOM. Kiểm tra Mobile trở lại được hóa đơn. Thực hiện hoàn thử qua quy trình thủ công được phép nếu cần.
- Đọc `GET /api/customer/online-payments/:transactionId` bằng tài khoản sở hữu phiên. Backend dùng SDK kiểm tra lại link và các khoản ngân hàng với giới hạn tần suất. Tạo link bị timeout được kiểm tra lại bằng orderCode đã lưu. Nếu nhà cung cấp chưa trả trạng thái, giữ nguyên phiên và đối chiếu kênh payOS trước khi thu bằng cách khác.
- Nếu webhook nhận lỗi 5xx, kiểm tra DB và gửi lại qua kênh payOS theo khả năng của bảng điều khiển. Một webhook lỗi chữ ký phải bị từ chối. Không gửi lại payload chứa dữ liệu khách qua chat hoặc log.
- Các khoản không khớp được giữ theo từng tham chiếu trong `PayosReceipt`. Manager xem ngoại lệ đã xác định hóa đơn trong phạm vi cơ sở. Khoản chưa xác định giữ ở DB để vận hành tra cứu theo orderCode, link và tham chiếu trên kênh, trước khi xử lý theo quy trình nội bộ.
- Tạm dừng tạo link bằng `PAYOS_ENABLED=false`, giữ `PAYOS_CUTOVER=true`. Giữ migration, credentials, return bridge và webhook trong thời gian xử lý phiên còn hiệu lực hoặc tiền đến muộn. Chỉ mở lại phương thức cũ bằng quyết định cutover riêng sau khi đã đối chiếu các phiên còn lại.
