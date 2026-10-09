import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerReturnsController } from './customer-returns.controller.js';
import { ManagerReturnsController } from './manager-returns.controller.js';
import { ReturnsService } from './returns.service.js';
import { StaffReturnsController } from './staff-returns.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerReturnsController, ManagerReturnsController, StaffReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
