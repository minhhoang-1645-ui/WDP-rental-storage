import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UnitStaffController } from './unit-staff.controller.js';
import { UnitStaffService } from './unit-staff.service.js';

@Global()
@Module({ imports: [AuthModule], controllers: [UnitStaffController], providers: [UnitStaffService], exports: [UnitStaffService] })
export class UnitStaffModule {}
