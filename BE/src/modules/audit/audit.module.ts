import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AuditService } from './audit.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AdminAuditController } from './admin-audit.controller.js';

@Module({ imports: [AuthModule], controllers: [AdminAuditController], providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }] })
export class AuditModule {}
