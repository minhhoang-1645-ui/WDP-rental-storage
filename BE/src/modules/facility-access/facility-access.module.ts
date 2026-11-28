import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { FacilityAccessService } from './facility-access.service.js';
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SYSTEM_ADMINISTRATOR')
class FacilityAccessController {
 constructor(private readonly access: FacilityAccessService) {}
 @Patch('facility-access/users/:id/role') role(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() body:Record<string,unknown>){return this.access.changeRole(req.user!,id,body.role,body.expectedRole);}
 @Get('users/:id/access') userAccess(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.access.userAccess(req.user!, id); }
 @Get('users/:id/sessions') listSessions(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('page') page = '1') {
   return this.access.listSessions(req.user!, id, Number(page));
 }
 @Get('users/:id/sessions/:sessionId') session(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('sessionId') sessionId: string) {
   return this.access.getSession(req.user!, id, sessionId);
 }
 @Patch('users/:id/sessions/:sessionId/revoke') revokeSession(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('sessionId') sessionId: string) {
   return this.access.revokeSessions(req.user!, id, sessionId);
 }
 @Patch('users/:id/sessions/revoke') revokeSessions(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.access.revokeSessions(req.user!, id); }
 @Get('facility-access') list(@Req() req:AuthenticatedRequest) { return this.access.list(req.user!); }
 @Post('facility-access') grant(@Req() req: AuthenticatedRequest, @Body() body: Record<string,unknown>) { return this.access.grant(req.user!, body); }
 @Patch('facility-access/users/:id/relocate') relocate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.access.relocate(req.user!, id, body); }
 @Patch('facility-access/:id/revoke') revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.access.revoke(req.user!, id); }
}
@Module({ imports:[AuthModule], controllers:[FacilityAccessController], providers:[FacilityAccessService] })
export class FacilityAccessModule {}
