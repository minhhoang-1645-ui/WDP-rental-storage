import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { BillingService } from './billing.service.js';
import { CustomerBillingController } from './customer-billing.controller.js';
import { ManagerBillingController } from './manager-billing.controller.js';
import { OnlinePaymentController } from './online-payment.controller.js';
import { OnlinePaymentService } from './online-payment.service.js';
import { VnpayService } from './vnpay.service.js';
import { PayosService } from './payos.service.js';
import { PayosPaymentService } from './payos-payment.service.js';
import { OverduePaymentWorker } from './overdue-payment.js';

@Module({
  imports: [AuthModule, RenewalsModule],
  controllers: [CustomerBillingController, ManagerBillingController, OnlinePaymentController],
  providers: [BillingService, OnlinePaymentService, VnpayService, PayosService, PayosPaymentService, OverduePaymentWorker],
  exports: [BillingService],
})
export class BillingModule {}
