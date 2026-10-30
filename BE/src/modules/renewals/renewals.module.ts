import { Module } from '@nestjs/common';
import { SigningModule } from '../signing/signing.module.js';
import { DocumentPolicyModule } from '../documents/document-policy.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { CustomerRenewalsController } from './customer-renewals.controller.js';
import { ManagerRenewalsController } from './manager-renewals.controller.js';
import { RenewalsService } from './renewals.service.js';

@Module({
  imports: [AuthModule, PricingModule, SigningModule, DocumentPolicyModule],
  controllers: [CustomerRenewalsController, ManagerRenewalsController],
  providers: [RenewalsService],
  exports: [RenewalsService],
})
export class RenewalsModule {}
