import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ClosureRelocationService } from './closure-relocation.service.js';

@Controller('relocations')
@UseGuards(AuthGuard, RolesGuard)
export class ClosureRelocationController {
  constructor(private readonly relocation: ClosureRelocationService) {}

  @Roles('FACILITY_MANAGER')
  @Get('affected') affected(@Req() req: AuthenticatedRequest) { return this.relocation.affected(req.user!); }
  @Roles('FACILITY_MANAGER')
  @Get('pending-bookings') pendingBookings(@Req() req: AuthenticatedRequest) { return this.relocation.pendingBookings(req.user!); }
  @Roles('FACILITY_MANAGER')
  @Post('bookings/:id/resolve') resolveBooking(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:Record<string,unknown>) { return this.relocation.resolveBooking(id,req.user!,body); }
  @Roles('FACILITY_MANAGER')
  @Post('facilities/:id/notify') notify(@Req() req:AuthenticatedRequest,@Param('id') id:string) { return this.relocation.notifyCustomers(id,req.user!); }
  @Roles('FACILITY_MANAGER')
  @Post('contracts/:id/assign') assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.assign(id, req.user!, body); }
  @Roles('FACILITY_STAFF')
  @Get('tasks') tasks(@Req() req: AuthenticatedRequest) { return this.relocation.tasks(req.user!); }
  @Roles('FACILITY_STAFF')
  @Get('tasks/:id/destinations') destinations(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.relocation.destinations(id, req.user!); }
  @Roles('FACILITY_STAFF')
  @Post('tasks/:id/propose') propose(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.propose(id, req.user!, body); }
  @Roles('FACILITY_STAFF')
  @Post('tasks/:id/exception') exception(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.exception(id, req.user!, body); }
  @Roles('FACILITY_MANAGER', 'FACILITY_STAFF', 'STORAGE_CUSTOMER')
  @Get() records(@Req() req: AuthenticatedRequest) { return this.relocation.records(req.user!); }
  @Roles('FACILITY_STAFF', 'STORAGE_CUSTOMER')
  @Post(':id/consent') consent(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.consent(id, req.user!, body); }
  @Roles('FACILITY_MANAGER')
  @Post(':id/receiving-staff') receiving(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.assignReceiving(id, req.user!, body); }
  @Roles('FACILITY_MANAGER')
  @Post(':id/safety') safety(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.safety(id, req.user!, body); }
  @Roles('FACILITY_MANAGER')
  @Post(':id/services') services(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.approveServices(id, req.user!, body); }
  @Roles('FACILITY_MANAGER')
  @Post('tasks/:id/resolve-exception') resolveException(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.resolveException(id, req.user!, body); }
  @Roles('FACILITY_MANAGER')
  @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.cancel(id, req.user!, body); }
  @Roles('FACILITY_STAFF')
  @Post(':id/handover') handover(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.relocation.handover(id, req.user!, body); }
  @Roles('FACILITY_STAFF')
  @Post(':id/report-exception') reportTransferException(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:Record<string,unknown>) { return this.relocation.reportTransferException(id,req.user!,body); }
}
