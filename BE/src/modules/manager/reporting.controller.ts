import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ReportingService } from './reporting.service.js';
@Controller('manager/reports')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER')
export class ReportingController {
  constructor(private readonly reports: ReportingService) {}
  @Get() summary(@Query() query: Record<string, unknown>) { return this.reports.summary(query); }
  @Get('invoices.csv') async csv(@Query() query: Record<string, unknown>, @Res() response: Response) { response.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nestbox-hoa-don.csv"', 'Cache-Control': 'private, no-store' }); response.send(await this.reports.csv(query)); }
}
