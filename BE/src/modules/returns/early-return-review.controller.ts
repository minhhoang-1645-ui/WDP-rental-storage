import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ReturnsService } from './returns.service.js';

@Controller('manager/early-return-requests')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiTags('Early Return Review')
@ApiBearerAuth('bearerAuth')
export class EarlyReturnReviewController {
  constructor(private readonly returns: ReturnsService) {}
  @Get()
  @ApiOperation({ summary: 'Manager xem đề nghị trả trước hạn và công nợ hiện có' })
  list(@Req() req:AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') { return this.returns.listEarlyReturnRequests(Number(page), Number(limit),req.user!); }
  @Post(':id/decision')
  @ApiOperation({ summary: 'Manager chấp thuận/từ chối trả sớm; không tự điều chỉnh tiền thuê hoặc tiền cọc' })
  decide(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.decideEarlyReturn(id, body, request.user!); }
  @Post('returns/:id/settlement-approval')
  approveSettlement(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.settleEarlyReturn(id, body ?? {}, request.user!); }
  @Post('returns/:id/facility-review')
  reviewFault(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.reviewEarlyReturnFault(id, body ?? {}, request.user!); }
  @Post('returns/:id/refund-confirmation')
  confirmRefund(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.settleEarlyReturn(id, body ?? {}, request.user!, true); }
  @Post(':id/financial-review')
  @ApiOperation({ summary: 'Đã ngừng: hóa đơn được quyết toán khi bàn giao' })
  financialReview(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.reviewEarlyReturnFinance(id, body, request.user!); }
}
