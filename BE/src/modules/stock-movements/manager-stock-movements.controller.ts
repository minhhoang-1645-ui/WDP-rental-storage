import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseStockMovementQuery } from './stock-movement-query.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller('manager/stock-movements') @UseGuards(AuthGuard, RolesGuard) @Roles('MANAGER', 'ADMIN') @ApiBearerAuth('bearerAuth') @ApiTags('Manager Stock Movements')
export class ManagerStockMovementsController {
  constructor(private readonly service: StockMovementsService) {}
  @Get() @ApiOperation({ summary: 'Danh sách phiếu nhập/xuất hàng khách' }) @ApiQuery({ name: 'page', required: false }) @ApiQuery({ name: 'limit', required: false }) @ApiQuery({ name: 'status', required: false }) @ApiQuery({ name: 'type', required: false }) @ApiQuery({ name: 'search', required: false })
  list(@Query() query: Record<string, unknown>) { return this.service.listManager(parseStockMovementQuery(query)); }
  @Get(':id') @ApiOperation({ summary: 'Chi tiết phiếu nhập/xuất' }) get(@Param('id') id: string) { return this.service.getManager(id); }
  @Patch(':id/assign') @ApiOperation({ summary: 'Phân công Staff xử lý phiếu' }) @ApiBody({ schema: { example: { staffUserId: 'staff-user-id' } } }) @ApiOkResponse({ description: 'Phiếu chuyển ASSIGNED.' }) @ApiForbiddenResponse({ description: 'Chỉ MANAGER/ADMIN.' })
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.assign(id, typeof body.staffUserId === 'string' ? body.staffUserId.trim() : '', req.user!); }
}
