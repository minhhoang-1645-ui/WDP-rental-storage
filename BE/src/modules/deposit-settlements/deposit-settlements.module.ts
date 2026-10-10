import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerDepositSettlementsController } from './customer-deposit-settlements.controller.js';
import { DepositSettlementsService } from './deposit-settlements.service.js';
import { ManagerDepositSettlementsController } from './manager-deposit-settlements.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerDepositSettlementsController, ManagerDepositSettlementsController],
  providers: [DepositSettlementsService],
  exports: [DepositSettlementsService],
})
export class DepositSettlementsModule {}
