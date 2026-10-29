import { StaffWorkflow } from '../auth/operation-access.js';
import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApproveTransferDto, CreateTransferDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { TransfersService } from './transfers.service.js';

@Controller(['manager/transfers', 'staff/management/transfers'])
@StaffWorkflow()
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'MANAGER')
@ApiTags('Manager Transfers')
@ApiBearerAuth('bearerAuth')
export class ManagerTransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Post() @ApiOperation({ summary: 'Tạo yêu cầu chuyển unit cho ACTIVE rental' }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ type: CreateTransferDto }) @ApiCreatedResponse({ description: 'Transfer REQUESTED; chưa đổi occupancy.' })
  create(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.transfers.create(body, key, req.user!); }
  @Get() @ApiOperation({ summary: 'Danh sách TransferRequest' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'status', required: false, enum: ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-TRF', description: 'Tìm transfer, reservation, contract hoặc unit code.' })
  @ApiOkResponse({ description: 'Danh sách có phân trang và stable sorting.' }) @ApiBadRequestResponse({ description: 'Pagination/filter/search không hợp lệ.' }) @ApiUnauthorizedResponse({ description: 'Thiếu/sai token.' }) @ApiForbiddenResponse({ description: 'Chỉ STAFF.' })
  list(@Query() query: Record<string, unknown>) { return this.transfers.list(query); }
  @Get(':id') @ApiOperation({ summary: 'Chi tiết TransferRequest' }) @ApiNotFoundResponse({ description: 'Không tìm thấy TransferRequest.' }) get(@Param('id') id: string) { return this.transfers.get(id); }
  @Post(':id/approve') @ApiOperation({ summary: 'Duyệt và reserve unit đích cùng StorageType' }) @ApiBody({ type: ApproveTransferDto }) @ApiConflictResponse({ description: 'Unit không phù hợp, không AVAILABLE hoặc có allocation trùng kỳ.' })
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.approve(id, body, req.user!); }
  @Post(':id/reject') @ApiOperation({ summary: 'Từ chối Transfer REQUESTED' })
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.transfers.reject(id, req.user!); }
}
