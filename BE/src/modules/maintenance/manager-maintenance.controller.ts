import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AssignMaintenanceRequestDto, CreateMaintenanceRequestDto, RejectMaintenanceVerificationDto, UpdateMaintenancePriorityDto, VerifyMaintenanceRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseMaintenanceQuery } from './maintenance-query.js';
import { MaintenanceService } from './maintenance.service.js';

@Controller('manager/maintenance')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Maintenance')
@ApiBearerAuth('bearerAuth')
export class ManagerMaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Manager/Admin tạo manual maintenance cho unit AVAILABLE' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-manager-report-001' }) @ApiBody({ type: CreateMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Tạo OPEN case và chuyển unit sang MAINTENANCE.' }) @ApiConflictResponse({ description: 'Unit OCCUPIED, không AVAILABLE hoặc có active case.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.createManual(body, key, request.user!); }

  @Get()
  @ApiOperation({ summary: 'Danh sách maintenance cho Manager/Admin' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @ApiQuery({ name: 'category', required: false, enum: ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'] })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-MNT' })
  @ApiOkResponse({ description: 'Danh sách maintenance phân trang.' }) @ApiUnauthorizedResponse({ description: 'Thiếu/sai token.' }) @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) { return this.maintenance.listManager(parseMaintenanceQuery(query)); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết maintenance và future allocation risk' }) @ApiParam({ name: 'id', example: 'WDP-MNT-ABC1234567' })
  @ApiOkResponse({ description: 'Bao gồm ReturnInspection context và next confirmed allocation; không thay đổi allocation.' }) @ApiNotFoundResponse({ description: 'Không tìm thấy case.' })
  get(@Param('id') id: string) { return this.maintenance.getManager(id); }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Giao/reassign case chưa hoàn tất cho STAFF' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-assign-001' }) @ApiBody({ type: AssignMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Assignment được cập nhật; status/unit không đổi.' }) @ApiBadRequestResponse({ description: 'Target không phải STAFF.' }) @ApiConflictResponse({ description: 'Case đã hoàn tất/concurrent update.' })
  assign(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.assign(id, body, key, request.user!); }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Đổi priority của case chưa hoàn tất' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-priority-001' }) @ApiBody({ type: UpdateMaintenancePriorityDto })
  @ApiCreatedResponse({ description: 'Priority đổi; unit status không đổi.' })
  priority(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.updatePriority(id, body, key, request.user!); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Xác minh sửa chữa và đưa unit trở lại AVAILABLE', description: 'Thao tác Maintenance V1 duy nhất được MAINTENANCE → AVAILABLE.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-verify-001' }) @ApiBody({ type: VerifyMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Case COMPLETED và unit AVAILABLE trong cùng transaction.' }) @ApiConflictResponse({ description: 'Sai state, unit không MAINTENANCE hoặc concurrent action.' })
  verify(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.verify(id, body, key, request.user!); }

  @Post(':id/reject-verification')
  @ApiOperation({ summary: 'Từ chối xác minh và trả case về làm tiếp' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-reject-001' }) @ApiBody({ type: RejectMaintenanceVerificationDto })
  @ApiCreatedResponse({ description: 'AWAITING_VERIFICATION → IN_PROGRESS; unit vẫn MAINTENANCE.' }) @ApiBadRequestResponse({ description: 'note trống.' }) @ApiConflictResponse({ description: 'Sai state.' })
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.rejectVerification(id, body, key, request.user!); }
}
