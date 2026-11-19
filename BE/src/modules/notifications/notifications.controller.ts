import { Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.notifications.list(request.user!, query);
  }

  @Patch('read-all')
  markAll(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAll(request.user!);
  }

  @Patch(':token/read')
  mark(@Req() request: AuthenticatedRequest, @Param('token') token: string) {
    return this.notifications.mark(request.user!, token);
  }

  @Post(':token/open')
  @HttpCode(200)
  open(@Req() request: AuthenticatedRequest, @Param('token') token: string, @Query('client') client?: string) {
    return this.notifications.mark(request.user!, token, true, client === 'mobile');
  }
}
