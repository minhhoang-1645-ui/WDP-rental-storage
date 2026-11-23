import type { AuthenticatedRequest } from '../auth/auth.types.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateAdditionalServiceDto,
  ConfigureServiceOfferingDto,
  UpdateAdditionalServiceDto,
  UpdateAdditionalServiceInventoryDto,
} from '../../openapi/api-dtos.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AdditionalServicesService } from './additional-services.service.js';
import { AdditionalServiceInventoryService } from './additional-service-inventory.service.js';

@Controller('additional-services')
@ApiTags('Additional Services')
export class PublicAdditionalServicesController {
  constructor(
    private readonly service: AdditionalServicesService,
    private readonly inventory: AdditionalServiceInventoryService,
  ) {}
  @Get()
  @ApiQuery({name:'facilityId',required:false})
  @ApiOperation({
    summary: 'Danh mục add-on đang hoạt động',
    description: 'Public. Chỉ trả catalog active; giá là VND nguyên.',
  })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: 'id',
          code: 'PADLOCK_DISC',
          name: 'Disc Padlock',
          kind: 'PURCHASE',
          billingUnit: 'ONE_TIME',
          unitPrice: 220000,
        },
      ],
    },
  })
  list(@Query('facilityId') facilityId?: string) {
    return this.service.publicCatalog(facilityId);
  }
  @Get(':serviceId/availability')
  @ApiQuery({name:'facilityId',required:false,description:'Bắt buộc khi dịch vụ được cung cấp tại nhiều cơ sở.'})
  @ApiOperation({
    summary: 'Kiểm tra tồn kho/công suất add-on',
    description: 'Guest access, chỉ kiểm tra; không giữ hàng hay thiết bị.',
  })
  @ApiQuery({ name: 'quantity', required: true, example: 1 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-11-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-11-03' })
  availability(
    @Param('serviceId') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.inventory.publicAvailability(id, query);
  }
}

@Controller('manager/additional-services')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Manager Additional Services')
export class ManagerAdditionalServicesController {
  constructor(
    private readonly service: AdditionalServicesService,
    private readonly inventory: AdditionalServiceInventoryService,
  ) {}
  @Get() @ApiOperation({ summary: 'Danh mục add-on gồm active/inactive' }) list(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.managerList(req.user!);
  }
  @Get('catalog') catalog(@Req() req: AuthenticatedRequest) {
    return this.service.catalog(req.user!);
  }
  @Post(':id/offerings')
  @ApiBody({type:ConfigureServiceOfferingDto}) configure(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.configure(id, body, req.user!);
  }
  @Get('inventory')
  @ApiOperation({ summary: 'Tồn kho và công suất add-on' })
  inventoryList(@Req() req: AuthenticatedRequest) {
    return this.inventory.managerList(req.user!);
  }
  @Get(':id/inventory')
  @ApiOperation({ summary: 'Tồn kho/công suất một add-on' })
  managerInventory(
    @Param('id') id: string,
    @Query('facilityId') facilityId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.managerGet(id, req.user!, facilityId);
  }
  @Patch(':id/inventory')
  @ApiOperation({ summary: 'Restock PURCHASE hoặc đổi rentalCapacity RENTAL' })
  @ApiBody({ type: UpdateAdditionalServiceInventoryDto })
  @ApiConflictResponse({
    description:
      'INVENTORY_REDUCTION_CONFLICTS_WITH_RESERVED_STOCK hoặc INVENTORY_REDUCTION_CONFLICTS_WITH_EXISTING_BOOKINGS.',
  })
  updateInventory(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.update(id, body, req.user!);
  }
  @Get(':id')
  @ApiNotFoundResponse({ description: 'Không tìm thấy add-on.' })
  get(
    @Param('id') id: string,
    @Query('facilityId') facilityId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.managerGet(id, req.user!, facilityId);
  }
  @Post()
  @ApiBody({ type: CreateAdditionalServiceDto })
  @ApiCreatedResponse({ description: 'Đã tạo add-on.' })
  @ApiForbiddenResponse({ description: 'Chỉ FACILITY_MANAGER.' })
  create(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(body, req.user!);
  }
  @Patch(':id')
  @ApiBody({ type: UpdateAdditionalServiceDto })
  @ApiOkResponse({
    description: 'Đã cập nhật; lịch sử ReservationService không đổi.',
  })
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, body, req.user!);
  }
}

@Controller('operations/additional-services')
@UseGuards(AuthGuard, RolesGuard)
@Roles('BUSINESS_OPERATIONS_MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Business Service Catalog')
export class BusinessServiceCatalogController {
  constructor(private readonly service: AdditionalServicesService) {}
  @Get() list(@Req() req: AuthenticatedRequest) {
    return this.service.catalog(req.user!);
  }
  @Post() create(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCatalog(undefined, body, req.user!);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCatalog(id, body, req.user!);
  }
}
