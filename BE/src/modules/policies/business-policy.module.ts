import { Body, Controller, Get, Global, Module, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessPolicyService } from './business-policy.service.js';

@Controller('admin/business-policies')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
class BusinessPolicyController {
  constructor(private readonly policies: BusinessPolicyService) {}
  @Get() list() { return this.policies.list(); }
  @Patch(':id') save(@Param('id') key: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) { return this.policies.save(key, body, request.user!.id); }
}
@Global()
@Module({ imports: [AuthModule], controllers: [BusinessPolicyController], providers: [BusinessPolicyService], exports: [BusinessPolicyService] })
export class BusinessPolicyModule {}
