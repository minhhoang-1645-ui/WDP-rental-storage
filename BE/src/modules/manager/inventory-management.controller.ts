import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { InventoryManagementService } from './inventory-management.service.js';

// Separate from the read-only StaffLookup controller: Staff never gains these writes.
@Controller('manager')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Manager Inventory Configuration')
export class InventoryManagementController {
  constructor(private readonly inventory: InventoryManagementService) {}
  @Get('storage-types') @ApiOperation({ summary: 'Loại kho và cơ sở để quản lý bảng giá' })
  list() { return this.inventory.listTypes(); }
  @Post('storage-types') @ApiOperation({ summary: 'Tạo loại kho, kích thước và giá tháng' })
  createType(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveType(undefined, body, req.user!); }
  @Patch('storage-types/:id') @ApiOperation({ summary: 'Sửa danh mục, không thay snapshot lịch sử; yêu cầu expectedUpdatedAt' })
  updateType(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveType(id, body, req.user!); }
  @Post('units') @ApiOperation({ summary: 'Tạo kho vật lý AVAILABLE' })
  createUnit(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveUnit(undefined, body, req.user!); }
  @Patch('units/:id') @ApiOperation({ summary: 'Sửa kho chưa có lịch sử; yêu cầu expectedUpdatedAt, không sửa trạng thái' })
  updateUnit(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveUnit(id, body, req.user!); }
}
