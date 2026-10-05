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
    description: 'Inquiry: PENDING_CONTACT, CONTACTED, IN_REVIEW, CLOSED, CANCELLED. Reservation: PENDING, CANCELLED, EXPIRED.',
  })
  status!: string;

  @ApiPropertyOptional({ example: 'Đã gọi khách, chờ xác nhận ngày bắt đầu.', maxLength: 2000 })
  internalNotes?: string;
}
