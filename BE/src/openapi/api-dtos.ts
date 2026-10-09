import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterRequestDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Họ tên khách hàng (2-120 ký tự).' })
  fullName!: string;

  @ApiProperty({ example: 'customer@example.test', format: 'email' })
  email!: string;

  @ApiProperty({ example: '0900000000', description: 'Số điện thoại 8-25 ký tự.' })
  phone!: string;

  @ApiProperty({ format: 'password', example: 'your-password-here', description: 'Thay bằng mật khẩu của bạn. Public registration luôn tạo role CUSTOMER.' })
  password!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'customer@example.test', format: 'email' })
  email!: string;

  @ApiProperty({ format: 'password', example: 'your-password-here', description: 'Thay bằng mật khẩu của bạn.' })
  password!: string;
}

export class BookingAvailabilityRequestDto {
  @ApiProperty({ example: 'sm-b12', description: 'ID sản phẩm trả về từ GET /api/booking/catalog hoặc GET /api/storage.' })
  productId!: string;

  @ApiProperty({ example: '2026-11-01', format: 'date', description: 'Ngày bắt đầu, không được trước ngày hiện tại.' })
  startDate!: string;

  @ApiProperty({ enum: ['duration', 'dates'], example: 'duration' })
  periodMode!: 'duration' | 'dates';

  @ApiPropertyOptional({ enum: [1, 3, 6, 12], example: 3, description: 'Bắt buộc khi periodMode là duration.' })
  durationMonths?: number;

  @ApiPropertyOptional({ example: '2026-12-15', format: 'date', description: 'Bắt buộc khi periodMode là dates và phải sau startDate.' })
  endDate?: string;

  @ApiProperty({ minimum: 1, maximum: 3, example: 1 })
  quantity!: number;

  @ApiProperty({ example: false, description: 'Chỉ có ý nghĩa khi quantity lớn hơn 1.' })
  adjacencyPreference!: boolean;

  @ApiProperty({ type: [String], example: [], description: 'Hiện phải là mảng rỗng vì WDP chưa duyệt add-on nào.' })
  addonIds!: string[];

  @ApiPropertyOptional({ maxLength: 500, example: 'Cần tư vấn thời gian vào kho.' })
  note?: string;

  @ApiProperty({ enum: ['pay-later', 'pay-now'], example: 'pay-later', description: 'Chỉ pay-later được chấp nhận khi tạo Inquiry hoặc Reservation.' })
  paymentChoice!: 'pay-later' | 'pay-now';

  @ApiProperty({ enum: ['PAY_MONTHLY', 'PREPAID'], example: 'PAY_MONTHLY', description: 'Chính sách giá bắt buộc cho request mới. Không tạo giao dịch thanh toán.' })
  paymentPlan!: 'PAY_MONTHLY' | 'PREPAID';
}

export class PricingQuoteRequestDto {
  @ApiProperty({ example: 'sm-b12' })
  storageTypeId!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  quantity!: number;

  @ApiProperty({ format: 'date', example: '2026-10-10', description: 'Ngày đầu kỳ thuê, inclusive.' })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-10-17', description: 'Ngày kết thúc, exclusive.' })
  endDate!: string;

  @ApiProperty({ enum: ['PAY_MONTHLY', 'PREPAID'], example: 'PAY_MONTHLY' })
  paymentPlan!: 'PAY_MONTHLY' | 'PREPAID';
}

export class GuestInquiryRequestDto extends BookingAvailabilityRequestDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Họ tên người cần liên hệ.' })
  fullName!: string;

  @ApiProperty({ example: 'customer@example.test', format: 'email' })
  email!: string;

  @ApiProperty({ example: '0900000000' })
  phone!: string;
}

export class ManagerInquiryUpdateRequestDto {
  @ApiProperty({
    example: 'CONTACTED',
    description: 'Inquiry: PENDING_CONTACT, CONTACTED, IN_REVIEW, CLOSED, CANCELLED. Compatibility support for Reservation: CONFIRMED, REJECTED, CANCELLED, EXPIRED; prefer PATCH /manager/reservations/:id/status.',
  })
  status!: string;

