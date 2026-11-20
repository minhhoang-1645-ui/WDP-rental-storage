import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseStockMovementQuery } from './stock-movement-query.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller('customer') @UseGuards(AuthGuard, RolesGuard) @Roles('CUSTOMER') @ApiBearerAuth('bearerAuth') @ApiTags('Customer Stored Items')
export class CustomerStockMovementsController {
  constructor(private readonly service: StockMovementsService) {}
  @Get('stored-items') @ApiOperation({ summary: 'Hàng khách đang lưu theo hợp đồng' }) @ApiQuery({ name: 'rentalContractId', required: false })
  listItems(@Req() req: AuthenticatedRequest, @Query('rentalContractId') contractId?: string) { return this.service.listStoredItems(req.user!.id, contractId?.trim() || undefined); }
  @Post('stock-movements') @ApiOperation({ summary: 'Tạo phiếu nhập/xuất hàng cho hợp đồng ACTIVE' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'stock-move-customer-001' })
  @ApiBody({ schema: { example: { rentalContractId: 'WDP-2026-ABC-C01', type: 'IN', scheduledAt: '2026-11-10T09:00:00+07:00', note: 'Nhập hàng buổi sáng', lines: [{ name: 'Thùng hồ sơ', unit: 'thùng', quantity: 4 }] } } }) @ApiCreatedResponse({ description: 'Tạo phiếu REQUESTED; chưa làm thay đổi tồn.' })
  create(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.service.create(req.user!, body, key); }
  @Get('stock-movements') @ApiOperation({ summary: 'Danh sách phiếu của Customer hiện tại' }) @ApiQuery({ name: 'page', required: false }) @ApiQuery({ name: 'limit', required: false }) @ApiQuery({ name: 'status', required: false }) @ApiQuery({ name: 'type', required: false })
  list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) { return this.service.listCustomer(req.user!.id, parseStockMovementQuery(query)); }
  @Get('stock-movements/:id') @ApiOperation({ summary: 'Chi tiết phiếu thuộc Customer hiện tại' }) get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.getCustomer(req.user!.id, id); }
}
