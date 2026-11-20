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
  @ApiOperation({ summary: 'Nhật ký chỉ đọc cho Admin: LOGIN, ACTIVITY hoặc ACCOUNT_NOTICES' })
  list(@Query() query: Record<string, unknown>) { return this.audit.list(query); }
}
