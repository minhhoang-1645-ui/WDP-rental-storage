import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { InventoryManagementService } from './inventory-management.service.js';
import { catalogPhotoLimits } from './catalog-photo.js';

function catalogPayload(body: Record<string, unknown>, multipart: boolean) {
  if (!multipart) return body;
  try {
    if (Object.keys(body).length !== 1 || typeof body.payload !== 'string') throw new Error();
    return JSON.parse(body.payload) as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Dữ liệu loại kho không hợp lệ.');
  }
}

// Separate from the read-only StaffLookup controller: Staff never gains these writes.
@Controller('manager')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth')
@ApiTags('Manager Inventory Configuration')
export class InventoryManagementController {
  constructor(private readonly inventory: InventoryManagementService) {}
  @Get('storage-types') @ApiOperation({ summary: 'Loại kho và cơ sở để quản lý bảng giá' })
  list(@Req() req: AuthenticatedRequest) { return this.inventory.listTypes(req.user!); }
  @Get('storage-types/:id/next-unit-code') @ApiOperation({ summary: 'Xem mã dự kiến, không giữ chỗ số thứ tự' })
  nextUnitCode(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.inventory.previewUnitCode(id, req.user!); }
  @Get('unit-locations') @ApiOperation({ summary: 'Danh sách tầng và khu từ toàn bộ kho vật lý' })
  unitLocations(@Req() req: AuthenticatedRequest) { return this.inventory.listUnitLocations(req.user!); }
  @Post('storage-types') @ApiOperation({ summary: 'Tạo loại kho, kích thước và giá tháng' })
  @UseInterceptors(FileInterceptor('photo', { limits: catalogPhotoLimits }))
  createType(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest & Request, @UploadedFile() photo?: { buffer: Buffer }) {
    return this.inventory.saveType(undefined, catalogPayload(body, String(req.headers['content-type']).startsWith('multipart/form-data')), req.user!, photo?.buffer);
  }
  @Patch('storage-types/:id') @ApiOperation({ summary: 'Sửa danh mục, không thay snapshot lịch sử; yêu cầu expectedUpdatedAt' })
  @UseInterceptors(FileInterceptor('photo', { limits: catalogPhotoLimits }))
  updateType(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest & Request, @UploadedFile() photo?: { buffer: Buffer }) {
    return this.inventory.saveType(id, catalogPayload(body, String(req.headers['content-type']).startsWith('multipart/form-data')), req.user!, photo?.buffer);
  }
  @Post('units') @ApiOperation({ summary: 'Tạo kho vật lý AVAILABLE' })
  createUnit(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveUnit(undefined, body, req.user!); }
  @Patch('units/:id') @ApiOperation({ summary: 'Sửa kho chưa có lịch sử; yêu cầu expectedUpdatedAt, không sửa trạng thái' })
  updateUnit(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) { return this.inventory.saveUnit(id, body, req.user!); }
}
