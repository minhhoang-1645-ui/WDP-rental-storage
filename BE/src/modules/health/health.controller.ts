import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@Controller('health')
@ApiTags('System')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get()
  @ApiOkResponse({ description: 'Health status for the WDP Storage API.' })
  status() { return { status: 'ok', service: 'wdp-storage-api', timestamp: new Date().toISOString() }; }
  @Get('ready')
  @ApiOkResponse({ description: 'Single-instance runtime and bounded database reachability check. Does not verify external email/payment delivery.' })
  ready() { return this.health.readiness(); }
}
