import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ActiveRentalsService } from './active-rentals.service.js';

@Controller('customer/rentals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Active Rental')
@ApiBearerAuth('bearerAuth')
export class CustomerActiveRentalsController {
  constructor(private readonly rentals: ActiveRentalsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách Active Rental của Customer', description: 'Một Reservation có nhiều ACTIVE contracts vẫn hiển thị thành một rental group.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'overdue', required: false, enum: ['true', 'false'], description: 'Lọc trạng thái derived; không thay đổi Contract/Unit.' })
  @ApiOkResponse({ schema: { examples: {
    active: { summary: 'ACTIVE trước effective end date', value: { page: 1, limit: 20, total: 1, items: [{ reservationReference: 'WDP-2026-AB12CD34', effectiveEndDate: '2027-08-10', isOverdue: false, overdueSince: null, rentalState: 'ACTIVE' }] } },
    overdue: { summary: 'OVERDUE nhưng Contract ACTIVE và Unit OCCUPIED', value: { page: 1, limit: 20, total: 1, items: [{ reservationReference: 'WDP-2026-AB12CD34', effectiveEndDate: '2026-10-01', isOverdue: true, overdueSince: '2026-10-01', rentalState: 'OVERDUE', contracts: [{ status: 'ACTIVE', unit: { unitCode: 'MD-E06-001', status: 'OCCUPIED' } }] }] } },
  } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20', @Query('overdue') overdue?: string) {
    return this.rentals.listCustomerRentals(request.user!.id, { ...this.pagination(page, limit), ...this.overdue(overdue) });
  }

  @Get(':reservationId')
  @ApiOperation({ summary: 'Chi tiết Active Rental của Customer', description: 'Gồm contracts, units, historical pricing, invoices, payments và billing summary.' })
  @ApiParam({ name: 'reservationId', example: 'WDP-2026-AB12CD34' })
  @ApiOkResponse({ description: 'Active Rental thuộc Customer.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại, không ACTIVE hoặc không thuộc Customer.' })
  get(@Req() request: AuthenticatedRequest, @Param('reservationId') id: string) {
    return this.rentals.getCustomerRental(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }

  private overdue(value: string | undefined) {
    if (value === undefined || value === '') return {};
    if (!['true', 'false'].includes(value)) throw new BadRequestException('overdue phải là true hoặc false.');
    return { overdue: value === 'true' };
  }
}
