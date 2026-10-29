import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { BillingService } from './billing.service.js';
import { VnpayService } from './vnpay.service.js';

@Controller('customer')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Billing')
@ApiBearerAuth('bearerAuth')
export class CustomerBillingController {
  constructor(private readonly billing: BillingService, private readonly config: ConfigService, private readonly vnpay: VnpayService) {}

  @Get('payment-config')
  @ApiOperation({ summary: 'Các kênh thanh toán khả dụng và thông tin nhận chuyển khoản', description: 'configured là khả dụng của chuyển khoản/QR ngân hàng; vnpayConfigured là khả dụng của VNPay. Không bao gồm thông tin xác thực hoặc bí mật ngân hàng/cổng thanh toán.' })
  @ApiOkResponse({ schema: { example: { configured: true, vnpayConfigured: true, bankName: 'Vietcombank', bankCode: '970436', accountNumber: '0123456789', accountName: 'NESTBOX STORAGE' } } })
  getPaymentConfig(@Req() request: AuthenticatedRequest) {
    const bankName = this.config.get<string>('WDP_BANK_NAME')?.trim() ?? '';
    const bankCode = this.config.get<string>('WDP_BANK_CODE')?.trim() ?? '';
    const accountNumber = this.config.get<string>('WDP_BANK_ACCOUNT_NUMBER')?.trim() ?? '';
    const accountName = this.config.get<string>('WDP_BANK_ACCOUNT_NAME')?.trim() ?? '';
    return { configured: Boolean(bankName && /^\d{6}$/.test(bankCode) && accountNumber && accountName), vnpayConfigured: this.vnpay.isConfigured(), demoEnabled: this.billing.demoPaymentEnabled(request.user!), bankName, bankCode, accountNumber, accountName };
  }

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

  @Post('invoices/:invoiceId/payment-submissions')
  @ApiOperation({ summary: 'Gửi thông báo đã chuyển khoản', description: 'Tạo PaymentSubmission đang chờ xác minh. Đây KHÔNG phải Payment đã xác nhận và không cập nhật trạng thái tài chính của Invoice.' })
  @ApiParam({ name: 'invoiceId', example: 'WDP-2026-AB12CD34-I01' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'customer-transfer-01-uuid' })
  @ApiCreatedResponse({ description: 'PaymentSubmission PENDING_VERIFICATION; không tạo Payment.' })
  @ApiBadRequestResponse({ description: 'Số tiền, phương thức hoặc Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({ description: 'Hóa đơn đã trả đủ, không còn nhận thanh toán hoặc số dư đã thay đổi.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc khách hàng.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được gửi thông báo.' })
  createPaymentSubmission(@Req() request: AuthenticatedRequest, @Param('invoiceId') invoiceId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: Record<string, unknown>) {
    return this.billing.createCustomerPaymentSubmission(request.user!.id, invoiceId, body, idempotencyKey);
  }

  @Post('invoices/:invoiceId/demo-payment-submissions')
  @ApiOperation({ summary: 'Gửi yêu cầu thanh toán mô phỏng', description: 'Chỉ dành cho tài khoản demo trong môi trường phát triển. Không có giao dịch ngân hàng; Manager phải xác nhận trước khi hóa đơn được cập nhật.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Yêu cầu demo đang chờ Manager xác nhận; chưa tạo Payment.' })
  createDemoPaymentSubmission(@Req() request: AuthenticatedRequest, @Param('invoiceId') invoiceId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: Record<string, unknown>) {
    return this.billing.createDemoPaymentSubmission(request.user!, invoiceId, body, idempotencyKey);
  }

  @Get('payment-submissions')
  @ApiOperation({ summary: 'Danh sách thông báo chuyển khoản của khách hàng', description: 'Chỉ hiển thị yêu cầu thuộc CUSTOMER đang đăng nhập; Payment chưa xác minh không xuất hiện trong Payment history.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'PaymentSubmission của khách hàng.' })
  listPaymentSubmissions(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    const parsed = this.pagination(page, limit);
    return this.billing.listCustomerPaymentSubmissions(request.user!.id, parsed.page, parsed.limit);
  }

  @Get('payment-submissions/:id')
  @ApiOperation({ summary: 'Chi tiết thông báo chuyển khoản của khách hàng' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-I01-S01' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc khách hàng.' })
  getPaymentSubmission(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.billing.getCustomerPaymentSubmission(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }
}
