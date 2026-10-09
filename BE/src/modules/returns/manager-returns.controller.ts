import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ReturnsService, type ReturnListQuery } from './returns.service.js';

const statuses = ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'COMPLETED'] as const;

@Controller('manager/returns')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Return')
@ApiBearerAuth('bearerAuth')
export class ManagerReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu trả kho cho Manager/Admin', description: 'Có customer, billing summary, renewal context và future allocation risk.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-2026-AB12CD34' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-08', description: 'Ngày tạo theo múi giờ Asia/Bangkok, YYYY-MM-DD.' })
  @ApiOkResponse({ description: 'Stable pagination theo createdAt desc, id asc.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() input: Record<string, unknown>) { return this.returns.listManagerReturns(this.query(input)); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu trả kho cho Manager/Admin' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiOkResponse({ description: 'Customer, rental, inspections, billing, renewals và future allocations.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy yêu cầu trả kho.' })
  get(@Param('id') id: string) { return this.returns.getManagerReturn(id); }

  private query(input: Record<string, unknown>): ReturnListQuery {
    const page = this.integer(input.page, 1, 100000, 'page');
    const limit = this.integer(input.limit, 20, 100, 'limit');
    const search = this.optional(input.search, 'search');
    const status = this.optional(input.status, 'status');
    if (status && !statuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Return status không hợp lệ.');
    const date = this.optional(input.date, 'date');
    return { page, limit, ...(search ? { search } : {}), ...(status ? { status: status as ReturnListQuery['status'] } : {}), ...(date ? { date } : {}) };
  }

  private integer(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return parsed;
  }

  private optional(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }
}
