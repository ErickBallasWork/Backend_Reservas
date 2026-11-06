import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OperatingHoursModule } from '../operating-hours/operating-hours.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { BusySlotsReader } from './busy-slots.reader';

@Module({
  imports: [CatalogModule, OperatingHoursModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, BusySlotsReader],
  exports: [BusySlotsReader],
})
export class AvailabilityModule {}
