import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerStockMovementsController } from './customer-stock-movements.controller.js';
import { ManagerStockMovementsController } from './manager-stock-movements.controller.js';
import { StaffStockMovementsController } from './staff-stock-movements.controller.js';
import { StockMovementsService } from './stock-movements.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerStockMovementsController, ManagerStockMovementsController, StaffStockMovementsController],
  providers: [StockMovementsService],
})
export class StockMovementsModule {}
