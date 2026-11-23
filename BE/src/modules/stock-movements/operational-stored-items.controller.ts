import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { parseStoredItemQuery } from './stock-movement-query.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller(['staff/stored-items', 'manager/stored-items'])
@UseGuards(AuthGuard, RolesGuard) @Roles('FACILITY_STAFF', 'FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth') @ApiTags('Stored Items')
export class OperationalStoredItemsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.service.listOperationalStoredItems(req.user!, parseStoredItemQuery(query));
  }

  @Get(':id/history') @Roles('FACILITY_STAFF')
  history(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.service.listStaffStoredItemHistory(req.user!, id, parseStoredItemQuery(query));
  }
}
