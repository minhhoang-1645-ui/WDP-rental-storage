import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ContractsService } from './contracts.service.js';

@Controller('customer/contracts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Contract')
@ApiBearerAuth('bearerAuth')
export class CustomerContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách hợp đồng của khách hàng', description: 'CUSTOMER chỉ xem hợp đồng thuộc chính tài khoản của mình.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiOkResponse({ description: 'Một Reservation quantity = 2 tạo hai contract riêng, mỗi contract có một unitCode.', schema: { example: { page: 1, limit: 20, total: 2, items: [{ contractCode: 'WDP-2026-AB12CD34-C01', status: 'PENDING_PAYMENT', reservation: { reference: 'WDP-2026-AB12CD34', quantity: 2 }, storageUnit: { unitCode: 'SM-B12-001', floor: 'Tầng trệt', zone: 'B' } }, { contractCode: 'WDP-2026-AB12CD34-C02', status: 'PENDING_PAYMENT', reservation: { reference: 'WDP-2026-AB12CD34', quantity: 2 }, storageUnit: { unitCode: 'SM-B12-002', floor: 'Tầng trệt', zone: 'B' } }] } } })
  @ApiBadRequestResponse({ description: 'Pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') pageInput = '1', @Query('limit') limitInput = '20') {
    return this.contracts.listCustomerContracts(request.user!.id, this.pagination(pageInput, limitInput));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng của khách hàng', description: 'CUSTOMER chỉ xem hợp đồng của mình; nhận database id hoặc contractCode.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-C01' })
  @ApiOkResponse({ description: 'Hợp đồng, unit được gán và reservationPricing lịch sử ở cấp Reservation.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hợp đồng hoặc hợp đồng không thuộc khách hàng.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.contracts.getCustomerContract(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('page phải từ 1–100000, limit phải từ 1–100.');
    }
    return { page, limit };
  }
}
