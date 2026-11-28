import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';
import { releaseContract } from '../../foundation-schema.js';

@Controller('health')
@ApiTags('System')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get()
  @ApiOkResponse({ description: 'Health status for the WDP Storage API.' })
  status() { return { status: 'ok', service: 'wdp-storage-api', roleModel: 5, release: releaseContract.release, commit: /^[a-f0-9]{7,40}$/i.test(process.env.RENDER_GIT_COMMIT ?? '') ? process.env.RENDER_GIT_COMMIT : null, timestamp: new Date().toISOString() }; }
  @Get('ready')
  @ApiOkResponse({ description: 'Single-instance runtime and bounded database reachability check. Does not verify external email/payment delivery.' })
  ready() { return this.health.readiness(); }
}
