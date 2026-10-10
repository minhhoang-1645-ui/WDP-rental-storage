import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerCustomersController } from './manager-customers.controller.js';
import { ManagerService } from './manager.service.js';
import { ManagerUnitsController } from './manager-units.controller.js';
import { ManagerDashboardController } from './manager-dashboard.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [ManagerUnitsController, ManagerCustomersController, ManagerDashboardController],
  providers: [ManagerService],
  exports: [ManagerService],
})
export class ManagerModule {}
