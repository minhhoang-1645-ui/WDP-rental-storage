import { UnitStaffModule } from '../unit-staff/unit-staff.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdditionalServicesModule } from '../additional-services/additional-services.module.js';
import { AppointmentsService } from './appointments.service.js';
import { CustomerAppointmentsController } from './customer-appointments.controller.js';
import { ManagerAppointmentsController } from './manager-appointments.controller.js';
import { StaffAppointmentsController } from './staff-appointments.controller.js';

@Module({
  imports: [AuthModule, BillingModule, AdditionalServicesModule, UnitStaffModule],
  controllers: [CustomerAppointmentsController, ManagerAppointmentsController, StaffAppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
