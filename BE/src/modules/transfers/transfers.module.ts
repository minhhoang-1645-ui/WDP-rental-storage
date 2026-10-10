import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerTransfersController } from './manager-transfers.controller.js';
import { StaffTransfersController } from './staff-transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({ imports: [AuthModule], controllers: [ManagerTransfersController, StaffTransfersController], providers: [TransfersService], exports: [TransfersService] })
export class TransfersModule {}
