import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { CustomerRenewalsController } from './customer-renewals.controller.js';
import { ManagerRenewalsController } from './manager-renewals.controller.js';
import { RenewalsService } from './renewals.service.js';

@Module({
  imports: [AuthModule, PricingModule],
  controllers: [CustomerRenewalsController, ManagerRenewalsController],
  providers: [RenewalsService],
  exports: [RenewalsService],
})
export class RenewalsModule {}
