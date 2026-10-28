import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, PublicUser } from './auth.types.js';

export const Roles = (...roles: PublicUser['role'][]) => SetMetadata('allowedRoles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<PublicUser['role'][]>('allowedRoles', [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { originalUrl?: string; method?: string }>();
    const user = request.user;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('managerAssignment', targets)) {
      const permitted = ['PATCH', 'POST'].includes(request.method ?? '') && ['MANAGER', 'ADMIN'].includes(user?.role ?? '') && /^\/(?:api\/)?manager\//.test(request.originalUrl ?? '');
      if (!permitted) throw new ForbiddenException('Chỉ quản lý được phân công nhân viên.');
      return true;
    }
    const workflow = this.reflector.getAllAndOverride<boolean>('staffWorkflow', targets);
    const lookup = this.reflector.getAllAndOverride<boolean>('staffLookup', targets);
    if (workflow || lookup) {
      const staffNamespace = /^\/(?:api\/)?staff\/management(?:\/|$)/.test(request.originalUrl ?? '');
      const permitted = staffNamespace
        ? user?.role === 'STAFF' && (!lookup || request.method === 'GET')
        : ['MANAGER', 'ADMIN'].includes(user?.role ?? '') && request.method === 'GET';
      if (!permitted) throw new ForbiddenException('Chức năng vận hành này do nhân viên kho xử lý.');
      return true;
    }
    if (!user || !roles?.includes(user.role)) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    return true;
  }
}
