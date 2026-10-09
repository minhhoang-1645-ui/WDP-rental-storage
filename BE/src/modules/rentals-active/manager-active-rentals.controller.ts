import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ActiveRentalsService, type ActiveRentalListQuery } from './active-rentals.service.js';

@Controller('manager/rentals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Active Rental')
@ApiBearerAuth('bearerAuth')
export class ManagerActiveRentalsController {
  constructor(private readonly rentals: ActiveRentalsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách Active Rental cho Manager/Admin' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-2026-AB12CD34' })
  @ApiQuery({ name: 'storageType', required: false, example: 'md-e06' })
  @ApiQuery({ name: 'unitCode', required: false, example: 'MD-E06-001' })
  @ApiQuery({ name: 'customer', required: false, example: 'customer@example.test' })
  @ApiQuery({ name: 'overdue', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ description: 'Reservation-level rentals với overdue state, customer, contracts, units và billing summary.', schema: { example: { reservationReference: 'WDP-2026-AB12CD34', rentalState: 'OVERDUE', effectiveEndDate: '2026-10-01', isOverdue: true, futureAllocationRisk: { hasFutureAllocation: true, hasCurrentAllocationConflict: true }, contracts: [{ status: 'ACTIVE', unit: { status: 'OCCUPIED', nextConfirmedAllocation: { reservationReference: 'WDP-2026-FUTURE01', startDate: '2026-10-01', endDate: '2026-11-01', customer: { fullName: 'Future Customer', email: 'future@example.test' } } } }] } } })
  @ApiBadRequestResponse({ description: 'Filter hoặc pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    return this.rentals.listManagerRentals(this.query(query));
  }

  @Get(':reservationId')
  @ApiOperation({ summary: 'Chi tiết Active Rental cho Manager/Admin' })
  @ApiParam({ name: 'reservationId', example: 'WDP-2026-AB12CD34' })
  @ApiOkResponse({ description: 'Customer, contracts, units, historical pricing, invoices và payment summary.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Active Rental.' })
  get(@Param('reservationId') id: string) {
    return this.rentals.getManagerRental(id);
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
