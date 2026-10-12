import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('System')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Health status for the WDP Storage API.' })
  status() { return { status: 'ok', service: 'wdp-storage-api', timestamp: new Date().toISOString() }; }
}
