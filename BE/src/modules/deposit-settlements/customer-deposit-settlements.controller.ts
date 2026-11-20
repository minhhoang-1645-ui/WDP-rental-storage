import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { DepositSettlementsService } from './deposit-settlements.service.js';

@Controller('customer/deposit-settlements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Deposit Settlement')
@ApiBearerAuth('bearerAuth')
export class CustomerDepositSettlementsController {
  constructor(private readonly settlements: DepositSettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách quyết toán deposit của Customer' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Deposit, approved charges, deduction, refund và outstanding thuộc Customer.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    const parsedPage = Number(page); const parsedLimit = Number(limit);
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > 100000 || !Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return this.settlements.listCustomer(request.user!.id, parsedPage, parsedLimit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết quyết toán deposit của Customer', description: 'Không trả Manager reviewNote, refund reference nội bộ hoặc dữ liệu Customer khác.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01-DS01' })
  @ApiOkResponse({ description: 'Customer-visible approved issue reasons và settlement amounts.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc Customer.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.settlements.getCustomer(request.user!.id, id); }
}
