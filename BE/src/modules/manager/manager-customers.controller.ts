import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ManagerService } from './manager.service.js';

@Controller('manager/customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Customer')
@ApiBearerAuth('bearerAuth')
export class ManagerCustomersController {
  constructor(private readonly manager: ManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách khách hàng', description: 'MANAGER hoặc ADMIN. Chỉ trả User có role CUSTOMER và không bao giờ trả passwordHash.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'search', required: false, example: 'nguyen@example.test', description: 'Tìm theo tên, email hoặc số điện thoại; không phân biệt hoa thường.' })
  @ApiOkResponse({ description: 'Danh sách khách hàng ổn định theo createdAt mới nhất.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ id: 'customer-id', fullName: 'Nguyen Van A', email: 'nguyen@example.test', phone: '0900000000', accountStatus: 'ACTIVE', createdAt: '2026-10-05T03:00:00.000Z', reservationCount: 1, latestReservation: { reference: 'WDP-2026-AB12CD34', storageType: { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12' }, quantity: 1, startDate: '2026-11-01', endDate: '2027-02-01', status: 'PENDING' } }] } } })
  @ApiBadRequestResponse({ description: 'Pagination hoặc search không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    const page = this.positiveInteger(query.page, 1, 100000, 'page');
    const limit = this.positiveInteger(query.limit, 20, 100, 'limit');
    const search = this.optionalText(query.search);
    return this.manager.listCustomers({ page, limit, ...(search ? { search } : {}) });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết khách hàng', description: 'MANAGER hoặc ADMIN. Trả thông tin liên hệ cơ bản và lịch sử Reservation của đúng khách hàng.' })
  @ApiParam({ name: 'id', example: 'customer-id' })
  @ApiOkResponse({ description: 'Khách hàng và lịch sử reservation; không chứa passwordHash hay token.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CUSTOMER.' })
  get(@Param('id') id: string) {
    return this.manager.getCustomer(id);
  }

  private positiveInteger(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} phải từ 1–${maximum}.`);
    return parsed;
  }

  private optionalText(value: unknown) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 100) throw new BadRequestException('search không hợp lệ.');
    return value.trim();
  }
}
