import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { FacilitiesModule } from './modules/facilities/facilities.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RentalsModule } from './modules/rentals/rentals.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    BookingModule,
    UsersModule,
    FacilitiesModule,
    StorageModule,
    RentalsModule,
  ],
})
export class AppModule {}
