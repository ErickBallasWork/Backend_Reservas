import { Module } from '@nestjs/common';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { CatalogModule } from './catalog/catalog.module';
import { AppConfigModule } from './config/app-config.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReallocationsModule } from './reallocations/reallocations.module';
import { ReportsModule } from './reports/reports.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SanctionsModule } from './sanctions/sanctions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    AvailabilityModule,
    SanctionsModule,
    ReservationsModule,
    ApprovalsModule,
    ReallocationsModule,
    DashboardModule,
    ReportsModule,
  ],
})
export class AppModule {}
