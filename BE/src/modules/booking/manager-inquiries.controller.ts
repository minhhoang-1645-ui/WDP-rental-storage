import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { BookingService } from './booking.service.js';

@Controller('manager/inquiries')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
export class ManagerInquiriesController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  list(@Query('page') pageInput = '1', @Query('limit') limitInput = '20') {
    const page = Number(pageInput);
    const limit = Number(limitInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('page phải từ 1–100000, limit phải từ 1–100.');
    }
    return this.bookingService.listManagerInquiries(page, limit);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.bookingService.getManagerInquiry(id);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.bookingService.updateManagerInquiry(id, body, request.user!);
  }
}
