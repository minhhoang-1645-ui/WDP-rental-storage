import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { RolesGuard } from './roles.guard.js';
import { AdminUsersController } from './admin-users.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, AuthGuard, RolesGuard],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
