import { ManagerAssignment, StaffWorkflow } from '../auth/operation-access.js';
import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApproveTransferDto } from '../../openapi/api-dtos.js';
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
  @Post() @ApiOperation({ summary: 'Đường dẫn cũ đã đóng. Customer gửi qua hồ sơ thuê.' }) @ApiForbiddenResponse({ description: 'Đường dẫn tạo đề nghị chuyển kho của Staff đã đóng.' })
  create(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.transfers.create(body, key, req.user!); }
  @ManagerAssignment() @Post('intake/:supportId')
  intake(@Param('supportId') supportId: string, @Req() req: AuthenticatedRequest) { return this.transfers.intakeLegacy(supportId, req.user!); }
  @Get() @ApiOperation({ summary: 'Danh sách TransferRequest' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'status', required: false, enum: ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-TRF', description: 'Tìm transfer, reservation, contract hoặc unit code.' })
  @ApiOkResponse({ description: 'Danh sách có phân trang và stable sorting.' }) @ApiBadRequestResponse({ description: 'Pagination/filter/search không hợp lệ.' }) @ApiUnauthorizedResponse({ description: 'Thiếu/sai token.' }) @ApiForbiddenResponse({ description: 'Chỉ STAFF.' })
  list(@Query() query: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return req.user!.role === 'STAFF' ? this.transfers.listForStaff(query, req.user!) : this.transfers.list(query); }
  @Get(':id/destinations') @ApiOperation({ summary: 'Kho đích cùng loại và khả dụng trong toàn kỳ thuê còn lại', description: 'Có phân trang, không bao gồm kho nguồn. Trả lý do không thể chọn và lịch trùng, không trả thông tin khách thuê khác. Duyệt vẫn kiểm tra lại trong transaction.' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 100 })
  destinations(@Param('id') id: string, @Query() query: Record<string, unknown>, @Req() req: AuthenticatedRequest) { if (req.user!.role !== 'MANAGER') throw new ForbiddenException(); return this.transfers.destinations(id, query); }
  @Get(':id/commercial-preview')
  commercialPreview(@Param('id') id: string, @Query('destination') destination: string, @Req() req: AuthenticatedRequest) { if (req.user!.role !== 'MANAGER') throw new ForbiddenException(); return this.transfers.previewCommercial(id, destination); }
  @Get(':id') @ApiOperation({ summary: 'Chi tiết TransferRequest' }) @ApiNotFoundResponse({ description: 'Không tìm thấy TransferRequest.' }) get(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return req.user!.role === 'STAFF' ? this.transfers.getForStaff(id, req.user!) : this.transfers.get(id); }
  @ManagerAssignment() @Patch(':id/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.assign(id, body, req.user!); }
  @ManagerAssignment() @Post(':id/approve') @ApiOperation({ summary: 'Duyệt, giữ kho đích và phân công Staff trong cùng giao dịch' }) @ApiBody({ type: ApproveTransferDto }) @ApiConflictResponse({ description: 'Unit không phù hợp, không AVAILABLE hoặc có allocation trùng kỳ.' })
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.approve(id, body, req.user!); }
  @ManagerAssignment() @Post(':id/reject') @ApiOperation({ summary: 'Từ chối Transfer REQUESTED' })
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.reject(id, req.user!, body); }
}
