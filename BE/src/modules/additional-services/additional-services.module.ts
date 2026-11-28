import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  BusinessServiceCatalogController,
  ManagerAdditionalServicesController,
  PublicAdditionalServicesController,
} from './additional-services.controller.js';
import { AdditionalServicesService } from './additional-services.service.js';
import { AdditionalServiceInventoryService } from './additional-service-inventory.service.js';
@Module({
  imports: [AuthModule],
  controllers: [
    PublicAdditionalServicesController,
    ManagerAdditionalServicesController,
    BusinessServiceCatalogController,
  ],
  providers: [AdditionalServicesService, AdditionalServiceInventoryService],
  exports: [AdditionalServicesService, AdditionalServiceInventoryService],
})
export class AdditionalServicesModule {}
