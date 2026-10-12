import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ClaimGuestBookingDto, CreateGuestBookingRequestDto, VerifyGuestBookingDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { GuestBookingService } from './guest-booking.service.js';

@Controller()
@ApiTags('Guest Booking')
export class GuestBookingController {
  constructor(private readonly service: GuestBookingService) {}

  @Post('guest/booking-requests')
  @ApiOperation({ summary: 'Tạo guest booking cần xác minh email', description: 'Public. Backend tự kiểm tra availability và pricing; chưa giữ unit, chưa tạo Reservation/Contract/Invoice/Payment.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'guest-booking-20261012-001' })
  @ApiBody({ type: CreateGuestBookingRequestDto })
  @ApiCreatedResponse({ description: 'PENDING_VERIFICATION. Production không trả claim token.' })
  @ApiBadRequestResponse({ description: 'Payload hoặc Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({ description: 'Không còn đủ kho hoặc khóa idempotency xung đột.' })
  create(@Body() body: Record<string, unknown>, @Headers('idempotency-key') key?: string) { return this.service.create(body, key); }

  @Post('guest/booking-requests/verify')
  @ApiOperation({ summary: 'Xác minh email bằng claim token dùng một lần', description: 'Public. bookingCode không đủ để xác minh.' })
  @ApiBody({ type: VerifyGuestBookingDto })
  @ApiOkResponse({ description: 'PENDING_VERIFICATION → VERIFIED.' })
  @ApiBadRequestResponse({ description: 'Token không hợp lệ.' })
  @ApiConflictResponse({ description: 'Token hết hạn hoặc booking không còn claimable.' })
  verify(@Body() body: Record<string, unknown>) { return this.service.verify(body); }

  @Post('customer/booking-requests/:bookingCode/claim')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Customer nhận booking đã xác minh', description: 'Email Customer phải khớp. Claim thành công tự CONFIRMED, allocate unit, tạo Contract PENDING_PAYMENT và INITIAL Invoice OPEN.' })
  @ApiBody({ type: ClaimGuestBookingDto })
  @ApiCreatedResponse({ description: 'Guest booking CLAIMED và Reservation sẵn sàng thanh toán.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu/sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Không phải CUSTOMER hoặc email không khớp.' })
  @ApiConflictResponse({ description: 'BOOKING_NOT_VERIFIED, BOOKING_QUOTE_CHANGED hoặc REQUESTED_STORAGE_NO_LONGER_AVAILABLE.' })
  claim(@Param('bookingCode') bookingCode: string, @Req() request: AuthenticatedRequest) { return this.service.claim(bookingCode, request.user!); }
}
