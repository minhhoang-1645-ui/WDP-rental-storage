import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CreateRenewalRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { RenewalsService } from './renewals.service.js';

@Controller('customer/renewals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Renewal')
@ApiBearerAuth('bearerAuth')
export class CustomerRenewalsController {
  constructor(private readonly renewals: RenewalsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo yêu cầu gia hạn Active Rental', description: 'Chụp giá hiện tại thành snapshot bất biến; chưa kéo dài contract, chưa giữ chỗ khi còn PENDING.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'renewal-customer-2027-001' })
  @ApiBody({ type: CreateRenewalRequestDto, examples: { prepaid: { summary: 'PREPAID 3 tháng, giảm 5%, không cọc mới', value: { reservationId: 'WDP-2026-AB12CD34', termMonths: 3, paymentPlan: 'PREPAID' } }, monthly: { summary: 'PAY_MONTHLY', value: { reservationId: 'WDP-2026-AB12CD34', termMonths: 3, paymentPlan: 'PAY_MONTHLY' } } } })
  @ApiCreatedResponse({ description: 'Renewal PENDING với immutable renewal quote snapshot.' })
  @ApiBadRequestResponse({ description: 'Term/payment plan/Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({ description: 'Rental không ACTIVE, dữ liệu không đồng nhất, đã có renewal chưa xử lý hoặc có future allocation conflict.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Active Rental thuộc Customer.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.renewals.createCustomerRenewal(request.user!.id, body, key);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu gia hạn của Customer' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Chỉ Renewal thuộc Customer.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    const pagination = this.pagination(page, limit);
    return this.renewals.listCustomerRenewals(request.user!.id, pagination.page, pagination.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu gia hạn của Customer' })
  @ApiParam({ name: 'id', example: 'WDPR-2027-AB12CD34EF' })
  @ApiOkResponse({ description: 'Snapshot, invoice/payment summary và trạng thái xử lý.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc Customer.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.renewals.getCustomerRenewal(request.user!.id, id); }

  private pagination(pageValue: string, limitValue: string) {
    const page = Number(pageValue); const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }
}
