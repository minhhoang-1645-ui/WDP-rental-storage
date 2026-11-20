import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ActiveRentalsService } from './active-rentals.service.js';
import { CustomerActiveRentalsController } from './customer-active-rentals.controller.js';
import { ManagerActiveRentalsController } from './manager-active-rentals.controller.js';
import { StaffActiveRentalsController } from './staff-active-rentals.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerActiveRentalsController, ManagerActiveRentalsController, StaffActiveRentalsController],
  providers: [ActiveRentalsService],
})
export class ActiveRentalsModule {}