  @ApiPropertyOptional({ example: 'Đã gọi khách, chờ xác nhận ngày bắt đầu.', maxLength: 2000 })
  internalNotes?: string;
}

export class ManagerReservationStatusRequestDto {
  @ApiProperty({
    enum: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
    example: 'CONFIRMED',
    description: 'PENDING có thể chuyển sang một trong bốn trạng thái này. CONFIRMED chỉ có thể chuyển tiếp sang CANCELLED.',
  })
  status!: 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
}

export class RecordPaymentRequestDto {
  @ApiProperty({ example: 3000000, minimum: 1, description: 'Số VND nguyên, không được vượt balanceDue hiện tại.' })
  amount!: number;

  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH'], example: 'BANK_TRANSFER' })
  method!: 'BANK_TRANSFER' | 'CASH';

  @ApiPropertyOptional({ example: 'BANK-REF-123', maxLength: 200, description: 'Mã tham chiếu giao dịch; không chứa thông tin đăng nhập ngân hàng.' })
  reference?: string;

  @ApiPropertyOptional({ example: 'Đã nhận đợt thanh toán đầu.', maxLength: 2000 })
  note?: string;
}

export class CreateHandoverAppointmentRequestDto {
  @ApiProperty({ example: 'WDP-2026-AB12CD34', description: 'Reservation id hoặc reference thuộc Customer đang đăng nhập.' })
  reservationId!: string;

  @ApiProperty({ example: '2026-11-10T09:30:00+07:00', format: 'date-time', description: 'Phải ở tương lai và không trước Contract startDate.' })
  scheduledAt!: string;

  @ApiPropertyOptional({ example: 'Ưu tiên buổi sáng.', maxLength: 2000 })
  note?: string;
}

export class CompleteHandoverRequestDto {
  @ApiPropertyOptional({ example: 'Đã bàn giao đầy đủ các kho cho khách hàng.', maxLength: 2000 })
  note?: string;
}

export class CreateRenewalRequestDto {
  @ApiProperty({ example: 'WDP-2026-AB12CD34', description: 'Reservation id hoặc reference của Active Rental thuộc Customer.' })
  reservationId!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 120, description: 'Số tháng lịch nguyên; Renewal V1 không hỗ trợ ngày lẻ.' })
  termMonths!: number;

  @ApiProperty({ enum: ['PAY_MONTHLY', 'PREPAID'], example: 'PREPAID', description: 'Kế hoạch thanh toán mới, không tự kế thừa rental cũ.' })
  paymentPlan!: 'PAY_MONTHLY' | 'PREPAID';
}

export class RejectRenewalRequestDto {
  @ApiProperty({ example: 'Kho đã có reservation xác nhận trong khoảng gia hạn.', minLength: 3, maxLength: 2000 })
  reason!: string;
}

export class CreateReturnRequestDto {
  @ApiProperty({ example: 'WDP-2026-AB12CD34', description: 'Reservation id hoặc reference của Active Rental thuộc Customer.' })
  reservationId!: string;

  @ApiPropertyOptional({ example: 'Khách đã dọn hết đồ và sẵn sàng kiểm tra kho.', maxLength: 2000 })
  note?: string;
}

export class UpdateReturnInspectionRequestDto {
  @ApiProperty({ enum: ['PASS', 'ISSUE_FOUND'], example: 'PASS', description: 'PENDING không được gửi từ API cập nhật.' })
  result!: 'PASS' | 'ISSUE_FOUND';

  @ApiPropertyOptional({ example: 'Kho sạch, khóa và cửa hoạt động bình thường.', maxLength: 2000 })
  conditionNote?: string;

  @ApiPropertyOptional({ example: 'Phát hiện hư hỏng cần Manager xử lý riêng.', maxLength: 2000, description: 'Bắt buộc khi result là ISSUE_FOUND.' })
  issueNote?: string;
}
