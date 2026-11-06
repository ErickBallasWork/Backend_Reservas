import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OperatingHoursModule } from '../operating-hours/operating-hours.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ReallocationsController } from './reallocations.controller';
import { ReallocationsService } from './reallocations.service';
import { SpocAgendaService } from './spoc-agenda.service';

@Module({
  imports: [CatalogModule, OperatingHoursModule, ReservationsModule],
  controllers: [ReallocationsController],
  providers: [ReallocationsService, SpocAgendaService],
})
export class ReallocationsModule {}
