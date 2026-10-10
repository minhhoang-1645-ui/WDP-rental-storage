import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { TransfersService } from './transfers.service.js';

@Controller('staff/transfers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF')
@ApiTags('Staff Transfers')
@ApiBearerAuth('bearerAuth')
export class StaffTransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Post(':id/complete')
  @ApiOperation({ summary: 'Hoàn tất chuyển unit vật lý', description: 'Atomically: allocation cũ được giữ và release, unit cũ → MAINTENANCE, unit mới → OCCUPIED, Contract giữ nguyên record.' })
  @ApiConflictResponse({ description: 'Transfer/unit state không còn hợp lệ.' })
  complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.transfers.complete(id, req.user!); }
}
