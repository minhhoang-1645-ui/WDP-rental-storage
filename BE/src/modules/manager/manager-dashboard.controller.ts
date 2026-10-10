import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ManagerService } from './manager.service.js';

@Controller('manager/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Dashboard')
@ApiBearerAuth('bearerAuth')
export class ManagerDashboardController {
  constructor(private readonly manager: ManagerService) {}
  @Get('summary')
  @ApiOperation({ summary: 'Tổng hợp số lượng vận hành', description: 'Tính trực tiếp từ dữ liệu hiện có; không lưu bảng báo cáo.' })
  @ApiOkResponse({ schema: { example: { pendingReservations: 2, activeRentals: 5, overdueRentals: 1, upcomingAppointments: 3, pendingRenewals: 1, openSupportRequests: 2, maintenanceUnits: 1, pendingDepositSettlements: 1, availableUnits: 12, occupiedUnits: 5 } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN.' })
  summary() { return this.manager.dashboardSummary(); }
}
