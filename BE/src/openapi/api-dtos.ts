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

export class CreateAdminUserDto {
  @ApiProperty({ example: 'WDP Staff Demo', minLength: 2, maxLength: 120 }) fullName!: string;
  @ApiProperty({ example: 'staff.demo@example.test', format: 'email' }) email!: string;
  @ApiProperty({ example: '0900000011' }) phone!: string;
  @ApiProperty({ format: 'password', example: 'replace-with-secure-password', minLength: 8 }) password!: string;
  @ApiProperty({ enum: ['STAFF', 'MANAGER'], example: 'STAFF' }) role!: 'STAFF' | 'MANAGER';
}

export class UpdateAccountStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'], example: 'DISABLED' }) accountStatus!: 'ACTIVE' | 'DISABLED';
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

  @ApiProperty({ type: [String], example: [], description: 'Compatibility field. Dùng services để chọn add-on và số lượng.' })
  addonIds!: string[];

  @ApiPropertyOptional({ type: 'array', items: { type: 'object', properties: { serviceId: { type: 'string' }, quantity: { type: 'integer' }, serviceStartDate: { type: 'string', format: 'date' }, serviceEndDate: { type: 'string', format: 'date' } } }, description: 'PURCHASE không cần ngày. RENTAL DAY/MONTH cần khoảng ngày nằm trong kỳ thuê; MONTH phải là số tháng lịch chính xác.', example: [{ serviceId: 'service-id', quantity: 1, serviceStartDate: '2026-11-01', serviceEndDate: '2026-11-03' }] })
  services?: Array<Record<string, unknown>>;

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

  @ApiPropertyOptional({ type: 'array', items: { type: 'object', properties: { serviceId: { type: 'string' }, quantity: { type: 'integer' }, serviceStartDate: { type: 'string', format: 'date' }, serviceEndDate: { type: 'string', format: 'date' } } }, example: [{ serviceId: 'service-id', quantity: 1, serviceStartDate: '2026-11-01', serviceEndDate: '2026-11-03' }] })
  services?: Array<Record<string, unknown>>;
}

export class GuestInquiryRequestDto extends BookingAvailabilityRequestDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Họ tên người cần liên hệ.' })
  fullName!: string;

  @ApiProperty({ example: 'customer@example.test', format: 'email' })
  email!: string;

  @ApiProperty({ example: '0900000000' })
  phone!: string;
}

export class CreateGuestBookingRequestDto {
  @ApiProperty({ example: 'Nguyen Van A', minLength: 2, maxLength: 120 }) fullName!: string;
  @ApiProperty({ example: 'customer@example.test', format: 'email' }) email!: string;
  @ApiProperty({ example: '0900000000', minLength: 8, maxLength: 25 }) phone!: string;
  @ApiProperty({ example: 'sm-b12' }) storageTypeId!: string;
  @ApiProperty({ example: 1, minimum: 1, maximum: 3 }) quantity!: number;
  @ApiProperty({ example: '2026-11-01', format: 'date' }) startDate!: string;
  @ApiProperty({ example: '2027-02-01', format: 'date', description: 'Ngày kết thúc exclusive.' }) endDate!: string;
  @ApiProperty({ enum: ['PAY_MONTHLY', 'PREPAID'], example: 'PREPAID' }) paymentPlan!: 'PAY_MONTHLY' | 'PREPAID';
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', properties: { serviceId: { type: 'string' }, quantity: { type: 'integer' }, serviceStartDate: { type: 'string', format: 'date' }, serviceEndDate: { type: 'string', format: 'date' } } }, example: [{ serviceId: 'shelf-id', quantity: 1, serviceStartDate: '2026-12-01', serviceEndDate: '2027-02-01' }, { serviceId: 'padlock-id', quantity: 1 }] }) services?: Array<Record<string, unknown>>;
}

