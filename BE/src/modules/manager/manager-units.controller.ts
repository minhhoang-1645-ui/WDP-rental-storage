import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ManagerService, type UnitListQuery } from './manager.service.js';

const unitStatuses = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE'] as const;

@Controller('manager/units')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@ApiTags('Manager Storage Unit')
@ApiBearerAuth('bearerAuth')
export class ManagerUnitsController {
  constructor(private readonly manager: ManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách kho vật lý', description: 'MANAGER hoặc ADMIN. API chỉ đọc, không thay đổi trạng thái vật lý.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: '1–100.' })
  @ApiQuery({ name: 'search', required: false, example: 'A-01', description: 'Tìm một phần unit code, không phân biệt hoa thường.' })
  @ApiQuery({ name: 'status', required: false, enum: unitStatuses, example: 'AVAILABLE' })
  @ApiQuery({ name: 'storageType', required: false, example: 'sm-b12', description: 'Storage type ID hoặc code.' })
  @ApiQuery({ name: 'floor', required: false, example: 'Tầng 1' })
  @ApiQuery({ name: 'zone', required: false, example: 'A' })
  @ApiOkResponse({ description: 'Danh sách ổn định theo unitCode và allocation CONFIRMED hiện tại/tương lai.', schema: { example: { page: 1, limit: 20, total: 1, items: [{ id: 'unit-id', unitCode: 'SM-B12-01', storageType: { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12' }, category: { id: 'small', name: 'Kho nhỏ' }, condition: 'STANDARD', dimensions: { widthCm: 150, lengthCm: 200, heightCm: 240, display: '1,5 × 2,0 × 2,4 m' }, floor: 'Tầng 1', zone: 'B', row: 1, position: 1, status: 'AVAILABLE', allocationSummary: { current: null, future: [] } }] } } })
  @ApiBadRequestResponse({ description: 'Pagination hoặc status không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  list(@Query() query: Record<string, unknown>) {
    const parsed = this.parseListQuery(query);
    return this.manager.listUnits(parsed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết kho vật lý', description: 'MANAGER hoặc ADMIN. Chấp nhận database id hoặc unit code.' })
  @ApiParam({ name: 'id', example: 'SM-B12-01' })
  @ApiOkResponse({ description: 'Thông tin vật lý, allocation hiện tại, tương lai và lịch sử ReservationUnit liên quan.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc sai bearer token.' })
  @ApiForbiddenResponse({ description: 'CUSTOMER và STAFF không được phép.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy kho vật lý.' })
  get(@Param('id') id: string) {
    return this.manager.getUnit(id);
  }

  private parseListQuery(query: Record<string, unknown>): UnitListQuery {
    const page = this.positiveInteger(query.page, 1, 100000, 'page');
    const limit = this.positiveInteger(query.limit, 20, 100, 'limit');
    const status = this.optionalText(query.status, 'status');
    if (status && !unitStatuses.includes(status as (typeof unitStatuses)[number])) throw new BadRequestException('Trạng thái kho vật lý không hợp lệ.');
    return {
      page,
      limit,
      ...(this.optionalText(query.search, 'search') ? { search: this.optionalText(query.search, 'search') } : {}),
      ...(status ? { status: status as UnitListQuery['status'] } : {}),
      ...(this.optionalText(query.storageType, 'storageType') ? { storageType: this.optionalText(query.storageType, 'storageType') } : {}),
      ...(this.optionalText(query.floor, 'floor') ? { floor: this.optionalText(query.floor, 'floor') } : {}),
      ...(this.optionalText(query.zone, 'zone') ? { zone: this.optionalText(query.zone, 'zone') } : {}),
    };
  }

  private positiveInteger(value: unknown, fallback: number, maximum: number, label: string) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} phải từ 1–${maximum}.`);
    return parsed;
  }

  private optionalText(value: unknown, label: string) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim().length > 100) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }
}
