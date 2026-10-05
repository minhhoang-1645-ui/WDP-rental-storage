import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@Controller('health')
@ApiExcludeController()
export class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'wdp-storage-api', timestamp: new Date().toISOString() }; }
}