export class CreateAdditionalServiceDto { @ApiProperty({ example: 'SHELF_STANDARD' }) code!: string; @ApiProperty({ example: 'Kệ tiêu chuẩn' }) name!: string; @ApiPropertyOptional({ example: 'Kệ tái sử dụng cho kho.' }) description?: string; @ApiProperty({ enum: ['PURCHASE', 'RENTAL'], example: 'RENTAL' }) kind!: string; @ApiProperty({ enum: ['ONE_TIME', 'DAY', 'MONTH'], example: 'MONTH', description: 'PURCHASE bắt buộc ONE_TIME; RENTAL dùng DAY hoặc MONTH.' }) billingUnit!: string; @ApiProperty({ example: 120000, minimum: 1 }) unitPrice!: number; @ApiPropertyOptional({ example: 'https://cdn.example.test/shelf.jpg' }) imageUrl?: string | null; @ApiPropertyOptional({ example: 'Storage Shelf - hình minh họa sản phẩm' }) imageAlt?: string | null; @ApiPropertyOptional({ example: true }) isActive?: boolean; }
export class UpdateAdditionalServiceDto { @ApiPropertyOptional({ example: 'Kệ tiêu chuẩn' }) name?: string; @ApiPropertyOptional({ nullable: true }) description?: string | null; @ApiPropertyOptional({ enum: ['PURCHASE', 'RENTAL'] }) kind?: string; @ApiPropertyOptional({ enum: ['ONE_TIME', 'DAY', 'MONTH'] }) billingUnit?: string; @ApiPropertyOptional({ example: 120000, minimum: 1 }) unitPrice?: number; @ApiPropertyOptional({ nullable: true, example: 'https://cdn.example.test/shelf.jpg' }) imageUrl?: string | null; @ApiPropertyOptional({ nullable: true, example: 'Storage Shelf - hình minh họa sản phẩm' }) imageAlt?: string | null; @ApiPropertyOptional({ example: false }) isActive?: boolean; }
export class UpdateAdditionalServiceInventoryDto { @ApiPropertyOptional({ example: 50, minimum: 0, description: 'Chỉ PURCHASE. Không được thấp hơn số lượng RESERVED.' }) stockOnHand?: number; @ApiPropertyOptional({ example: 6, minimum: 0, description: 'Chỉ RENTAL. Không được thấp hơn peak booking chồng lấp.' }) rentalCapacity?: number; }

export class VerifyGuestBookingDto {
  @ApiProperty({ example: 'one-time-token-from-email', description: 'Token bí mật từ secure claim link; không dùng bookingCode.' }) token!: string;
}

export class ClaimGuestBookingDto {}

export class CreateOnlinePaymentDto {
  @ApiPropertyOptional({ example: 'NCB', description: 'Mã ngân hàng tùy chọn do UI chọn; không ảnh hưởng số tiền.' }) bankCode?: string;
  @ApiPropertyOptional({ enum: ['vn', 'en'], example: 'vn' }) locale?: 'vn' | 'en';
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

