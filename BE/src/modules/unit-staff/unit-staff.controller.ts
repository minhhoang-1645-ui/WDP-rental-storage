import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { UnitStaffService } from './unit-staff.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@ApiTags('Unit staff responsibility')
@ApiBearerAuth('bearerAuth')
export class UnitStaffController {
  constructor(private readonly service: UnitStaffService) {}
  @Get('manager/unit-staff-assignments')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Danh sách người phụ trách từng kho; chỉ hoạt động sau migration và feature flag' })
  list(@Req() request: AuthenticatedRequest) { return this.service.list(request.user!); }
  @Get('staff/assigned-units')
  @Roles('STAFF')
  @ApiOperation({ summary: 'Nhân viên chỉ xem các kho mình phụ trách' })
  mine(@Req() request: AuthenticatedRequest) { return this.service.list(request.user!); }
  @Patch('manager/units/:id/staff-assignment')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Gán một nhân viên phụ trách một kho, lưu lịch sử lần phân công' })
  assign(@Param('id') id: string, @Body() input: Record<string, unknown>, @Req() request: AuthenticatedRequest) { return this.service.assign(id, input, request.user!); }
}
