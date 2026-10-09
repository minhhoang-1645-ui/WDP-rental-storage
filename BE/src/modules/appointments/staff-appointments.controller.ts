import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CompleteHandoverRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AppointmentsService, type AppointmentListQuery } from './appointments.service.js';

const statuses = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

@Controller('staff/appointments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'MANAGER', 'ADMIN')
@ApiTags('Staff Handover')
@ApiBearerAuth('bearerAuth')
export class StaffAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lịch vận hành bàn giao', description: 'STAFF/MANAGER/ADMIN. Không trả pricing internals.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'SM-B12-001' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-10' })
  @ApiOkResponse({ description: 'Lịch, customer, contracts và allocated units.' })
  @ApiBadRequestResponse({ description: 'Filter hoặc pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    return this.appointments.listOperationalAppointments(this.query(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lịch vận hành bàn giao' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ description: 'Dữ liệu cần thiết để bàn giao tại cơ sở.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lịch.' })
  get(@Param('id') id: string) {
    return this.appointments.getOperationalAppointment(id);
  }

  @Post(':id/complete-handover')
  @ApiOperation({ summary: 'Hoàn tất bàn giao vật lý', description: 'Atomically: CONFIRMED appointment → COMPLETED, contracts → ACTIVE, units → OCCUPIED. Không thay đổi startDate/endDate.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiBody({ type: CompleteHandoverRequestDto, examples: { completed: { value: { note: 'Đã bàn giao đầy đủ các kho cho khách hàng.' } } } })
  @ApiOkResponse({ schema: { example: { appointmentCode: 'WDP-2026-AB12CD34-A01', status: 'COMPLETED', completedBy: { fullName: 'WDP Staff', role: 'STAFF' }, completedAt: '2026-11-10T02:35:00.000Z', allocatedUnits: [{ contractCode: 'WDP-2026-AB12CD34-C01', contractStatus: 'ACTIVE', activatedAt: '2026-11-10T02:35:00.000Z', unitCode: 'SM-B12-001', unitStatus: 'OCCUPIED' }] } } })
  @ApiBadRequestResponse({ description: 'Handover note không hợp lệ.' })
  @ApiConflictResponse({ description: 'Lịch chưa CONFIRMED, chưa trả đủ, contract/unit không hợp lệ hoặc concurrency conflict.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được hoàn tất bàn giao.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lịch.' })
  complete(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.appointments.completeHandover(id, body, request.user!);
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
