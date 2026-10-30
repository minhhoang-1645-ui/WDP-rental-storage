import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { DocumentPolicyModule } from './document-policy.module.js';
import { PdfDocumentService } from './pdf-document.service.js';
import { CustomerDocumentsController, ManagerDocumentsController, StaffDocumentsController } from './documents.controller.js';
@Module({ imports: [AuthModule, ContractsModule, RenewalsModule, BillingModule, DocumentPolicyModule], controllers: [CustomerDocumentsController, ManagerDocumentsController, StaffDocumentsController], providers: [PdfDocumentService] })
export class DocumentsModule {}
