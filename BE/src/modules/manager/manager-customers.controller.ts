import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { BadRequestException, Controller, Get, Param, Query, UseGuards , Req} from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ManagerService } from './manager.service.js';

@Controller('manager/customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiTags('Manager Customer')
@ApiBearerAuth('bearerAuth')
export class ManagerCustomersController {
  constructor(private readonly manager: ManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách khách hàng', description: 'FACILITY_MANAGER hoặc SYSTEM_ADMINISTRATOR. Chỉ trả User có role STORAGE_CUSTOMER và không bao giờ trả passwordHash.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'search', required: false, example: 'nguyen@example.test', description: 'Tìm theo tên, email hoặc số điện thoại; không phân biệt hoa thường.' })
  @ApiOkResponse({ description: 'Danh sách khách hàng ổn định theo createdAt mới nhất.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ id: 'customer-id', fullName: 'Nguyen Van A', email: 'nguyen@example.test', phone: '0900000000', accountStatus: 'ACTIVE', createdAt: '2026-10-05T03:00:00.000Z', reservationCount: 1, latestReservation: { reference: 'WDP-2026-AB12CD34', storageType: { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12' }, quantity: 1, startDate: '2026-11-01', endDate: '2027-02-01', status: 'PENDING' } }] } } })
  @ApiBadRequestResponse({ description: 'Pagination hoặc search không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'STORAGE_CUSTOMER và FACILITY_STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>, @Req() foundationRequest: AuthenticatedRequest) {
    const page = this.positiveInteger(query.page, 1, 100000, 'page');
    const limit = this.positiveInteger(query.limit, 20, 100, 'limit');
    const search = this.optionalText(query.search);
    return this.manager.listCustomers({ page, limit, ...(search ? { search } : {}) }, foundationRequest.user!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết khách hàng', description: 'FACILITY_MANAGER hoặc SYSTEM_ADMINISTRATOR. Trả thông tin liên hệ cơ bản và lịch sử Reservation của đúng khách hàng.' })
  @ApiParam({ name: 'id', example: 'customer-id' })
  @ApiOkResponse({ description: 'Khách hàng và lịch sử reservation; không chứa passwordHash hay token.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'STORAGE_CUSTOMER và FACILITY_STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy STORAGE_CUSTOMER.' })
  get(@Param('id') id: string, @Req() foundationRequest: AuthenticatedRequest) {
    return this.manager.getCustomer(id, foundationRequest.user!);
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
