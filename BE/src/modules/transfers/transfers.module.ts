import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerTransfersController } from './manager-transfers.controller.js';
import { StaffTransfersController } from './staff-transfers.controller.js';
import { TransfersService } from './transfers.service.js';
import { CustomerTransferOrdersController } from './customer-transfer-orders.controller.js';
import { TransferCommercialService } from './transfer-commercial.service.js';
import { SigningModule } from '../signing/signing.module.js';
import { DocumentPolicyModule } from '../documents/document-policy.module.js';
import { ClosureRelocationController } from './closure-relocation.controller.js';
import { ClosureRelocationService } from './closure-relocation.service.js';
import { AdditionalServicesModule } from '../additional-services/additional-services.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({ imports: [AuthModule, SigningModule, DocumentPolicyModule, AdditionalServicesModule, BillingModule], controllers: [CustomerTransferOrdersController, ManagerTransfersController, StaffTransfersController, ClosureRelocationController], providers: [TransfersService, TransferCommercialService, ClosureRelocationService], exports: [TransfersService] })
export class TransfersModule {}
