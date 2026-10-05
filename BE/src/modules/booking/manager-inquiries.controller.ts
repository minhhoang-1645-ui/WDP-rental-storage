import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ManagerInquiryUpdateRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { BookingService } from './booking.service.js';

@Controller('manager/inquiries')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Inquiry')
@ApiBearerAuth('bearerAuth')
export class ManagerInquiriesController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu cho Manager', description: 'MANAGER or ADMIN only. Theo contract hiện tại, danh sách gồm cả Contact Inquiry và Reservation, phân biệt bằng requestType.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Danh sách có phân trang.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ id: 'WDPQ-2026-AB12CD34', reference: 'WDPQ-2026-AB12CD34', requestType: 'INQUIRY', customer: { fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000' }, product: { id: 'sm-b12', name: 'Kho nhỏ B12' }, quantity: 1, startDate: '2026-11-01', endDateExclusive: '2027-02-01', status: 'PENDING_CONTACT', quote: { status: 'QUOTE_REQUIRED', grandTotal: null } }] } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  list(@Query('page') pageInput = '1', @Query('limit') limitInput = '20') {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('page phải từ 1–100000, limit phải từ 1–100.');
    }
    return this.bookingService.listManagerInquiries(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu cho Manager', description: 'MANAGER or ADMIN only. Nhận Contact Inquiry hoặc Reservation reference.' })
  @ApiParam({ name: 'id', example: 'WDPQ-2026-AB12CD34' })
  @ApiOkResponse({ description: 'Yêu cầu, snapshot availability/quote, ghi chú và trạng thái xử lý.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy yêu cầu.' })
  get(@Param('id') id: string) {
    return this.bookingService.getManagerInquiry(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật trạng thái xử lý', description: 'MANAGER or ADMIN only. Dùng tập status tương ứng requestType; optional internalNotes được lưu làm ghi chú nội bộ.' })
  @ApiParam({ name: 'id', example: 'WDPQ-2026-AB12CD34' })
  @ApiBody({ type: ManagerInquiryUpdateRequestDto, examples: { contacted: { summary: 'Đã liên hệ Inquiry', value: { status: 'CONTACTED', internalNotes: 'Đã gọi khách, chờ xác nhận ngày bắt đầu.' } }, cancelReservation: { summary: 'Hủy Reservation', value: { status: 'CANCELLED', internalNotes: 'Khách yêu cầu hủy.' } } } })
  @ApiOkResponse({ description: 'Yêu cầu đã cập nhật.' })
  @ApiBadRequestResponse({ description: 'Status không hợp lệ cho loại yêu cầu.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy yêu cầu.' })
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.bookingService.updateManagerInquiry(id, body, request.user!);
  }
}
