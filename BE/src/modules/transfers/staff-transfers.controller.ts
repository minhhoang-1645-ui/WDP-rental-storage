import { BadRequestException, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { TransfersService } from './transfers.service.js';

@Controller('staff/transfers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF')
@ApiTags('Staff Transfers')
@ApiBearerAuth('bearerAuth')
export class StaffTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lệnh chuyển kho cho Staff', description: 'Chỉ trả lệnh đã APPROVED hoặc COMPLETED để Staff thực hiện và tra cứu lịch sử vận hành.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['APPROVED', 'COMPLETED'] })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-TRF' })
  @ApiOkResponse({ description: 'Danh sách lệnh chuyển kho có phân trang.' })
  @ApiBadRequestResponse({ description: 'Filter không hợp lệ.' })
  list(@Query() query: Record<string, unknown>) {
    const status = typeof query.status === 'string' && query.status ? query.status : undefined;
    if (status && !['APPROVED', 'COMPLETED'].includes(status)) throw new BadRequestException('Staff chỉ được xem Transfer APPROVED hoặc COMPLETED.');
    return this.transfers.listForStaff(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lệnh chuyển kho cho Staff' })
  @ApiOkResponse({ description: 'Thông tin kho nguồn, kho đích và hợp đồng cần chuyển.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy lệnh APPROVED/COMPLETED.' })
  get(@Param('id') id: string) { return this.transfers.getForStaff(id); }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Hoàn tất chuyển unit vật lý', description: 'Atomically: allocation cũ được giữ và release, unit cũ → MAINTENANCE, unit mới → OCCUPIED, Contract giữ nguyên record.' })
  @ApiConflictResponse({ description: 'Transfer/unit state không còn hợp lệ.' })
  complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.transfers.complete(id, req.user!); }
}
