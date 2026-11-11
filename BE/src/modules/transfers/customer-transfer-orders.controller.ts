import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { TransfersService } from './transfers.service.js';
@Controller('customer/transfer-orders')
@UseGuards(AuthGuard, RolesGuard) @Roles('CUSTOMER')
export class CustomerTransferOrdersController {
  constructor(private readonly transfers: TransfersService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.transfers.listCustomer(request.user!); }
  @Post(':id/signature-otp') otp(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.requestCommercialOtp(request.user!, id, body); }
  @Post(':id/accept') accept(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.transfers.acceptCommercial(request.user!, id, body); }
}
