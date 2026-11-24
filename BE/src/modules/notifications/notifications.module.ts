import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { BookingModule } from '../booking/booking.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DamageClaimsModule } from '../claims/damage-claims.module.js';
import { DepositSettlementsModule } from '../deposit-settlements/deposit-settlements.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { RenewalsModule } from '../renewals/renewals.module.js';
import { ReturnsModule } from '../returns/returns.module.js';
import { SupportModule } from '../support/support.module.js';
import { TransfersModule } from '../transfers/transfers.module.js';
import { NotificationSources } from './notification-sources.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [
    AuthModule, AppointmentsModule, AuditModule, BillingModule, BookingModule, ContractsModule,
    DamageClaimsModule, DepositSettlementsModule, MaintenanceModule, RenewalsModule,
    ReturnsModule, SupportModule, TransfersModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationSources, NotificationsService],
})
export class NotificationsModule {}
