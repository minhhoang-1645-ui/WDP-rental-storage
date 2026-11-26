import { Body, GoneException, Controller, Get, Global, Module, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessPolicyService } from './business-policy.service.js';

@Controller('operations/business-policies')
@UseGuards(AuthGuard, RolesGuard)
@Roles('BUSINESS_OPERATIONS_MANAGER')
class BusinessPolicyController {
  constructor(private readonly policies: BusinessPolicyService) {}
  @Get() list(@Req() request:AuthenticatedRequest) { return this.policies.list(request.user!); }
  @Patch(':id') save(@Param('id') key: string, @Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) { return this.policies.save(key, body, request.user!); }
}
@Controller('admin/business-policies')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SYSTEM_ADMINISTRATOR')
class LegacyBusinessPolicyController {
 @Get() list() { throw new GoneException('Chính sách thuộc khu vực Điều hành kinh doanh.'); }
 @Patch(':id') save() { throw new GoneException('Chính sách thuộc khu vực Điều hành kinh doanh.'); }
}
@Controller('business-policies/applied')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STORAGE_CUSTOMER', 'FACILITY_MANAGER', 'FACILITY_STAFF')
class AppliedBusinessPolicyController {
  constructor(private readonly policies: BusinessPolicyService) {}
  @Get() list(@Req() request: AuthenticatedRequest) {
    const actor = request.user!;
    return actor.role === 'FACILITY_STAFF' ? this.policies.staffApplied(actor) : this.policies.applied(actor);
  }
}

@Global()
@Module({ imports: [AuthModule], controllers: [AppliedBusinessPolicyController, BusinessPolicyController, LegacyBusinessPolicyController], providers: [BusinessPolicyService], exports: [BusinessPolicyService] })
export class BusinessPolicyModule {}
