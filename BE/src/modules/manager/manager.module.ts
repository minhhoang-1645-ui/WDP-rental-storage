import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerCustomersController } from './manager-customers.controller.js';
import { ManagerService } from './manager.service.js';
import { ManagerUnitsController } from './manager-units.controller.js';
import { ManagerDashboardController } from './manager-dashboard.controller.js';
import { InventoryManagementController } from './inventory-management.controller.js';
import { InventoryManagementService } from './inventory-management.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ManagerUnitsController, ManagerCustomersController, ManagerDashboardController, InventoryManagementController],
  providers: [ManagerService, InventoryManagementService],
  exports: [ManagerService],
})
export class ManagerModule {}
