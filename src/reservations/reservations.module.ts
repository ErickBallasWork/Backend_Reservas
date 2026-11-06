import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OperatingHoursModule } from '../operating-hours/operating-hours.module';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { ApprovalRoutingService } from './approval-routing.service';
import { LeaderNotifier } from './leader-notifier';
import { ReservationEditService } from './reservation-edit.service';
import { ReservationSeriesController } from './series/reservation-series.controller';
import { ReservationSeriesService } from './series/reservation-series.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [CatalogModule, OperatingHoursModule, SanctionsModule],
  controllers: [ReservationsController, ReservationSeriesController],
  providers: [
    ReservationsService,
    ReservationEditService,
    ReservationSeriesService,
    LeaderNotifier,
    ApprovalRoutingService,
  ],
  exports: [ReservationsService, ApprovalRoutingService],
})
export class ReservationsModule {}
