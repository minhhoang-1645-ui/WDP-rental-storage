import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerSupportController } from './customer-support.controller.js';
import { ManagerSupportController } from './manager-support.controller.js';
import { StaffSupportController } from './staff-support.controller.js';
import { SupportService } from './support.service.js';

@Module({ imports: [AuthModule], controllers: [CustomerSupportController, StaffSupportController, ManagerSupportController], providers: [SupportService], exports: [SupportService] })
export class SupportModule {}
