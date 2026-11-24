import { Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiGoneResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { stockWorkflowRetired } from './stock-workflow-retired.js';

@Controller(['staff/stock-movements', 'staff/management/stock-movements'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_STAFF')
@ApiBearerAuth('bearerAuth')
@ApiTags('Legacy Personal Inventory')
export class StaffStockMovementsController {
  @Get(['', ':id'])
  @ApiGoneResponse({ description: 'Đã ngừng phiếu nhập/xuất trong tác vụ nhân viên.' })
  read() { return stockWorkflowRetired(); }

  @Patch(':id/assign')
  @ApiGoneResponse({ description: 'Đã ngừng phân công phiếu nhập/xuất.' })
  assign() { return stockWorkflowRetired(); }

  @Post(':id/complete')
  @ApiGoneResponse({ description: 'Đã ngừng hoàn tất phiếu nhập/xuất.' })
  complete() { return stockWorkflowRetired(); }
}
