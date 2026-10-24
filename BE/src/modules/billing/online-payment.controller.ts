import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { CreateOnlinePaymentDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { OnlinePaymentService } from './online-payment.service.js';

@Controller()
@ApiTags('Online Payment')
export class OnlinePaymentController {
  constructor(private readonly service: OnlinePaymentService) {}

  @Post('customer/invoices/:invoiceId/online-payment')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Tạo giao dịch VNPay cho toàn bộ số dư hóa đơn', description: 'Không cho client tự chọn amount. Payment chỉ được tạo sau IPN hợp lệ.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'vnpay-invoice-20261012-001' })
  @ApiBody({ type: CreateOnlinePaymentDto })
  @ApiCreatedResponse({ schema: { example: { transactionId: 'transaction-id', merchantOrderRef: 'WDP...', status: 'PENDING', amount: 3000000, paymentUrl: 'https://sandbox.vnpayment.vn/...' } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu/sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Không phải CUSTOMER.' })
  @ApiNotFoundResponse({ description: 'Invoice không thuộc Customer.' })
  @ApiConflictResponse({ description: 'Invoice đã PAID hoặc không hỗ trợ thanh toán online.' })
  create(@Param('invoiceId') invoiceId: string, @Body() body: Record<string, unknown>, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest & Request) { return this.service.create(invoiceId, body, key, request.user!, request.ip ?? request.socket.remoteAddress ?? '127.0.0.1'); }

  @Get('customer/online-payments/:transactionId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Trạng thái giao dịch VNPay của Customer', description: 'Read-only polling endpoint. Chỉ trả giao dịch thuộc Customer đang đăng nhập; không xác nhận hoặc ghi nhận thanh toán.' })
  @ApiOkResponse({ schema: { example: { transactionId: 'transaction-id', merchantOrderRef: 'WDP...', status: 'PENDING', providerStatus: 'PENDING', amount: 3000000, paidAt: null, updatedAt: '2026-10-24T02:00:00.000Z', invoice: { id: 'invoice-id', invoiceCode: 'WDP-2026-AB12-I01', status: 'OPEN', amountPaid: 0, balanceDue: 3000000, paidAt: null }, payment: null } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu/sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Không phải CUSTOMER.' })
  @ApiNotFoundResponse({ description: 'Giao dịch không tồn tại hoặc không thuộc Customer.' })
  status(@Param('transactionId') transactionId: string, @Req() request: AuthenticatedRequest) { return this.service.getCustomerStatus(transactionId, request.user!); }

  @Get('payments/vnpay/ipn')
  @ApiOperation({ summary: 'VNPay IPN', description: 'Public provider callback. Xác minh checksum, order và amount; retry an toàn. Không dùng endpoint này từ UI.' })
  @ApiOkResponse({ schema: { example: { RspCode: '00', Message: 'Confirm Success' } } })
  @ApiBadRequestResponse({ description: 'Payload provider không hợp lệ.' })
  ipn(@Query() query: Record<string, unknown>) { return this.service.processIpn(query); }

  @Get('payments/vnpay/return')
  @ApiOperation({ summary: 'VNPay browser return', description: 'Chỉ phục vụ UX và không ghi nhận Payment/PAID. Trạng thái chính thức đến từ IPN.' })
  @ApiOkResponse({ description: 'Kết quả chữ ký và trạng thái transaction hiện đang lưu.' })
  returnUrl(@Query() query: Record<string, unknown>) { return this.service.returnStatus(query); }
}
