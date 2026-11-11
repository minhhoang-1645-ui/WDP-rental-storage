import { ReportingController } from './reporting.controller.js';
import { ReportingService } from './reporting.service.js';
import { Module } from '@nestjs/common';
import { ManagerAnalyticsService } from './manager-analytics.service.js';
import { OverstayController } from './overstay.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerCustomersController } from './manager-customers.controller.js';
import { ManagerService } from './manager.service.js';
import { ManagerUnitsController } from './manager-units.controller.js';
import { ManagerDashboardController } from './manager-dashboard.controller.js';
import { InventoryManagementController } from './inventory-management.controller.js';
import { InventoryManagementService } from './inventory-management.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController, OverstayController, ManagerUnitsController, ManagerCustomersController, ManagerDashboardController, InventoryManagementController],
  providers: [ManagerAnalyticsService, ReportingService, ManagerService, InventoryManagementService],
  exports: [ManagerService],
})
export class ManagerModule {}
