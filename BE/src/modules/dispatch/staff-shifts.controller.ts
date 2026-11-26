import { ServiceCalendarService } from './service-calendar.service.js';
import { AssignmentQueueService } from './assignment-queue.service.js';
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { StaffShiftsService } from './staff-shifts.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class StaffShiftsController {
  constructor(private readonly shifts: StaffShiftsService, private readonly queue: AssignmentQueueService, private readonly calendar: ServiceCalendarService) {}

  @Get('manager/shifts')
  @Roles('FACILITY_MANAGER')
  roster(@Req() req: AuthenticatedRequest, @Query('from') from: string, @Query('to') to: string, @Query('facilityId') facilityId?: string) {
    return this.shifts.list(req.user!, from, to, facilityId);
  }

  @Post('manager/shifts')
  @Roles('FACILITY_MANAGER')
  create(@Req() req: AuthenticatedRequest, @Body() input: Record<string, unknown>) {
    return this.shifts.plan(req.user!, input);
  }

  @Patch('manager/shifts/:id')
  @Roles('FACILITY_MANAGER')
  edit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.shifts.plan(req.user!, input, id);
  }

  @Patch('manager/shifts/:id/status')
  @Roles('FACILITY_MANAGER')
  status(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.shifts.mark(req.user!, id, input);
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

  @Get('staff/shifts')
  @Roles('FACILITY_STAFF')
  mine(@Req() req: AuthenticatedRequest, @Query('from') from: string, @Query('to') to: string) {
    return this.shifts.list(req.user!, from, to);
  }

  @Patch('staff/shifts/:id/check-in')
  @Roles('FACILITY_STAFF')
  checkIn(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.shifts.attend(req.user!, id, 'CHECK_IN');
  }

  @Patch('staff/shifts/:id/check-out')
  @Roles('FACILITY_STAFF')
  checkOut(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.shifts.attend(req.user!, id, 'CHECK_OUT');
  }

  @Patch('staff/shifts/:id/start-break')
  @Roles('FACILITY_STAFF')
  startBreak(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('revision') revision: unknown) {
    if (!Number.isSafeInteger(revision)) throw new BadRequestException('Cần phiên bản ca làm hiện tại.');
    return this.shifts.attend(req.user!, id, 'START_BREAK', revision);
  }

  @Patch('staff/shifts/:id/end-break')
  @Roles('FACILITY_STAFF')
  endBreak(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('revision') revision: unknown) {
    if (!Number.isSafeInteger(revision)) throw new BadRequestException('Cần phiên bản ca làm hiện tại.');
    return this.shifts.attend(req.user!, id, 'END_BREAK', revision);
  }
}
