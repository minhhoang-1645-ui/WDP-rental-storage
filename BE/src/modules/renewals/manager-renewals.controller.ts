import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RejectRenewalRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { RenewalsService, type RenewalListQuery } from './renewals.service.js';

@Controller('manager/renewals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Renewal')
@ApiBearerAuth('bearerAuth')
export class ManagerRenewalsController {
  constructor(private readonly renewals: RenewalsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách Renewal cho Manager/Admin' })
  @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'WDPR-2027' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED'] })
  @ApiOkResponse({ description: 'Stable pagination, customer/contracts/units và renewal billing status.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER/STAFF không được phép.' })
  list(@Query() input: Record<string, unknown>) { return this.renewals.listManagerRenewals(this.query(input)); }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết Renewal cho Manager/Admin' })
  @ApiParam({ name: 'id', example: 'WDPR-2027-AB12CD34EF' })
  @ApiOkResponse({ description: 'Renewal snapshot, contracts/units, invoices và payments.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Renewal.' })
  get(@Param('id') id: string) { return this.renewals.getManagerRenewal(id); }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Duyệt Renewal', description: 'Recheck future allocation trong transaction. Thành công tạo invoice idempotently và chuyển APPROVED_PENDING_PAYMENT; chưa kéo dài contract.' })
  @ApiParam({ name: 'id', example: 'WDPR-2027-AB12CD34EF' })
  @ApiOkResponse({ description: 'Approved pending payment. PREPAID tạo 1 invoice; PAY_MONTHLY tạo invoice cho từng tháng.', schema: { examples: {
    approved: { summary: 'Approved pending payment', value: { renewalCode: 'WDPR-2027-AB12CD34EF', status: 'APPROVED_PENDING_PAYMENT', previousEndDate: '2027-05-10', requestedEndDate: '2027-08-10', paymentPlan: 'PAY_MONTHLY', invoices: [{ type: 'RENEWAL', renewalCycle: 1, billingPeriodStart: '2027-05-10', billingPeriodEnd: '2027-06-10', depositAmount: 0, status: 'OPEN' }] } },
    quantityThree: { summary: 'Một request gia hạn toàn bộ 3 contracts', value: { renewalCode: 'WDPR-2027-QTY3', status: 'APPROVED_PENDING_PAYMENT', reservation: { quantity: 3 }, contracts: [{ contractCode: 'C01' }, { contractCode: 'C02' }, { contractCode: 'C03' }] } },
    completed: { summary: 'Invoice kích hoạt PAID, contracts đã được kéo dài', value: { renewalCode: 'WDPR-2027-DONE', status: 'COMPLETED', previousEndDate: '2027-05-10', requestedEndDate: '2027-08-10', reservation: { currentEndDate: '2027-08-10' } } },
  } } })
  @ApiConflictResponse({ description: 'RENEWAL_ALLOCATION_CONFLICT, rental/endDate thay đổi hoặc trạng thái không hợp lệ.' })
  approve(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.renewals.approve(id, request.user!); }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Từ chối Renewal PENDING', description: 'REJECTED không giữ inventory.' })
  @ApiParam({ name: 'id', example: 'WDPR-2027-AB12CD34EF' })
  @ApiBody({ type: RejectRenewalRequestDto, examples: { conflict: { summary: 'Future allocation conflict', value: { reason: 'Kho đã có reservation xác nhận trong khoảng gia hạn.' } } } })
  @ApiOkResponse({ description: 'Renewal REJECTED với reviewer/reason.' })
  @ApiBadRequestResponse({ description: 'Lý do không hợp lệ.' })
  @ApiConflictResponse({ description: 'Chỉ PENDING được từ chối.' })
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.renewals.reject(id, body, request.user!); }

  private query(input: Record<string, unknown>): RenewalListQuery {
    const page = this.integer(input.page, 1, 100000, 'page'); const limit = this.integer(input.limit, 20, 100, 'limit');
    const search = this.optional(input.search); const status = this.optional(input.status);
    if (status && !['PENDING', 'APPROVED_PENDING_PAYMENT', 'COMPLETED', 'REJECTED'].includes(status)) throw new BadRequestException('Renewal status không hợp lệ.');
    return { page, limit, ...(search ? { search } : {}), ...(status ? { status: status as RenewalListQuery['status'] } : {}) };
  }
  private integer(value: unknown, fallback: number, max: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
  private optional(value: unknown) { if (value === undefined || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException('Filter không hợp lệ.'); return value.trim(); }
}
