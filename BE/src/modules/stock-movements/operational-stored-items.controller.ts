import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiGoneResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { stockWorkflowRetired } from './stock-workflow-retired.js';

@Controller(['staff/stored-items', 'manager/stored-items'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_STAFF', 'FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Legacy Personal Inventory')
export class OperationalStoredItemsController {
  @Get(['', ':id/history'])
  @ApiGoneResponse({ description: 'Đã ngừng quản lý hàng cá nhân.' })
  list() { return stockWorkflowRetired(); }
}
