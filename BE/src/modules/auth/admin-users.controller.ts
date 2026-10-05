import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserRepository } from '../users/user.repository.js';
import { AuthGuard } from './auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiTags('Auth')
@ApiBearerAuth('bearerAuth')
export class AdminUsersController {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}
  @Get()
  @ApiOperation({ summary: 'Liệt kê người dùng', description: 'ADMIN only.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Danh sách người dùng không chứa passwordHash.', schema: { example: { page: 1, limit: 20, items: [{ id: 'user-id', fullName: 'Nguyen Van A', email: 'customer@example.test', phone: '0900000000', role: 'CUSTOMER' }] } } })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'Chỉ ADMIN được phép.' })
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
