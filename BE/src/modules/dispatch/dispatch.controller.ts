import { ServiceCalendarService } from './service-calendar.service.js';
import { AssignmentQueueService } from './assignment-queue.service.js';
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DispatchController {
  constructor(private readonly queue: AssignmentQueueService, private readonly calendar: ServiceCalendarService) {}

  @Get('manager/service-calendar')
  @Roles('FACILITY_MANAGER')
  agenda(@Req() req: AuthenticatedRequest, @Query('from') from: string, @Query('to') to: string) {
    return this.calendar.agenda(req.user!, from, to);
  }

  @Patch('manager/service-calendar/returns/:id')
  @Roles('FACILITY_MANAGER')
  planReturn(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.calendar.planReturn(req.user!, id, input);
  }

  @Patch('manager/assignments/:kind/:id/release')
  @Roles('FACILITY_MANAGER')
  release(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.queue.release(req.user!, kind, id, input);
  }

}
