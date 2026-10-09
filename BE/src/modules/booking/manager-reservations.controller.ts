import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ManagerReservationStatusRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { BookingService } from './booking.service.js';

@Controller('manager/reservations')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Reservation')
@ApiBearerAuth('bearerAuth')
export class ManagerReservationsController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách Reservation', description: 'MANAGER hoặc ADMIN. PENDING không giữ unit; CONFIRMED có allocatedUnits.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Danh sách Reservation có phân trang.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ id: 'WDP-2026-AB12CD34', reference: 'WDP-2026-AB12CD34', requestType: 'RESERVATION', status: 'PENDING', quantity: 1, allocatedUnits: [] }] } } })
  @ApiBadRequestResponse({ description: 'page hoặc limit không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  list(@Query('page') pageInput = '1', @Query('limit') limitInput = '20') {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('page phải từ 1–100000, limit phải từ 1–100.');
    }
    return this.bookingService.listManagerReservations(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết Reservation', description: 'MANAGER hoặc ADMIN. Nhận reservation reference hoặc database id.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34' })
  @ApiOkResponse({ description: 'Reservation cùng customer, quote, availability snapshot và allocatedUnits.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Reservation.' })
  get(@Param('id') id: string) {
    return this.bookingService.getManagerReservation(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Cập nhật trạng thái Reservation',
    description: 'MANAGER hoặc ADMIN. CONFIRMED khóa và cấp đủ unit trong một transaction; nếu không đủ, toàn bộ thao tác rollback và Reservation vẫn PENDING.',
  })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34' })
  @ApiBody({
    type: ManagerReservationStatusRequestDto,
    examples: {
      confirm: { summary: 'Xác nhận và cấp unit', value: { status: 'CONFIRMED' } },
      reject: { summary: 'Từ chối yêu cầu', value: { status: 'REJECTED' } },
      cancel: { summary: 'Hủy yêu cầu', value: { status: 'CANCELLED' } },
      expire: { summary: 'Đánh dấu hết hạn', value: { status: 'EXPIRED' } },
    },
  })
  @ApiOkResponse({ description: 'Reservation sau cập nhật; CONFIRMED trả về allocatedUnits.' })
  @ApiBadRequestResponse({ description: 'Status không hợp lệ.' })
  @ApiConflictResponse({ description: 'Transition không hợp lệ, inventory không đủ hoặc có allocation trùng kỳ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Reservation.' })
  updateStatus(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.bookingService.updateManagerReservationStatus(id, body, request.user!);
  }
}
