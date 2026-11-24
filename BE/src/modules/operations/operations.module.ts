import type { Response } from 'express';
import { ReportingService } from '../manager/reporting.service.js';
import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { OperationsService } from './operations.service.js';
@Controller('operations')
@UseGuards(AuthGuard, RolesGuard)
@Roles('BUSINESS_OPERATIONS_MANAGER')
class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly reports: ReportingService,
  ) {}
  @Get('facilities') list(@Req() req: AuthenticatedRequest) {
    return this.operations.list(req.user!);
  }
  @Post('facilities') create(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.operations.save(undefined, body, req.user!);
  }
  @Patch('facilities/:id') save(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.operations.save(id, body, req.user!);
  }
  @Get('pricing-rules') ranges(@Req() req: AuthenticatedRequest) {
    return this.operations.ranges(req.user!);
  }
  @Post('pricing-rules') range(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.operations.saveRange(body, req.user!);
  }
  @Get('reports/invoices.csv') async csv(
    @Query() query: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nestbox-hoa-don.csv"',
      'Cache-Control': 'private, no-store',
    });
    res.send(await this.reports.csv(query, req.user!));
  }
  @Get('reports/financial') financial(
    @Query() query: Record<string, unknown>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reports.summary(query, req.user!);
  }
  @Get('reports') report(@Req() req: AuthenticatedRequest) {
    return this.operations.report(req.user!);
  }
  @Get('reports/performance') performance(@Query() query:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.operations.performance(query,req.user!);}
  @Get('audit') audit(@Query() query:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.operations.businessAudit(query,req.user!);}
}
@Module({
  imports: [AuthModule],
  controllers: [OperationsController],
  providers: [OperationsService, ReportingService],
})
export class OperationsModule {}
