import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiGoneResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { StockMovementsService } from './stock-movements.service.js';
import { stockWorkflowRetired } from './stock-workflow-retired.js';

@Controller('manager/stock-movements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Legacy Personal Inventory')
export class ManagerStockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get()
  @ApiGoneResponse({ description: 'Đã ngừng quản lý phiếu nhập/xuất.' })
  list() { return stockWorkflowRetired(); }

  @Get(':id')
  @ApiOperation({ summary: 'Xem phiếu cũ tại cơ sở được cấp quyền, chỉ đọc' })
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getManager(req.user!, id);
  }

  @Patch(':id/assign')
  @ApiGoneResponse({ description: 'Đã ngừng phân công phiếu nhập/xuất.' })
  assign() { return stockWorkflowRetired(); }
}
