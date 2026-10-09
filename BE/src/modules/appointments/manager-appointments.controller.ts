import { BadRequestException, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AppointmentsService, type AppointmentListQuery } from './appointments.service.js';

const statuses = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

@Controller('manager/appointments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Appointment')
@ApiBearerAuth('bearerAuth')
export class ManagerAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lịch bàn giao cho Manager/Admin' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-2026-AB12CD34' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-10', description: 'Ngày địa phương UTC+07, YYYY-MM-DD.' })
  @ApiOkResponse({ description: 'Stable sorting theo scheduledAt và id.' })
  @ApiBadRequestResponse({ description: 'Filter hoặc pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    return this.appointments.listOperationalAppointments(this.query(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lịch bàn giao cho Manager/Admin' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ description: 'Customer, Reservation, Contracts và allocated units.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lịch.' })
  get(@Param('id') id: string) {
    return this.appointments.getOperationalAppointment(id);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Xác nhận lịch bàn giao', description: 'REQUESTED → CONFIRMED. Người xác nhận lấy từ bearer token.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ schema: { example: { appointmentCode: 'WDP-2026-AB12CD34-A01', status: 'CONFIRMED', confirmedBy: { fullName: 'WDP Demo Manager', role: 'MANAGER' }, confirmedAt: '2026-11-08T03:00:00.000Z' } } })
  @ApiConflictResponse({ description: 'Không còn ở REQUESTED hoặc trạng thái tài chính/contract không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được xác nhận.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lịch.' })
  confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.appointments.confirmAppointment(id, request.user!);
  }

  private query(input: Record<string, unknown>): AppointmentListQuery {
    const page = this.integer(input.page, 1, 100000, 'page');
    const limit = this.integer(input.limit, 20, 100, 'limit');
    const search = this.optional(input.search, 'search');
    const status = this.optional(input.status, 'status');
    if (status && !statuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Appointment status không hợp lệ.');
    const date = this.optional(input.date, 'date');
    return { page, limit, ...(search ? { search } : {}), ...(status ? { status: status as AppointmentListQuery['status'] } : {}), ...(date ? { date } : {}) };
  }

  private integer(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return parsed;
  }

  private optional(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 100) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }
}
