import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiGoneResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { StockMovementsService } from './stock-movements.service.js';
import { stockWorkflowRetired } from './stock-workflow-retired.js';

@Controller('customer')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STORAGE_CUSTOMER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Legacy Personal Inventory')
export class CustomerStockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get(['stored-items', 'stock-movements'])
  @ApiGoneResponse({ description: 'Đã ngừng quản lý hàng cá nhân.' })
  list() { return stockWorkflowRetired(); }

  @Post('stock-movements')
  @ApiGoneResponse({ description: 'Đã ngừng tiếp nhận phiếu nhập/xuất.' })
  create() { return stockWorkflowRetired(); }

  @Get('stock-movements/:id')
  @ApiOperation({ summary: 'Xem phiếu cũ của chính khách hàng, chỉ đọc' })
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getCustomer(req.user!, id);
  }
}
