import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CreateHandoverAppointmentRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AppointmentsService } from './appointments.service.js';

@Controller('customer/appointments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Appointment')
@ApiBearerAuth('bearerAuth')
export class CustomerAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Yêu cầu lịch bàn giao', description: 'Chỉ tạo khi Reservation CONFIRMED, Initial Invoice PAID và tất cả contracts READY_FOR_HANDOVER. Không kích hoạt contract.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'appointment-wdp-ab12cd34' })
  @ApiBody({ type: CreateHandoverAppointmentRequestDto, examples: { paid: { summary: 'Customer đã thanh toán đủ', value: { reservationId: 'WDP-2026-AB12CD34', scheduledAt: '2026-11-10T09:30:00+07:00', note: 'Ưu tiên buổi sáng.' } } } })
  @ApiCreatedResponse({ schema: { example: { appointmentCode: 'WDP-2026-AB12CD34-A01', status: 'REQUESTED', scheduledAt: '2026-11-10T02:30:00.000Z', reservation: { reference: 'WDP-2026-AB12CD34', contractCount: 2 }, allocatedUnits: [{ contractCode: 'WDP-2026-AB12CD34-C01', contractStatus: 'READY_FOR_HANDOVER', unitCode: 'SM-B12-001', unitStatus: 'AVAILABLE' }] } } })
  @ApiBadRequestResponse({ description: 'Timestamp, startDate hoặc payload không hợp lệ.' })
  @ApiConflictResponse({ description: 'Chưa thanh toán đủ, contract chưa sẵn sàng hoặc đã có active appointment.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Reservation không tồn tại hoặc không thuộc Customer.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: Record<string, unknown>) {
    return this.appointments.createCustomerAppointment(request.user!, body, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách lịch bàn giao của Customer' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Chỉ trả lịch thuộc Reservation của Customer.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.appointments.listCustomerAppointments(request.user!.id, this.pagination(page, limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lịch bàn giao của Customer' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-A01' })
  @ApiOkResponse({ description: 'Lịch, contracts và allocated units.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc Customer.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.appointments.getCustomerAppointment(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }
}
