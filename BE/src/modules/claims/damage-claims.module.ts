import { Body, Controller, Get, Headers, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { DamageClaimsService } from './damage-claims.service.js';
@Controller('customer/damage-claims') @UseGuards(AuthGuard, RolesGuard) @Roles('CUSTOMER')
class CustomerDamageClaimsController {
  constructor(private readonly service: DamageClaimsService) {}
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: Record<string, unknown>) { return this.service.list(r.user!, q); }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() b: Record<string, unknown>, @Headers('idempotency-key') key?: string) { return this.service.create(r.user!, b, key); }
}
@Controller(['staff/management/damage-claims', 'manager/damage-claims']) @UseGuards(AuthGuard, RolesGuard) @Roles('STAFF', 'MANAGER')
class OperationalDamageClaimsController {
  constructor(private readonly service: DamageClaimsService) {}
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: Record<string, unknown>) { return this.service.list(r.user!, q); }
  @Patch(':id') action(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Record<string, unknown>) { return this.service.action(r.user!, id, b); }
}
@Module({ imports: [AuthModule], controllers: [CustomerDamageClaimsController, OperationalDamageClaimsController], providers: [DamageClaimsService] })
export class DamageClaimsModule {}
