import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerContractsController } from './customer-contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { ManagerContractsController } from './manager-contracts.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerContractsController, ManagerContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
