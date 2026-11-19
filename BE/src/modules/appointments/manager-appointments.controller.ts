import { StaffWorkflow, ManagerAssignment } from '../auth/operation-access.js';
import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AppointmentsService, type AppointmentListQuery } from './appointments.service.js';

const statuses = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

@Controller(['manager/appointments', 'staff/management/appointments'])
@StaffWorkflow()
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'MANAGER')
@ApiTags('Manager Appointment')
@ApiBearerAuth('bearerAuth')
export class ManagerAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lịch bàn giao cho nhân viên' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-2026-AB12CD34' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-10', description: 'Ngày địa phương UTC+07, YYYY-MM-DD.' })
  @ApiQuery({ name: 'from', required: false, example: '2026-11-10', description: 'Ngày đầu khoảng hẹn, tính cả ngày này.' })
  @ApiQuery({ name: 'through', required: false, example: '2026-11-17', description: 'Ngày cuối khoảng hẹn, tính cả ngày này.' })
  @ApiQuery({ name: 'agenda', required: false, enum: ['all', 'upcoming'], description: 'Sắp xếp lịch vận hành Staff. upcoming chỉ gồm lịch chưa bàn giao có giờ hẹn sắp tới.' })
  @ApiOkResponse({ description: 'Danh sách phân trang trong phạm vi nhân viên, theo thời gian hẹn hoặc hoàn tất.' })
  @ApiBadRequestResponse({ description: 'Filter hoặc pagination không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ nhân viên được xử lý; quản lý chỉ đọc báo cáo.' })
  list(@Query() query: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.appointments.listOperationalAppointments(this.query(query), request.user!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lịch bàn giao cho nhân viên' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ description: 'Customer, Reservation, Contracts và allocated units.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ nhân viên được xử lý; quản lý chỉ đọc báo cáo.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lịch.' })
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.appointments.getOperationalAppointment(id, request.user!);
  }

  @ManagerAssignment()
  @Patch(':id/assign')
  @ApiOperation({ summary: 'Quản lý phân công hoặc đổi nhân viên bàn giao' })
  assign(@Param('id') id: string, @Body() input: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.appointments.assignAppointment(id, input, request.user!);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Xác nhận lịch bàn giao', description: 'REQUESTED → CONFIRMED. Người xác nhận lấy từ bearer token.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ schema: { example: { appointmentCode: 'WDP-2026-AB12CD34-A01', status: 'CONFIRMED', confirmedBy: { fullName: 'WDP Demo Manager', role: 'MANAGER' }, confirmedAt: '2026-11-08T03:00:00.000Z' } } })
  @ApiConflictResponse({ description: 'Không còn ở REQUESTED hoặc trạng thái tài chính/contract không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ nhân viên đã được phân công có thể xác nhận.' })
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
    const agenda = this.optional(input.agenda, 'agenda');
    if (agenda !== undefined && agenda !== 'all' && agenda !== 'upcoming') throw new BadRequestException('Bộ lọc lịch không hợp lệ.');
    return { page, limit, search, status: status as AppointmentListQuery['status'], date, from: this.optional(input.from, 'from'), through: this.optional(input.through, 'through'), agenda };
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
