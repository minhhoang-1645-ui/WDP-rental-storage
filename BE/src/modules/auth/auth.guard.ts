import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bạn cần đăng nhập để tiếp tục.');
    request.user = await this.authService.getUserByToken(authorization.slice(7));
    const facility = request.query?.scopeFacilityId;
    if (request.user.role === 'FACILITY_MANAGER' && facility !== undefined) {
      if (typeof facility !== 'string' || !facility.trim() || facility.length > 120) throw new BadRequestException('Cơ sở đã chọn không hợp lệ.');
      request.user = { ...request.user, selectedFacilityId: facility };
    }
    return true;
  }
}
