import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ReturnsService } from './returns.service.js';

@Controller('manager/early-return-requests')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER')
@ApiTags('Early Return Review')
@ApiBearerAuth('bearerAuth')
export class EarlyReturnReviewController {
  constructor(private readonly returns: ReturnsService) {}
  @Get()
  @ApiOperation({ summary: 'Manager xem đề nghị trả trước hạn và công nợ hiện có' })
  list(@Query('page') page = '1', @Query('limit') limit = '20') { return this.returns.listEarlyReturnRequests(Number(page), Number(limit)); }
  @Post(':id/decision')
  @ApiOperation({ summary: 'Manager chấp thuận/từ chối trả sớm; không tự điều chỉnh tiền thuê hoặc tiền cọc' })
  decide(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.returns.decideEarlyReturn(id, body, request.user!); }
}
