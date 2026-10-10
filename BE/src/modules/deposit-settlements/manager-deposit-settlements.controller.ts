import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RefundDepositRequestDto, ReviewDepositSettlementRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { DepositSettlementsService, type SettlementListQuery } from './deposit-settlements.service.js';

const statuses = ['PENDING_REVIEW', 'APPROVED', 'AWAITING_OUTSTANDING_PAYMENT', 'SETTLED'] as const;

@Controller('manager/deposit-settlements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Deposit Settlement')
@ApiBearerAuth('bearerAuth')
export class ManagerDepositSettlementsController {
  constructor(private readonly settlements: DepositSettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách quyết toán deposit cho Manager/Admin' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'RETURN-SM-001' })
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiOkResponse({ description: 'Stable pagination, customer, return, units, charges, refund và outstanding invoice.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() input: Record<string, unknown>) { return this.settlements.listManager(this.query(input)); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết quyết toán deposit' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01-DS01' })
  @ApiOkResponse({ description: 'Physical inspections, approved resolutions, internal review và invoice liên quan.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy settlement.' })
  get(@Param('id') id: string) { return this.settlements.getManager(id); }

  @Post(':id/review')
  @ApiOperation({ summary: 'Duyệt trách nhiệm và charge của inspection issues', description: 'Manager/Admin only. Staff observation không tự phát sinh deduction. Charges vượt deposit tạo đúng một SETTLEMENT Invoice.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01-DS01' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'settlement-review-ab12cd34' })
  @ApiBody({ type: ReviewDepositSettlementRequestDto, examples: {
    damage: { value: { issues: [{ inspectionId: 'inspection-id', issueType: 'CUSTOMER_DAMAGE', approvedChargeAmount: 800000, reason: 'Approved repair quotation for damaged door panel.' }], note: 'Reviewed against inspection report.' } },
    facilityFault: { value: { issues: [{ inspectionId: 'inspection-id', issueType: 'FACILITY_FAULT', approvedChargeAmount: 0, reason: 'Facility hardware fault; customer is not charged.' }] } },
    lostKey: { value: { issues: [{ inspectionId: 'inspection-id', issueType: 'LOST_KEY_OR_ACCESS_ITEM', approvedChargeAmount: 200000, reason: 'WDP V1 fixed lost-key charge.' }] } },
  } })
  @ApiCreatedResponse({ description: 'Settlement APPROVED, AWAITING_OUTSTANDING_PAYMENT hoặc SETTLED theo công thức.' })
  @ApiBadRequestResponse({ description: 'Issue set, amount hoặc reason không hợp lệ.' })
  @ApiConflictResponse({ description: 'Chưa physical return, đã review hoặc idempotency conflict.' })
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.settlements.review(id, body, key, request.user!);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Ghi nhận đã hoàn tiền deposit', description: 'Business record only; không gọi bank gateway. Chỉ APPROVED với refundAmount > 0 và outstandingAmount = 0.' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01-DS01' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'refund-20261009-001' })
  @ApiBody({ type: RefundDepositRequestDto, examples: { bank: { value: { method: 'BANK_TRANSFER', reference: 'REFUND-20261009-001', note: 'Deposit refund completed.' } } } })
  @ApiCreatedResponse({ description: 'Settlement và ReturnRequest chuyển SETTLED/COMPLETED.' })
  @ApiBadRequestResponse({ description: 'Method, reference hoặc Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({ description: 'Settlement chưa APPROVED, không có refund hoặc refund đã ghi.' })
  refund(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.settlements.refund(id, body, key, request.user!);
  }

  private query(input: Record<string, unknown>): SettlementListQuery {
    const page = this.integer(input.page, 1, 100000, 'page'); const limit = this.integer(input.limit, 20, 100, 'limit');
    const search = this.optional(input.search, 'search'); const status = this.optional(input.status, 'status');
    if (status && !statuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Settlement status không hợp lệ.');
    return { page, limit, ...(search ? { search } : {}), ...(status ? { status: status as SettlementListQuery['status'] } : {}) };
  }
  private integer(value: unknown, fallback: number, maximum: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
  private optional(value: unknown, label: string) { if (value === undefined || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
}
