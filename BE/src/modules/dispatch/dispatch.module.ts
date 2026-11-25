import { AutoDispatchService } from './auto-dispatch.service.js';
import { ServiceCalendarService } from './service-calendar.service.js';
import { AssignmentQueueService } from './assignment-queue.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StaffShiftsController } from './staff-shifts.controller.js';
import { StaffShiftsService } from './staff-shifts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StaffShiftsController],
  providers: [StaffShiftsService, AssignmentQueueService, ServiceCalendarService, AutoDispatchService],
})
export class DispatchModule {}
