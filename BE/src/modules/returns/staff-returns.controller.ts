import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UpdateReturnInspectionRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ReturnsService, type ReturnListQuery } from './returns.service.js';

const statuses = ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'COMPLETED'] as const;

@Controller('staff/returns')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'MANAGER', 'ADMIN')
@ApiTags('Staff Return Inspection')
@ApiBearerAuth('bearerAuth')
export class StaffReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu trả kho cho vận hành', description: 'STAFF/MANAGER/ADMIN. Không trả historical pricing hoặc billing amount.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'SM-B12-001' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-08' })
  @ApiOkResponse({ description: 'Customer contact, contracts/units, inspection progress và renewal context.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER không được phép.' })
  list(@Query() input: Record<string, unknown>) { return this.returns.listStaffReturns(this.query(input)); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết tác vụ kiểm tra trả kho' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiOkResponse({ description: 'Danh sách inspection theo contract và physical unit.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy yêu cầu trả kho.' })
  get(@Param('id') id: string) { return this.returns.getStaffReturn(id); }

  @Post(':id/start-inspection')
  @ApiOperation({ summary: 'Bắt đầu kiểm tra', description: 'REQUESTED → INSPECTION_IN_PROGRESS. Chưa thay đổi Contract, allocation hoặc Unit.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiOkResponse({ schema: { example: { returnCode: 'WDP-2026-AB12CD34-RT01', status: 'INSPECTION_IN_PROGRESS', inspectionStartedBy: { fullName: 'WDP Staff', role: 'STAFF' }, inspectionSummary: { total: 2, pending: 2, passed: 0, issues: 0 } } } })
  @ApiConflictResponse({ description: 'Trạng thái hoặc rental integrity không hợp lệ.' })
  start(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.returns.startInspection(id, request.user!); }

  @Patch(':returnId/inspections/:inspectionId')
  @ApiOperation({ summary: 'Ghi kết quả kiểm tra một kho', description: 'PASS hoặc ISSUE_FOUND. ISSUE_FOUND không release unit và chưa tự tạo phí/maintenance.' })
  @ApiParam({ name: 'returnId', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiParam({ name: 'inspectionId', example: 'cm-return-inspection-id' })
  @ApiBody({ type: UpdateReturnInspectionRequestDto, examples: {
    pass: { value: { result: 'PASS', conditionNote: 'Kho sạch, cửa và khóa hoạt động bình thường.' } },
    issue: { value: { result: 'ISSUE_FOUND', conditionNote: 'Có vết móp ở cửa.', issueNote: 'Cần Manager xử lý riêng; V1 chưa tính phí.' } },
  } })
  @ApiOkResponse({ description: 'Inspection và summary mới nhất.' })
  @ApiBadRequestResponse({ description: 'result/note không hợp lệ.' })
  @ApiConflictResponse({ description: 'Yêu cầu chưa bắt đầu, đã hoàn tất hoặc ISSUE_FOUND không được tự xóa.' })
  @ApiNotFoundResponse({ description: 'Return hoặc inspection không tồn tại/không khớp.' })
  update(@Req() request: AuthenticatedRequest, @Param('returnId') returnId: string, @Param('inspectionId') inspectionId: string, @Body() body: Record<string, unknown>) {
    return this.returns.updateInspection(returnId, inspectionId, body, request.user!);
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Hoàn tất trả kho', description: 'Yêu cầu mọi inspection PASS. Transaction nguyên tử: Contract COMPLETED, allocation released, Unit AVAILABLE, Return COMPLETED. Không settlement deposit.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiOkResponse({ schema: { example: { returnCode: 'WDP-2026-AB12CD34-RT01', status: 'COMPLETED', completedBy: { fullName: 'WDP Staff', role: 'STAFF' }, inspections: [{ result: 'PASS', contract: { status: 'COMPLETED' }, unit: { status: 'AVAILABLE' } }] } } })
  @ApiConflictResponse({ description: 'RETURN_INSPECTIONS_INCOMPLETE, RETURN_ISSUE_UNRESOLVED, invalid contract/unit/allocation hoặc concurrency conflict.' })
  finalize(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.returns.finalize(id, request.user!); }

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
