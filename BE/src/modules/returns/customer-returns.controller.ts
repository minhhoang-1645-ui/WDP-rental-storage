import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CreateReturnRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ReturnsService } from './returns.service.js';

@Controller('customer/returns')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
@ApiTags('Customer Return')
@ApiBearerAuth('bearerAuth')
export class CustomerReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  @ApiOperation({ summary: 'Gửi yêu cầu trả toàn bộ rental', description: 'Chỉ từ effective endDate trở đi. Tạo inspection PENDING cho từng contract/unit; không release kho và không kết thúc contract.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'return-wdp-ab12cd34' })
  @ApiBody({ type: CreateReturnRequestDto, examples: { standard: { value: { reservationId: 'WDP-2026-AB12CD34', note: 'Đã dọn hết đồ khỏi kho.' } } } })
  @ApiCreatedResponse({ schema: { example: { returnCode: 'WDP-2026-AB12CD34-RT01', status: 'REQUESTED', reservation: { reference: 'WDP-2026-AB12CD34', quantity: 2, effectiveEndDate: '2027-05-10' }, inspectionSummary: { total: 2, pending: 2, passed: 0, issues: 0 } } } })
  @ApiBadRequestResponse({ description: 'Payload hoặc Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({ description: 'RETURN_BEFORE_END_DATE_NOT_SUPPORTED, unresolved renewal, active return hoặc rental không còn đủ ACTIVE/OCCUPIED.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER được phép.' })
  @ApiNotFoundResponse({ description: 'Reservation không tồn tại hoặc không thuộc Customer.' })
  create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.returns.createCustomerReturn(request.user!, body, key);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu trả kho của Customer' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Chỉ trả dữ liệu thuộc Customer; không lộ ghi chú issue nội bộ.' })
  list(@Req() request: AuthenticatedRequest, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.returns.listCustomerReturns(request.user!.id, this.pagination(page, limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu trả kho của Customer' })
  @ApiParam({ name: 'id', example: 'WDP-2026-AB12CD34-RT01' })
  @ApiOkResponse({ description: 'Trạng thái yêu cầu và tiến độ kiểm tra an toàn cho Customer.' })
  @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc Customer.' })
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.returns.getCustomerReturn(request.user!.id, id);
  }

  private pagination(pageInput: string, limitInput: string) {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Pagination không hợp lệ.');
    return { page, limit };
  }
}
