import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ContractsService, type ContractListQuery } from './contracts.service.js';

const statuses = ['PENDING_PAYMENT', 'READY_FOR_HANDOVER', 'ACTIVE', 'COMPLETED'] as const;

@Controller('manager/contracts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Contract')
@ApiBearerAuth('bearerAuth')
export class ManagerContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách RentalContract', description: 'MANAGER hoặc ADMIN. Read-only trong milestone này.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'search', required: false, example: 'SM-B12-001', description: 'Tìm contract code, reservation reference, tên/email khách hoặc unit code.' })
  @ApiQuery({ name: 'status', required: false, enum: statuses, example: 'PENDING_PAYMENT' })
  @ApiOkResponse({ description: 'Danh sách sắp xếp ổn định theo createdAt mới nhất.', schema: { example: { page: 1, limit: 20, total: 2, items: [{ contractCode: 'WDP-2026-AB12CD34-C01', status: 'PENDING_PAYMENT', reservation: { reference: 'WDP-2026-AB12CD34', quantity: 2, customer: { fullName: 'Nguyen Van A' } }, storageUnit: { unitCode: 'SM-B12-001' } }, { contractCode: 'WDP-2026-AB12CD34-C02', status: 'PENDING_PAYMENT', reservation: { reference: 'WDP-2026-AB12CD34', quantity: 2, customer: { fullName: 'Nguyen Van A' } }, storageUnit: { unitCode: 'SM-B12-002' } }] } } })
  @ApiBadRequestResponse({ description: 'Pagination, search hoặc status không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    return this.contracts.listManagerContracts(this.parseQuery(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết RentalContract', description: 'MANAGER hoặc ADMIN. Trả Reservation pricing lịch sử; không tính lại giá.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-C01' })
  @ApiOkResponse({ description: 'Hợp đồng, customer, reservation, unit vật lý và reservationPricing.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hợp đồng.' })
  get(@Param('id') id: string) {
    return this.contracts.getManagerContract(id);
  }

  private parseQuery(query: Record<string, unknown>): ContractListQuery {
    const page = this.positiveInteger(query.page, 1, 100000, 'page');
    const limit = this.positiveInteger(query.limit, 20, 100, 'limit');
    const status = this.optionalText(query.status, 'status');
    if (status && !statuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Trạng thái hợp đồng không hợp lệ.');
    const search = this.optionalText(query.search, 'search');
    return { page, limit, ...(search ? { search } : {}), ...(status ? { status: status as ContractListQuery['status'] } : {}) };
  }

  private positiveInteger(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} phải từ 1–${maximum}.`);
    return parsed;
  }

  private optionalText(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 100) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }
}
