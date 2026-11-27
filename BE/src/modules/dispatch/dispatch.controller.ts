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

  @Get('staff/assignment-queue')
  @Roles('FACILITY_STAFF')
  available(@Req() req: AuthenticatedRequest, @Query('view') view?: string) {
    return this.queue.list(req.user!, view === 'schedule');
  }

  @Get('manager/assignment-queue')
  @Roles('FACILITY_MANAGER')
  async managerQueue(@Req() req: AuthenticatedRequest) {
    const [queue, coordination] = await Promise.all([this.queue.list(req.user!), this.queue.coordination(req.user!)]);
    return { ...queue, ...coordination };
  }

  @Patch('staff/assignment-queue/:kind/:id/claim')
  @Roles('FACILITY_STAFF')
  claim(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('id') id: string) {
    return this.queue.claim(req.user!, kind, id);
  }

  @Patch('staff/assignment-queue/:kind/:id/escalate')
  @Roles('FACILITY_STAFF')
  escalate(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.queue.exception(req.user!, kind, id, input, false);
  }

  @Patch('manager/assignment-queue/:kind/:id/resume')
  @Roles('FACILITY_MANAGER')
  resume(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.queue.exception(req.user!, kind, id, input, true);
  }

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
