import { Body, Controller, Get, Module, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { FacilityAccessService } from './facility-access.service.js';
@Controller('admin/facility-access')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SYSTEM_ADMINISTRATOR')
class FacilityAccessController {
 constructor(private readonly access: FacilityAccessService) {}
 @Patch('users/:id/role') role(@Req() req: AuthenticatedRequest,@Param('id') id:string,@Body() body:Record<string,unknown>){return this.access.changeRole(req.user!,id,body.role);}
 @Get() list(@Req() req:AuthenticatedRequest) { return this.access.list(req.user!); }
 @Post() grant(@Req() req: AuthenticatedRequest, @Body() body: Record<string,unknown>) { return this.access.grant(req.user!, body); }
 @Patch(':id/revoke') revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.access.revoke(req.user!, id); }
}
@Module({ imports:[AuthModule], controllers:[FacilityAccessController], providers:[FacilityAccessService] })
export class FacilityAccessModule {}
