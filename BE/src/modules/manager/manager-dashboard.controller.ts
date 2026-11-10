import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ManagerAnalyticsService } from './manager-analytics.service.js';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ManagerService } from './manager.service.js';

@Controller('manager/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER')
@ApiTags('Manager Dashboard')
@ApiBearerAuth('bearerAuth')
export class ManagerDashboardController {
  constructor(private readonly manager: ManagerService, private readonly analytics: ManagerAnalyticsService) {}
  @Get('analytics')
  @ApiOperation({ summary: 'Báo cáo cơ sở theo bản ghi xác nhận; dòng tiền không phải doanh thu kế toán' })
  @ApiQuery({ name: 'from', required: false, example: '2026-11-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-11-30', description: 'Bao gồm ngày kết thúc theo UTC+7; các KPI hiện tại không lọc thời gian.' })
  report(@Query() query: Record<string, unknown>) { return this.analytics.report(query); }
  @Get('summary')
  @ApiOperation({ summary: 'Tổng hợp số lượng vận hành', description: 'Tính trực tiếp từ dữ liệu hiện có; không lưu bảng báo cáo.' })
  @ApiOkResponse({ schema: { example: { pendingReservations: 2, activeRentals: 5, overdueRentals: 1, upcomingAppointments: 3, pendingRenewals: 1, openSupportRequests: 2, maintenanceUnits: 1, pendingDepositSettlements: 1, availableUnits: 12, occupiedUnits: 5 } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ MANAGER hoặc ADMIN.' })
  summary() { return this.manager.dashboardSummary(); }
}
