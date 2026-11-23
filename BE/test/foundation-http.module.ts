import { OperationsModule } from '../dist/modules/operations/operations.module.js';
import { FacilityAccessModule } from '../dist/modules/facility-access/facility-access.module.js';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../dist/modules/notifications/notifications.module.js';
import { DamageClaimsModule } from '../dist/modules/claims/damage-claims.module.js';
import { BusinessPolicyModule } from '../dist/modules/policies/business-policy.module.js';
import { AuditModule } from '../dist/modules/audit/audit.module.js';
import { DocumentsModule } from '../dist/modules/documents/documents.module.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../dist/modules/auth/auth.module.js';
import { AppointmentsModule } from '../dist/modules/appointments/appointments.module.js';
import { ActiveRentalsModule } from '../dist/modules/rentals-active/active-rentals.module.js';
import { BookingModule } from '../dist/modules/booking/booking.module.js';
import { BillingModule } from '../dist/modules/billing/billing.module.js';
import { ContractsModule } from '../dist/modules/contracts/contracts.module.js';
import { DepositSettlementsModule } from '../dist/modules/deposit-settlements/deposit-settlements.module.js';
import { FacilitiesModule } from '../dist/modules/facilities/facilities.module.js';
import { HealthModule } from '../dist/modules/health/health.module.js';
import { ManagerModule } from '../dist/modules/manager/manager.module.js';
import { MaintenanceModule } from '../dist/modules/maintenance/maintenance.module.js';
import { PricingModule } from '../dist/modules/pricing/pricing.module.js';
import { RenewalsModule } from '../dist/modules/renewals/renewals.module.js';
import { ReturnsModule } from '../dist/modules/returns/returns.module.js';
import { StorageModule } from '../dist/modules/storage/storage.module.js';
import { SupportModule } from '../dist/modules/support/support.module.js';
import { TransfersModule } from '../dist/modules/transfers/transfers.module.js';
import { UsersModule } from '../dist/modules/users/users.module.js';
import { PrismaModule } from '../dist/prisma/prisma.module.js';
import { GuestBookingModule } from '../dist/modules/guest-booking/guest-booking.module.js';
import { AdditionalServicesModule } from '../dist/modules/additional-services/additional-services.module.js';
import { StockMovementsModule } from '../dist/modules/stock-movements/stock-movements.module.js';

@Module({
  imports: [
    FacilityAccessModule,
    OperationsModule,
    DamageClaimsModule,
    BusinessPolicyModule,
    DocumentsModule,
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    ManagerModule,
    MaintenanceModule,
    PricingModule,
    AuthModule,
    AppointmentsModule,
    ActiveRentalsModule,
    BookingModule,
    GuestBookingModule,
    AdditionalServicesModule,
    StockMovementsModule,
    BillingModule,
    ContractsModule,
    DepositSettlementsModule,
    UsersModule,
    FacilitiesModule,
    StorageModule,
    SupportModule,
    TransfersModule,
    RenewalsModule,
    ReturnsModule,
  ],
})
export class FoundationHttpModule {}
