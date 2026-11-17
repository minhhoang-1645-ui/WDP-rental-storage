import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { parseStoredItemQuery } from './stock-movement-query.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller(['staff/stored-items', 'manager/stored-items'])
@UseGuards(AuthGuard, RolesGuard) @Roles('STAFF', 'MANAGER')
@ApiBearerAuth('bearerAuth') @ApiTags('Stored Items')
export class OperationalStoredItemsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.service.listOperationalStoredItems(req.user!, parseStoredItemQuery(query));
  }
}
