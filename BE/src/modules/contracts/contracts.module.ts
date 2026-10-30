import { Module } from '@nestjs/common';
import { SigningModule } from '../signing/signing.module.js';
import { DocumentPolicyModule } from '../documents/document-policy.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerContractsController } from './customer-contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { ManagerContractsController } from './manager-contracts.controller.js';

@Module({
  imports: [AuthModule, SigningModule, DocumentPolicyModule],
  controllers: [CustomerContractsController, ManagerContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
