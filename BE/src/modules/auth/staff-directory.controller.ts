import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRepository } from '../users/user.repository.js';
import { AuthGuard } from './auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';

@Controller('manager/staff')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiBearerAuth('bearerAuth')
@ApiTags('Staff Operations')
export class StaffDirectoryController {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}
  @Get()
  @ApiOperation({ summary: 'Nhân viên đang hoạt động có thể được phân công' })
  async list(@Query('page') pageInput = '1', @Query('limit') limitInput = '100') {
    const page = Number(pageInput), limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Phân trang không hợp lệ.');
    const filters = { role: 'STAFF' as const, accountStatus: 'ACTIVE' as const };
    const total = await this.users.count(filters);
    const users = await this.users.list((page - 1) * limit, limit, filters);
    return { page, limit, total, items: users.map(({ id, fullName, email }) => ({ id, fullName, email })) };
  }
}