  @ApiPropertyOptional({ enum: ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'], example: 'CUSTOMER_DAMAGE', description: 'Bắt buộc với ISSUE_FOUND; Staff chỉ phân loại quan sát, không duyệt charge.' })
  issueType?: string;

  @ApiPropertyOptional({ example: 'Kho sạch, khóa và cửa hoạt động bình thường.', maxLength: 2000 })
  conditionNote?: string;

  @ApiPropertyOptional({ example: 'Phát hiện hư hỏng cần Manager xử lý riêng.', maxLength: 2000, description: 'Bắt buộc khi result là ISSUE_FOUND.' })
  issueNote?: string;
}

export class DepositSettlementIssueReviewDto {
  @ApiProperty({ example: 'inspection-id' })
  inspectionId!: string;

  @ApiProperty({ enum: ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'], example: 'CUSTOMER_DAMAGE' })
  issueType!: string;

  @ApiProperty({ example: 800000, minimum: 0, description: 'Số nguyên VND. Lost key bắt buộc 200000; normal wear/facility fault bắt buộc 0.' })
  approvedChargeAmount!: number;

  @ApiPropertyOptional({ example: 'Approved repair quotation for damaged door panel.', maxLength: 2000 })
  reason?: string;
}

export class ReviewDepositSettlementRequestDto {
  @ApiProperty({ type: [DepositSettlementIssueReviewDto] })
  issues!: DepositSettlementIssueReviewDto[];

  @ApiPropertyOptional({ example: 'Reviewed against inspection report.', maxLength: 2000 })
  note?: string;
}

export class RefundDepositRequestDto {
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH'], example: 'BANK_TRANSFER' })
  method!: 'BANK_TRANSFER' | 'CASH';

  @ApiProperty({ example: 'REFUND-20261009-001', maxLength: 200, description: 'Business reference only; không chứa bank credentials.' })
  reference!: string;

  @ApiPropertyOptional({ example: 'Deposit refund completed.', maxLength: 2000 })
  note?: string;
}

export class CreateMaintenanceRequestDto {
  @ApiProperty({ example: 'storage-unit-id', description: 'Database id của StorageUnit AVAILABLE.' })
  storageUnitId!: string;

  @ApiProperty({ enum: ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'], example: 'FACILITY_EQUIPMENT' })
  category!: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH', default: 'MEDIUM' })
  priority?: string;

  @ApiProperty({ example: 'Climate control is not functioning.', minLength: 3, maxLength: 4000 })
  description!: string;
}

export class AssignMaintenanceRequestDto {
  @ApiProperty({ example: 'staff-user-id', description: 'User tồn tại và có role STAFF.' })
  staffUserId!: string;
}

export class UpdateMaintenancePriorityDto {
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' })
  priority!: string;
}

export class CompleteMaintenanceWorkDto {
  @ApiProperty({ example: 'Replaced damaged lock and tested access successfully.', minLength: 3, maxLength: 4000 })
  workNote!: string;
}

export class VerifyMaintenanceRequestDto {
  @ApiPropertyOptional({ example: 'Repair verified. Unit is ready for rental.', maxLength: 4000 })
  note?: string;
}

export class RejectMaintenanceVerificationDto {
  @ApiProperty({ example: 'Lock still does not engage reliably. Please inspect again.', minLength: 3, maxLength: 4000 })
  note!: string;
}

export class CreateSupportRequestDto {
  @ApiProperty({ example: 'WDP-2026-AB12CD34' }) reservationId!: string;
  @ApiPropertyOptional({ example: 'contract-id' }) rentalContractId?: string;
  @ApiPropertyOptional({ example: 'storage-unit-id' }) storageUnitId?: string;
  @ApiPropertyOptional({ example: 'invoice-id', description: 'Đặc biệt hữu ích cho PAYMENT_SUPPORT.' }) invoiceId?: string;
  @ApiProperty({ enum: ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'PAYMENT_SUPPORT', 'STORED_ITEM_CONCERN', 'OTHER'], example: 'ACCESS_CODE_ISSUE' }) category!: string;
  @ApiProperty({ example: 'Cannot access my unit', minLength: 3, maxLength: 200 }) subject!: string;
  @ApiProperty({ example: 'My access credential is being rejected. No secret code is included.', minLength: 3, maxLength: 4000, description: 'Không gửi access code hoặc credential bí mật.' }) description!: string;
}
export class AssignSupportRequestDto { @ApiProperty({ example: 'staff-user-id' }) staffUserId!: string }
export class UpdateSupportPriorityDto { @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' }) priority!: string }
export class ResolveSupportRequestDto {
  @ApiProperty({ enum: ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'MANAGER_RESOLVED', 'TRANSFER_RECOMMENDED', 'NO_ACTION_REQUIRED', 'OTHER'], example: 'ACCESS_RESTORED' }) resolutionType!: string;
  @ApiProperty({ example: 'Access credential was revalidated and tested successfully.', minLength: 3, maxLength: 4000 }) resolutionNote!: string;
}
export class EscalateSupportRequestDto { @ApiProperty({ example: 'Unit door cannot be secured safely. Manager review required.', minLength: 3, maxLength: 4000 }) reason!: string }

export class CreateTransferDto {
  @ApiProperty({ example: 'WDP-2026-AB12CD34-C01', description: 'ACTIVE RentalContract id hoặc contractCode.' }) rentalContractId!: string;
  @ApiProperty({ enum: ['UNIT_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'OPERATIONAL_RELOCATION', 'OTHER'], example: 'UNIT_ISSUE' }) reason!: string;
  @ApiPropertyOptional({ example: 'support-request-id', description: 'Nếu có, phải thuộc cùng Reservation.' }) supportRequestId?: string;
}

export class ApproveTransferDto {
  @ApiProperty({ example: 'destination-storage-unit-id', description: 'Unit AVAILABLE cùng StorageType và không có confirmed allocation trùng kỳ.' }) toStorageUnitId!: string;
}
