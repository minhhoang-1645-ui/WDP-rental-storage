import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, PublicUser } from './auth.types.js';

export const Roles = (...roles: PublicUser['role'][]) => SetMetadata('allowedRoles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<PublicUser['role'][]>('allowedRoles', [context.getHandler(), context.getClass()]);
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles?.includes(user.role)) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    return true;
  }
}
