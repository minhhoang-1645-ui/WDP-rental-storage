import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { BillingService } from './billing.service.js';

@Controller('customer')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Billing')
@ApiBearerAuth('bearerAuth')
export class CustomerBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  @ApiOperation({ summary: 'Danh sách hóa đơn của khách hàng', description: 'CUSTOMER chỉ xem Invoice thuộc Reservation của chính mình.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ schema: { example: { page: 1, limit: 20, total: 6, items: [{ invoiceCode: 'WDP-2026-AB12CD34-I02', type: 'RECURRING', billingCycle: 2, billingPeriodStart: '2026-12-10', billingPeriodEnd: '2027-01-10', dueAt: '2026-12-10', isPastDue: false, status: 'OPEN', rentalAmount: 2900000, depositAmount: 0, totalAmount: 2900000, amountPaid: 0, balanceDue: 2900000, currency: 'VND' }] } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  listInvoices(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    const parsed = this.pagination(page, limit);
    return this.billing.listCustomerInvoices(request.user!.id, parsed.page, parsed.limit);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Chi tiết hóa đơn của khách hàng' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-I01' })
  @ApiOkResponse({ description: 'Invoice, báo giá lịch sử, contracts, units và lịch sử payments.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc khách hàng.' })
  getInvoice(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.billing.getCustomerInvoice(request.user!.id, id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Lịch sử thanh toán của khách hàng', description: 'Read-only; CUSTOMER không được tự ghi nhận payment.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ schema: { example: { page: 1, limit: 20, total: 1, items: [{ paymentCode: 'WDP-2026-AB12CD34-I01-P01', amount: 3000000, method: 'BANK_TRANSFER', reference: 'BANK-REF-123', receivedAt: '2026-10-08T08:00:00.000Z', invoice: { invoiceCode: 'WDP-2026-AB12CD34-I01', status: 'PARTIALLY_PAID', balanceDue: 2800000 } }] } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  listPayments(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    const parsed = this.pagination(page, limit);
    return this.billing.listCustomerPayments(request.user!.id, parsed.page, parsed.limit);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Chi tiết thanh toán của khách hàng' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-I01-P01' })
  @ApiOkResponse({ description: 'Payment và Invoice liên quan.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc khách hàng.' })
  getPayment(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.billing.getCustomerPayment(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }
}
