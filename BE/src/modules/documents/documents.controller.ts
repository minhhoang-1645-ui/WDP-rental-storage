import { Controller, Get, Param, Req, Res, UseGuards, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { RenewalsService } from '../renewals/renewals.service.js';
import { BillingService } from '../billing/billing.service.js';
import { PdfDocumentService } from './pdf-document.service.js';

function send(response: Response, bytes: Buffer, name: string) {
  response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  response.send(bytes);
}

@Controller('customer/documents')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CustomerDocumentsController {
  constructor(private readonly contracts: ContractsService, private readonly renewals: RenewalsService, private readonly billing: BillingService, private readonly pdf: PdfDocumentService) {}
  @Get('contracts/:id')
  async contract(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Res() response: Response) {
    const record = await this.contracts.getCustomerContract(request.user!.id, id);
    send(response, await this.pdf.contract(record), record.contractCode);
  }
  @Get('renewals/:id')
  async appendix(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Res() response: Response) {
    const record = await this.renewals.getCustomerRenewal(request.user!.id, id);
    if (!record.appendix?.snapshot) throw new NotFoundException('Phụ lục chưa được lập hoặc hồ sơ cũ chưa lưu nội dung để xuất PDF.');
    send(response, await this.pdf.appendix(record, request.user!), record.appendix.code);
  }
  @Get('invoices/:id')
  async invoice(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Res() response: Response) {
    const record = await this.billing.getCustomerInvoice(request.user!.id, id);
    const contracts = await Promise.all(record.contracts.map((item: any) => this.contracts.getCustomerContract(request.user!.id, item.id)));
    const renewal = record.renewalRequest?.id ? await this.renewals.getCustomerRenewal(request.user!.id, record.renewalRequest.id) : undefined;
    send(response, await this.pdf.invoice(record, contracts[0]?.reservation.customer ?? request.user!, contracts, renewal), record.invoiceCode);
  }
}

@Controller('manager/documents')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER')
export class ManagerDocumentsController {
  constructor(private readonly contracts: ContractsService, private readonly renewals: RenewalsService, private readonly billing: BillingService, private readonly pdf: PdfDocumentService) {}
  @Get('contracts/:id')
  async contract(@Param('id') id: string, @Res() response: Response) { const record = await this.contracts.getManagerContract(id); send(response, await this.pdf.contract(record), record.contractCode); }
  @Get('renewals/:id')
  async appendix(@Param('id') id: string, @Res() response: Response) { const record = await this.renewals.getManagerRenewal(id); if (!record.appendix?.snapshot) throw new NotFoundException('Phụ lục chưa được lập hoặc thiếu bản nội dung gốc.'); send(response, await this.pdf.appendix(record, record.customer), record.appendix.code); }
  @Get('invoices/:id')
  async invoice(@Param('id') id: string, @Res() response: Response) {
    const record = await this.billing.getManagerInvoice(id);
    const contracts = await Promise.all(record.contracts.map((item: any) => this.contracts.getManagerContract(item.id)));
    const renewal = record.renewalRequest?.id ? await this.renewals.getManagerRenewal(record.renewalRequest.id) : undefined;
    send(response, await this.pdf.invoice(record, record.reservation.customer, contracts, renewal), record.invoiceCode);
  }
}

@Controller('staff/management/documents')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF')
export class StaffDocumentsController {
  constructor(private readonly contracts: ContractsService, private readonly renewals: RenewalsService, private readonly pdf: PdfDocumentService) {}
  @Get('contracts/:id')
  async contract(@Param('id') id: string, @Res() response: Response) { const record = await this.contracts.getManagerContract(id); send(response, await this.pdf.contract(record), record.contractCode); }
  @Get('renewals/:id')
  async appendix(@Param('id') id: string, @Res() response: Response) { const record = await this.renewals.getManagerRenewal(id); if (!record.appendix?.snapshot) throw new NotFoundException('Phụ lục chưa được lập hoặc thiếu bản nội dung gốc.'); send(response, await this.pdf.appendix(record, record.customer), record.appendix.code); }
}
