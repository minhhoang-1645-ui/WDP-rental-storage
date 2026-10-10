import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { RecordPaymentRequestDto } from '../../openapi/api-dtos.js';
import { BillingService, type InvoiceListQuery, type PaymentListQuery } from './billing.service.js';

const invoiceStatuses = ['OPEN', 'PARTIALLY_PAID', 'PAID'] as const;
const paymentMethods = ['BANK_TRANSFER', 'CASH'] as const;

@Controller('manager')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Billing')
@ApiBearerAuth('bearerAuth')
export class ManagerBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  @ApiOperation({ summary: 'Danh sách Invoice', description: 'MANAGER/ADMIN. INITIAL và RECURRING đều ở cấp Reservation, kể cả quantity > 1. PAY_MONTHLY 6 tháng có I01 + 5 kỳ recurring; PREPAID, DAILY và PAY_MONTHLY 1 tháng không có recurring.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDP-2026-AB12CD34' })
  @ApiQuery({ name: 'status', required: false, enum: invoiceStatuses })
  @ApiQuery({ name: 'type', required: false, enum: ['INITIAL', 'RECURRING', 'RENEWAL', 'SETTLEMENT'] })
  @ApiQuery({ name: 'billingCycle', required: false, example: 2, description: '1 là INITIAL; từ 2 trở lên là RECURRING.' })
  @ApiQuery({ name: 'renewalCycle', required: false, example: 1, description: 'Chu kỳ bên trong một RenewalRequest.' })
  @ApiOkResponse({ description: 'Danh sách Invoice và số dư.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ invoiceCode: 'WDP-2026-AB12CD34-I01', type: 'INITIAL', status: 'PARTIALLY_PAID', totalAmount: 5800000, amountPaid: 3000000, balanceDue: 2800000 }] } } })
  @ApiBadRequestResponse({ description: 'Pagination hoặc filter không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  listInvoices(@Query() query: Record<string, unknown>) {
    return this.billing.listManagerInvoices(this.invoiceQuery(query));
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Chi tiết Invoice', description: 'Phân biệt historicalPricing toàn kỳ với số tiền Initial Invoice hiện phải trả.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-I01' })
  @ApiOkResponse({ description: 'Invoice → Reservation → Customer → Contracts/Units → historicalPricing → Payments.', schema: { examples: {
    daily: { summary: 'DAILY Small 7 ngày', value: { invoiceCode: 'WDP-2026-DAILY001-I01', type: 'INITIAL', status: 'OPEN', rentalAmount: 350000, depositAmount: 350000, totalAmount: 700000, amountPaid: 0, balanceDue: 700000, historicalPricing: { billingMode: 'DAILY', rentalAmount: 350000, depositAmount: 350000 } } },
    prepaid: { summary: 'PREPAID Small 6 tháng', value: { invoiceCode: 'WDP-2026-PREPAY01-I01', type: 'INITIAL', status: 'OPEN', rentalAmount: 8100000, depositAmount: 1500000, totalAmount: 9600000, historicalPricing: { billingMode: 'MONTHLY', paymentPlan: 'PREPAID', rentalAmount: 8100000, discountAmount: 900000, depositAmount: 1500000 } } },
    payMonthly: { summary: 'PAY_MONTHLY Medium 6 tháng', value: { invoiceCode: 'WDP-2026-MONTH001-I01', type: 'INITIAL', status: 'OPEN', rentalAmount: 2900000, depositAmount: 2900000, totalAmount: 5800000, historicalPricing: { billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 2900000, rentalAmount: 17400000, depositAmount: 2900000 } } },
    recurringQuantityThree: { summary: 'Recurring kỳ 2, quantity 3', value: { invoiceCode: 'WDP-2026-MONTH003-I02', type: 'RECURRING', billingCycle: 2, billingPeriodStart: '2026-12-10', billingPeriodEnd: '2027-01-10', dueAt: '2026-12-10', isPastDue: false, status: 'OPEN', rentalAmount: 4500000, depositAmount: 0, totalAmount: 4500000, amountPaid: 0, balanceDue: 4500000, historicalPricing: { billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', termMonths: 6, quantity: 3, monthlyUnitPrice: 1500000 } } },
    pastDue: { summary: 'Quá hạn nhưng vẫn OPEN, không phí/phạt tự động', value: { invoiceCode: 'WDP-2026-MONTH001-I02', type: 'RECURRING', billingCycle: 2, dueAt: '2026-09-10', isPastDue: true, status: 'OPEN', rentalAmount: 2900000, depositAmount: 0, totalAmount: 2900000, amountPaid: 0, balanceDue: 2900000 } },
  } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Invoice.' })
  getInvoice(@Param('id') id: string) {
    return this.billing.getManagerInvoice(id);
  }

  @Post('invoices/:invoiceId/payments')
  @ApiOperation({ summary: 'Ghi nhận Payment', description: 'MANAGER/ADMIN. Payment append-only. INITIAL paid mở handover; RENEWAL paid hoàn tất gia hạn; SETTLEMENT paid đủ tự đóng DepositSettlement khi không có refund.' })
  @ApiParam({ name: 'invoiceId', example: 'WDP-2026-AB12CD34-I01' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'payment-bank-ref-123', description: 'Khóa duy nhất 8–200 ký tự cho lần ghi nhận thanh toán.' })
  @ApiBody({ type: RecordPaymentRequestDto, examples: {
    partial: { summary: 'Thanh toán một phần: 5.800.000 → còn 2.800.000', value: { amount: 3000000, method: 'BANK_TRANSFER', reference: 'BANK-REF-123', note: 'Thanh toán đợt 1' } },
    final: { summary: 'Thanh toán phần còn lại', value: { amount: 2800000, method: 'BANK_TRANSFER', reference: 'BANK-REF-124', note: 'Thanh toán đủ' } },
    recurringEarly: { summary: 'Thanh toán sớm hóa đơn recurring tương lai', value: { amount: 2900000, method: 'BANK_TRANSFER', reference: 'BANK-RECURRING-EARLY', note: 'Thanh toán kỳ tháng tiếp theo trước hạn' } },
  } })
  @ApiCreatedResponse({ description: 'Payment đã ghi nhận; response cho biết Invoice và trạng thái contracts mới nhất.', schema: { example: { payment: { paymentCode: 'WDP-2026-AB12CD34-I01-P01', amount: 3000000, method: 'BANK_TRANSFER', recordedBy: { fullName: 'WDP Demo Manager', role: 'MANAGER' } }, invoice: { invoiceCode: 'WDP-2026-AB12CD34-I01', status: 'PARTIALLY_PAID', amountPaid: 3000000, balanceDue: 2800000 }, contracts: [{ contractCode: 'WDP-2026-AB12CD34-C01', status: 'PENDING_PAYMENT' }] } } })
  @ApiBadRequestResponse({ description: 'amount/method/Idempotency-Key không hợp lệ hoặc amount vượt balanceDue.' })
  @ApiConflictResponse({ description: 'Invoice đã PAID, Idempotency-Key xung đột hoặc cập nhật đồng thời.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được ghi nhận Payment.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Invoice.' })
  recordPayment(@Req() request: AuthenticatedRequest, @Param('invoiceId') invoiceId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: Record<string, unknown>) {
    return this.billing.recordPayment(invoiceId, body, idempotencyKey, request.user!);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Danh sách Payment', description: 'MANAGER/ADMIN; stable sorting theo receivedAt.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'BANK-REF-123' })
  @ApiQuery({ name: 'method', required: false, enum: paymentMethods })
  @ApiOkResponse({ description: 'Danh sách Payment.' })
  @ApiBadRequestResponse({ description: 'Pagination hoặc filter không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  listPayments(@Query() query: Record<string, unknown>) {
    return this.billing.listManagerPayments(this.paymentQuery(query));
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Chi tiết Payment' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-I01-P01' })
  @ApiOkResponse({ description: 'Payment, Invoice, Reservation và người ghi nhận.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Payment.' })
  getPayment(@Param('id') id: string) {
    return this.billing.getManagerPayment(id);
  }

  private invoiceQuery(query: Record<string, unknown>): InvoiceListQuery {
    const common = this.commonQuery(query);
    const status = this.optional(query.status, 'status');
    if (status && !invoiceStatuses.includes(status as (typeof invoiceStatuses)[number])) throw new BadRequestException('Invoice status không hợp lệ.');
    const type = this.optional(query.type, 'type');
    if (type && !['INITIAL', 'RECURRING', 'RENEWAL', 'SETTLEMENT'].includes(type)) throw new BadRequestException('Invoice type không hợp lệ.');
    const billingCycle = query.billingCycle === undefined ? undefined : this.integer(query.billingCycle, 1, 120, 'billingCycle');
    const renewalCycle = query.renewalCycle === undefined ? undefined : this.integer(query.renewalCycle, 1, 120, 'renewalCycle');
    return { ...common, ...(status ? { status: status as InvoiceListQuery['status'] } : {}), ...(type ? { type: type as InvoiceListQuery['type'] } : {}), ...(billingCycle ? { billingCycle } : {}), ...(renewalCycle ? { renewalCycle } : {}) };
  }

  private paymentQuery(query: Record<string, unknown>): PaymentListQuery {
    const common = this.commonQuery(query);
    const method = this.optional(query.method, 'method');
    if (method && !paymentMethods.includes(method as (typeof paymentMethods)[number])) throw new BadRequestException('Payment method không hợp lệ.');
    return { ...common, ...(method ? { method: method as PaymentListQuery['method'] } : {}) };
  }

  private commonQuery(query: Record<string, unknown>) {
    const page = this.integer(query.page, 1, 100000, 'page');
    const limit = this.integer(query.limit, 20, 100, 'limit');
    const search = this.optional(query.search, 'search');
    return { page, limit, ...(search ? { search } : {}) };
  }

  private integer(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return parsed;
  }

  private optional(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 100) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }
}
