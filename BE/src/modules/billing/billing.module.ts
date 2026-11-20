import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { BillingService } from './billing.service.js';
import { CustomerBillingController } from './customer-billing.controller.js';
import { ManagerBillingController } from './manager-billing.controller.js';
import { OnlinePaymentController } from './online-payment.controller.js';
import { OnlinePaymentService } from './online-payment.service.js';
import { VnpayService } from './vnpay.service.js';

@Module({
  imports: [AuthModule, RenewalsModule],
  controllers: [CustomerBillingController, ManagerBillingController, OnlinePaymentController],
  providers: [BillingService, OnlinePaymentService, VnpayService],
  exports: [BillingService],
})
export class BillingModule {}
