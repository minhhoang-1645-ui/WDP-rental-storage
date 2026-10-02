import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { UserRepository } from '../users/user.repository.js';
import { AuthGuard } from './auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}
  @Get()
  async list(@Query('page') pageInput = '1', @Query('limit') limitInput = '20') {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('page phải từ 1–100000, limit phải từ 1–100.');
    }
    const users = await this.users.list((page - 1) * limit, limit);
    return { page, limit, items: users.map(user => ({ id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role })) };
  }
}
