import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseStockMovementQuery } from './stock-movement-query.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller('staff/stock-movements') @UseGuards(AuthGuard, RolesGuard) @Roles('STAFF') @ApiBearerAuth('bearerAuth') @ApiTags('Staff Stock Movements')
export class StaffStockMovementsController {
  constructor(private readonly service: StockMovementsService) {}
  @Get() @ApiOperation({ summary: 'Phiếu nhập/xuất được giao cho Staff hiện tại' }) @ApiQuery({ name: 'page', required: false }) @ApiQuery({ name: 'limit', required: false }) @ApiQuery({ name: 'status', required: false }) @ApiQuery({ name: 'type', required: false })
  list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) { return this.service.listStaff(req.user!, parseStockMovementQuery(query)); }
  @Get(':id') @ApiOperation({ summary: 'Chi tiết phiếu được giao' }) get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.getStaff(req.user!, id); }
  @Post(':id/complete') @ApiOperation({ summary: 'Xác nhận nhập/xuất thực tế và cập nhật tồn bất biến' }) @ApiBody({ schema: { example: { note: 'Đã kiểm đếm tại kho', lines: [{ lineId: 'movement-line-id', actualQty: 4 }] } } }) @ApiOkResponse({ description: 'Phiếu COMPLETED và balance cập nhật cùng transaction.' }) @ApiForbiddenResponse({ description: 'Không phải Staff được giao.' })
  complete(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.complete(id, body, req.user!); }
}
