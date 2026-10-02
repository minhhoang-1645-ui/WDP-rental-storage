import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module.js';
import { StorageController } from './storage.controller.js';

@Module({ imports: [BookingModule], controllers: [StorageController] })
export class StorageModule {}
