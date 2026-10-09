import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ActiveRentalsService, type ActiveRentalListQuery } from './active-rentals.service.js';

@Controller('staff/rentals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'MANAGER', 'ADMIN')
@ApiTags('Staff Active Rental')
@ApiBearerAuth('bearerAuth')
export class StaffActiveRentalsController {
  constructor(private readonly rentals: ActiveRentalsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách Active Rental vận hành', description: 'STAFF/MANAGER/ADMIN. Không trả historical pricing hay chi tiết số tiền.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'MD-E06-001' })
  @ApiQuery({ name: 'storageType', required: false, example: 'md-e06' })
  @ApiQuery({ name: 'unitCode', required: false, example: 'MD-E06-001' })
  @ApiQuery({ name: 'customer', required: false, example: 'Nguyen Van A' })
  @ApiQuery({ name: 'overdue', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ description: 'Customer contact, overdue state, active contracts, unit location và future-allocation risk; không có historical pricing.', schema: { example: { reservationReference: 'WDP-2026-AB12CD34', isOverdue: true, overdueSince: '2026-10-01', contracts: [{ status: 'ACTIVE', unit: { unitCode: 'MD-E06-001', status: 'OCCUPIED', nextConfirmedAllocation: { reservationReference: 'WDP-2026-FUTURE01', startDate: '2026-10-01', endDate: '2026-11-01' } } }], futureAllocationRisk: { hasFutureAllocation: true, hasCurrentAllocationConflict: true } } } })
  @ApiBadRequestResponse({ description: 'Filter hoặc pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    return this.rentals.listStaffRentals(this.query(query));
  }

  @Get(':reservationId')
  @ApiOperation({ summary: 'Chi tiết Active Rental vận hành' })
  @ApiParam({ name: 'reservationId', example: 'WDP-2026-AB12CD34' })
  @ApiOkResponse({ description: 'Customer, active contracts, units và vị trí kho.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Active Rental.' })
  get(@Param('reservationId') id: string) {
    return this.rentals.getStaffRental(id);
  }

  private query(input: Record<string, unknown>): ActiveRentalListQuery {
    const page = this.integer(input.page, 1, 100000, 'page');
    const limit = this.integer(input.limit, 20, 100, 'limit');
    const search = this.optional(input.search, 'search');
    const storageType = this.optional(input.storageType, 'storageType');
    const unitCode = this.optional(input.unitCode, 'unitCode');
    const customer = this.optional(input.customer, 'customer');
    const overdue = this.boolean(input.overdue, 'overdue');
    return { page, limit, ...(search ? { search } : {}), ...(storageType ? { storageType } : {}), ...(unitCode ? { unitCode } : {}), ...(customer ? { customer } : {}), ...(overdue !== undefined ? { overdue } : {}) };
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

  private boolean(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !['true', 'false'].includes(value)) throw new BadRequestException(`${label} phải là true hoặc false.`);
    return value === 'true';
  }
}
