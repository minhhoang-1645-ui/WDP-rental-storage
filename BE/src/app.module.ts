import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { ActiveRentalsModule } from './modules/rentals-active/active-rentals.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { ContractsModule } from './modules/contracts/contracts.module.js';
import { FacilitiesModule } from './modules/facilities/facilities.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ManagerModule } from './modules/manager/manager.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RentalsModule } from './modules/rentals/rentals.module.js';
import { RenewalsModule } from './modules/renewals/renewals.module.js';
import { ReturnsModule } from './modules/returns/returns.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ManagerModule,
    PricingModule,
    AuthModule,
    AppointmentsModule,
    ActiveRentalsModule,
    BookingModule,
    BillingModule,
    ContractsModule,
    UsersModule,
    FacilitiesModule,
    StorageModule,
    RentalsModule,
    RenewalsModule,
    ReturnsModule,
  ],
})
export class AppModule {}
