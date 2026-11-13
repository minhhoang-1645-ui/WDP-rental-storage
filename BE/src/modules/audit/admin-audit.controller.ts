import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AuditService } from './audit.service.js';

@Controller('admin/audit-events')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth('bearerAuth')
@ApiTags('Admin Audit')
export class AdminAuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}
  @Get()
  @ApiOperation({ summary: 'Nhật ký chỉ đọc: category LOGIN (đăng nhập/đăng xuất) hoặc ACTIVITY, outcome SUCCESS/FAILURE, role, search, from/to YYYY-MM-DD (UTC+7), page/limit' })
  list(@Query() query: Record<string, unknown>) { return this.audit.list(query); }
}
