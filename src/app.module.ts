import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { CatalogModule } from './catalog/catalog.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReallocationsModule } from './reallocations/reallocations.module';
import { ReportsModule } from './reports/reports.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SanctionsModule } from './sanctions/sanctions.module';
import { TransfersModule } from './transfers/transfers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Carga el archivo .env en process.env
    ConfigModule.forRoot({ isGlobal: true }),
    // Base de datos y servicios transversales (globales)
    PrismaModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    // Inicio de sesión (Google o demo) y guard global de sesión y roles
    AuthModule,
    // Módulos de negocio
    UsersModule,
    CatalogModule,
    AvailabilityModule,
    SanctionsModule,
    ReservationsModule,
    ApprovalsModule,
    ReallocationsModule,
    TransfersModule,
    DashboardModule,
    ReportsModule,
  ],
})
export class AppModule {}
