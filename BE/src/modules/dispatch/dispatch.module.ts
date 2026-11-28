import { AppointmentsModule } from '../appointments/appointments.module.js';
import { ReturnsModule } from '../returns/returns.module.js';
import { ServiceCalendarService } from './service-calendar.service.js';
import { AssignmentQueueService } from './assignment-queue.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DispatchController } from './dispatch.controller.js';

@Module({
  imports: [AuthModule, AppointmentsModule, ReturnsModule],
  controllers: [DispatchController],
  providers: [AssignmentQueueService, ServiceCalendarService],
})
export class DispatchModule {}
