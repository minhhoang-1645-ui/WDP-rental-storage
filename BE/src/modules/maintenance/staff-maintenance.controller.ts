import { Body, Controller, Get, Header, Headers, Param, Post, Query, Req, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CompleteMaintenanceWorkDto, CreateMaintenanceRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseMaintenanceQuery } from './maintenance-query.js';
import { MaintenanceService, maintenanceCategories, maintenancePriorities } from './maintenance.service.js';
import { maintenanceUploadLimits, type MaintenanceUpload } from './maintenance-photo.js';

@Controller('staff/maintenance')
@UseGuards(AuthGuard, RolesGuard)
@ApiTags('Staff Maintenance')
@ApiBearerAuth('bearerAuth')
export class StaffMaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('photos', maintenanceUploadLimits.files, { limits: maintenanceUploadLimits }))
  @Roles('FACILITY_STAFF')
  @ApiOperation({ summary: 'Báo sự cố tại ô kho hoặc khu vực chung thuộc cơ sở được cấp quyền' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-report-20261009-001' })
  @ApiBody({ type: CreateMaintenanceRequestDto })
  @ApiCreatedResponse({ description: 'Tạo hồ sơ OPEN chưa phân công. Giữ nguyên trạng thái ô kho.' })
  @ApiConflictResponse({ description: 'Yêu cầu trùng khóa nhưng khác nội dung.' })
  @ApiBadRequestResponse({ description: 'Payload hoặc Idempotency-Key không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ FACILITY_STAFF được dùng endpoint báo cáo này.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined,
    @Body() body: Record<string, unknown>, @UploadedFiles() photos?: MaintenanceUpload[]) {
    return this.maintenance.createManual(body, key, request.user!, photos);
  }

  @Get()
  @Roles('FACILITY_STAFF')
  @ApiOperation({ summary: 'Danh sách maintenance vận hành', description: 'FACILITY_STAFF, FACILITY_MANAGER hoặc SYSTEM_ADMINISTRATOR. Không chứa dữ liệu tài chính.' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'] })
  @ApiQuery({ name: 'priority', required: false, enum: maintenancePriorities })
  @ApiQuery({ name: 'category', required: false, enum: maintenanceCategories })
  @ApiQuery({ name: 'assignedToMe', required: false, type: Boolean, example: true }) @ApiQuery({ name: 'search', required: false, example: 'A01' })
  @ApiOkResponse({ description: 'Danh sách phân trang ổn định.' })
  list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) { return this.maintenance.listStaff(parseMaintenanceQuery(query), request.user!); }

  @Get('units')
  @Roles('FACILITY_STAFF')
  reportUnits(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.maintenance.listReportUnits(request.user!, parseMaintenanceQuery(query));
  }

  @Get('facilities')
  @Roles('FACILITY_STAFF')
  reportFacilities(@Req() request: AuthenticatedRequest) {
    return this.maintenance.listReportFacilities(request.user!);
  }

  @Get(':id/photos/:photoId')
  @Roles('FACILITY_STAFF')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('photoId') photoId: string) {
    const photo = await this.maintenance.getPhoto(id, photoId, request.user!);
    return new StreamableFile(photo.bytes, { type: photo.mimeType });
  }

  @Get('reported-by-me')
  @Roles('FACILITY_STAFF')
  listReports(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.maintenance.listReportedByStaff(parseMaintenanceQuery(query), req.user!);
  }

  @Get(':id')
  @Roles('FACILITY_STAFF')
  @ApiOperation({ summary: 'Chi tiết maintenance vận hành cho Staff' }) @ApiParam({ name: 'id', example: 'WDP-MNT-ABC1234567' })
  @ApiOkResponse({ description: 'Unit, assignment và work fields; không chứa financial history.' }) @ApiNotFoundResponse({ description: 'Không tìm thấy case.' })
  get(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.maintenance.getStaff(id, req.user!); }

  @Post(':id/start')
  @Roles('FACILITY_STAFF')
  @ApiOperation({ summary: 'Staff được giao bắt đầu công việc' }) @ApiParam({ name: 'id', example: 'WDP-MNT-ABC1234567' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-start-20261009-001' })
  @ApiCreatedResponse({ description: 'OPEN → IN_PROGRESS; unit vẫn MAINTENANCE.' })
  @ApiConflictResponse({ description: 'Sai state hoặc chưa được assign.' }) @ApiForbiddenResponse({ description: 'Không phải assigned Staff.' })
  start(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined) { return this.maintenance.start(id, key, request.user!); }

  @Post(':id/complete-work')
  @Roles('FACILITY_STAFF')
  @ApiOperation({ summary: 'Staff gửi công việc đã hoàn tất để Manager xác minh' }) @ApiParam({ name: 'id', example: 'WDP-MNT-ABC1234567' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'mnt-complete-20261009-001' }) @ApiBody({ type: CompleteMaintenanceWorkDto })
  @ApiCreatedResponse({ description: 'IN_PROGRESS → AWAITING_VERIFICATION; unit vẫn MAINTENANCE.' })
  @ApiBadRequestResponse({ description: 'workNote trống/không hợp lệ.' }) @ApiConflictResponse({ description: 'Sai state.' }) @ApiForbiddenResponse({ description: 'Không phải assigned Staff.' })
  complete(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.maintenance.completeWork(id, body, key, request.user!);
  }
}
