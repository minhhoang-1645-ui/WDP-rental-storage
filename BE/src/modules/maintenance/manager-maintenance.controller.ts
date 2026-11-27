import { StaffWorkflow, ManagerAssignment } from '../auth/operation-access.js';
import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AssignMaintenanceRequestDto, CreateMaintenanceRequestDto, RejectMaintenanceVerificationDto, UpdateMaintenancePriorityDto, VerifyMaintenanceRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseMaintenanceQuery } from './maintenance-query.js';
import { MaintenanceService, maintenanceCategories, maintenancePriorities } from './maintenance.service.js';

@Controller(['manager/maintenance', 'staff/management/maintenance'])
@StaffWorkflow()
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_STAFF', 'FACILITY_MANAGER')
@ApiTags('Manager Maintenance')
@ApiBearerAuth('bearerAuth')
export class ManagerMaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Staff báo sự cố bảo trì qua API tương thích cũ' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-manager-report-001' }) @ApiBody({ type: CreateMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Tạo hồ sơ OPEN và giữ nguyên trạng thái ô kho.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.createManual(body, key, request.user!); }

  @Get()
  @ApiOperation({ summary: 'Danh sách maintenance cho nhân viên' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'] })
  @ApiQuery({ name: 'priority', required: false, enum: maintenancePriorities })
  @ApiQuery({ name: 'category', required: false, enum: maintenanceCategories })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-MNT' })
  @ApiQuery({ name: 'assignedToMe', required: false, type: Boolean })
  @ApiOkResponse({ description: 'Danh sách maintenance phân trang.' }) @ApiUnauthorizedResponse({ description: 'Thiếu/sai token.' }) @ApiForbiddenResponse({ description: 'Chỉ nhân viên được xử lý; quản lý chỉ đọc báo cáo.' })
  list(@Query() input: Record<string, unknown>, @Req() req: AuthenticatedRequest) { const query = parseMaintenanceQuery(input); return req.user!.role === 'FACILITY_STAFF' ? this.maintenance.listStaff(query, req.user!) : this.maintenance.listManager(query, req.user!, query.assignedToMe ? req.user!.id : undefined); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết maintenance và future allocation risk' }) @ApiParam({ name: 'id', example: 'WDP-MNT-ABC1234567' })
  @ApiOkResponse({ description: 'Bao gồm ReturnInspection context và next confirmed allocation; không thay đổi allocation.' }) @ApiNotFoundResponse({ description: 'Không tìm thấy case.' })
  get(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return req.user!.role === 'FACILITY_STAFF' ? this.maintenance.getStaff(id, req.user!) : this.maintenance.getManager(id, req.user!); }

  @Get(':id/photos/:photoId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('photoId') photoId: string) {
    const photo = await this.maintenance.getPhoto(id, photoId, request.user!);
    return new StreamableFile(photo.bytes, { type: photo.mimeType });
  }

  @ManagerAssignment() @Post(':id/hold-unsafe-unit')
  holdUnsafeUnit(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined) {
    return this.maintenance.holdUnsafeUnit(id, key, request.user!);
  }

  @ManagerAssignment() @Patch(':id/booking-impact')
  @ApiOperation({ summary: 'Đánh giá phạm vi bị ảnh hưởng; danh sách rỗng gỡ khóa do phiếu này tạo' })
  assess(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined,
    @Body() body: Record<string, unknown>) {
    return this.maintenance.assess(id, body, key, request.user!);
  }

  @Get(':id/booking-impact/units')
  @Roles('FACILITY_MANAGER')
  assessmentUnits(@Param('id') id: string, @Query() input: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.maintenance.listAssessmentUnits(id, request.user!, parseMaintenanceQuery(input));
  }

  @ManagerAssignment() @Patch(':id/repair-plan')
  planRepair(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.maintenance.planRepair(id, body, key, request.user!);
  }

  @ManagerAssignment() @Post(':id/confirm-cost')
  confirmCost(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.maintenance.confirmCost(id, body, key, request.user!);
  }

  @ManagerAssignment() @Patch(':id/adjust-cost')
  adjustCost(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.maintenance.adjustCost(id, body, key, request.user!);
  }

  @Roles('FACILITY_MANAGER') @Get(':id/cost-history')
  costHistory(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.maintenance.costHistory(id, request.user!);
  }

  @ManagerAssignment() @Post(':id/close-without-repair')
  closeWithoutRepair(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.maintenance.closeWithoutRepair(id, body, key, request.user!);
  }

  @ManagerAssignment() @Patch(':id/assign')
  @ApiOperation({ summary: 'Giao/reassign case chưa hoàn tất cho FACILITY_STAFF' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-assign-001' }) @ApiBody({ type: AssignMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Assignment được cập nhật; status/unit không đổi.' }) @ApiBadRequestResponse({ description: 'Target không phải FACILITY_STAFF.' }) @ApiConflictResponse({ description: 'Case đã hoàn tất/concurrent update.' })
  assign(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.assign(id, body, key, request.user!); }

  @ManagerAssignment() @Patch(':id/priority')
  @ApiOperation({ summary: 'Đổi priority của case chưa hoàn tất' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-priority-001' }) @ApiBody({ type: UpdateMaintenancePriorityDto })
  @ApiCreatedResponse({ description: 'Priority đổi; unit status không đổi.' })
  priority(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.updatePriority(id, body, key, request.user!); }


  @ManagerAssignment() @Post(':id/verify')
  @ApiOperation({ summary: 'Xác minh sửa chữa và đưa unit trở lại AVAILABLE', description: 'Thao tác Maintenance V1 duy nhất được MAINTENANCE → AVAILABLE.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-verify-001' }) @ApiBody({ type: VerifyMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Case COMPLETED và unit AVAILABLE trong cùng transaction.' }) @ApiConflictResponse({ description: 'Sai state, unit không MAINTENANCE hoặc concurrent action.' })
  verify(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.verify(id, body, key, request.user!); }

  @ManagerAssignment() @Post(':id/reject-verification')
  @ApiOperation({ summary: 'Từ chối xác minh và trả case về làm tiếp' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-reject-001' }) @ApiBody({ type: RejectMaintenanceVerificationDto })
  @ApiCreatedResponse({ description: 'AWAITING_VERIFICATION → IN_PROGRESS; unit vẫn MAINTENANCE.' }) @ApiBadRequestResponse({ description: 'note trống.' }) @ApiConflictResponse({ description: 'Sai state.' })
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.maintenance.rejectVerification(id, body, key, request.user!); }
}
