import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';
import { ManagerInquiriesController } from './manager-inquiries.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [BookingController, ManagerInquiriesController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
