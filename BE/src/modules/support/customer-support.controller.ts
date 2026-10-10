import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CreateSupportRequestDto } from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js'; import type { AuthenticatedRequest } from '../auth/auth.types.js'; import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { parseSupportQuery } from './support-query.js'; import { SupportService } from './support.service.js';
@Controller('customer/support-requests') @UseGuards(AuthGuard, RolesGuard) @Roles('CUSTOMER') @ApiTags('Customer Support') @ApiBearerAuth('bearerAuth')
export class CustomerSupportController {
  constructor(private readonly support: SupportService) {}
  @Post() @ApiOperation({ summary: 'Tạo Support Request cho rental/invoice thuộc Customer' }) @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'support-create-20261010-001' }) @ApiBody({ type: CreateSupportRequestDto }) @ApiCreatedResponse({ description: 'Tạo OPEN request với priority MEDIUM.' }) @ApiConflictResponse({ description: 'Operational category không có active rental.' }) @ApiForbiddenResponse({ description: 'Chỉ CUSTOMER.' })
  create(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.support.createCustomer(req.user!, body, key); }
  @Get() @ApiOperation({ summary: 'Danh sách Support Request của chính Customer' }) @ApiQuery({ name: 'page', required: false, example: 1 }) @ApiQuery({ name: 'limit', required: false, example: 20 }) @ApiOkResponse({ description: 'Không chứa internal escalation/assignment.' }) @ApiUnauthorizedResponse({ description: 'Thiếu/sai token.' })
  list(@Req() req: AuthenticatedRequest, @Query() q: Record<string, unknown>) { return this.support.listCustomer(req.user!.id, parseSupportQuery(q)); }
  @Get(':id') @ApiOperation({ summary: 'Chi tiết Support Request của chính Customer' }) @ApiParam({ name: 'id', example: 'WDP-SUP-ABC1234567' }) @ApiNotFoundResponse({ description: 'Không tồn tại hoặc không thuộc Customer.' })
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.support.getCustomer(req.user!.id, id); }
}
