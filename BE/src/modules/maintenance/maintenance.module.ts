import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MaintenanceService } from './maintenance.service.js';
import { ManagerMaintenanceController } from './manager-maintenance.controller.js';
import { StaffMaintenanceController } from './staff-maintenance.controller.js';
import { MaintenanceCostReportController } from './maintenance-cost-report.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [StaffMaintenanceController, ManagerMaintenanceController, MaintenanceCostReportController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
