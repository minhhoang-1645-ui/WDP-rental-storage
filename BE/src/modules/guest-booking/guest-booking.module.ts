import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BookingModule } from '../booking/booking.module.js';
import { EmailService } from './email.service.js';
import { GuestBookingController } from './guest-booking.controller.js';
import { GuestBookingService } from './guest-booking.service.js';

@Module({ imports: [AuthModule, BookingModule], controllers: [GuestBookingController], providers: [EmailService, GuestBookingService] })
export class GuestBookingModule {}
