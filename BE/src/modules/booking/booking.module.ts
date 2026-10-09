import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';
import { ManagerInquiriesController } from './manager-inquiries.controller.js';
import { ManagerReservationsController } from './manager-reservations.controller.js';

@Module({
  imports: [AuthModule, PricingModule, ContractsModule, BillingModule],
  controllers: [BookingController, ManagerInquiriesController, ManagerReservationsController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
