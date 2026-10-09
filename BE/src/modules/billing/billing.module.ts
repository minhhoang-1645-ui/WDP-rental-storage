import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { BillingService } from './billing.service.js';
import { CustomerBillingController } from './customer-billing.controller.js';
import { ManagerBillingController } from './manager-billing.controller.js';

@Module({
  imports: [AuthModule, RenewalsModule],
  controllers: [CustomerBillingController, ManagerBillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
