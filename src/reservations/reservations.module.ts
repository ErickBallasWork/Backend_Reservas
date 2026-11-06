import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OperatingHoursModule } from '../operating-hours/operating-hours.module';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { LeaderNotifier } from './leader-notifier';
import { ReservationEditService } from './reservation-edit.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [CatalogModule, OperatingHoursModule, SanctionsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationEditService, LeaderNotifier],
  exports: [ReservationsService],
})
export class ReservationsModule {}
