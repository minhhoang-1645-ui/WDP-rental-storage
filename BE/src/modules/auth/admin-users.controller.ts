import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CreateAdminUserDto, UpdateAccountStatusDto } from '../../openapi/api-dtos.js';
import { UserRepository } from '../users/user.repository.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Roles, RolesGuard } from './roles.guard.js';

@Controller(['admin/users', 'users'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiTags('Admin User Management')
@ApiBearerAuth('bearerAuth')
export class AdminUsersController {
  constructor(@Inject(UserRepository) private readonly users: UserRepository, private readonly auth: AuthService) {}
  @Get()
  @ApiOperation({ summary: 'Liệt kê tài khoản', description: 'ADMIN only. /api/users được giữ như alias tương thích.' })
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
    const [total, users] = await Promise.all([this.users.count(), this.users.list((page - 1) * limit, limit)]);
    return { page, limit, total, items: users.map(user => this.publicUser(user)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết tài khoản', description: 'ADMIN only.' })
  @ApiOkResponse({ description: 'Thông tin tài khoản không chứa passwordHash.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản.' })
  async get(@Param('id') id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return this.publicUser(user);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo STAFF hoặc MANAGER', description: 'Không cho phép tạo ADMIN qua API này.' })
  @ApiBody({ type: CreateAdminUserDto })
  @ApiCreatedResponse({ description: 'Tài khoản nội bộ ACTIVE đã được tạo; passwordHash không được trả về.' })
  create(@Body() body: Record<string, unknown>) { return this.auth.createInternalUser(body); }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Bật hoặc vô hiệu hóa tài khoản', description: 'Dữ liệu lịch sử vẫn được giữ nguyên.' })
  @ApiBody({ type: UpdateAccountStatusDto })
  @ApiOkResponse({ description: 'Trạng thái tài khoản đã cập nhật.' })
  async updateStatus(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    if (body.accountStatus !== 'ACTIVE' && body.accountStatus !== 'DISABLED') throw new BadRequestException('accountStatus phải là ACTIVE hoặc DISABLED.');
    const user = await this.users.updateStatus(id, body.accountStatus);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return this.publicUser(user);
  }

  private publicUser(user: { id: string; fullName: string; email: string; phone: string; role: string; accountStatus: string }) {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, accountStatus: user.accountStatus };
  }
}
