import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { OperatingHoursModule } from '../operating-hours/operating-hours.module';
import { FloorPlanStatusService } from './floor-plan-status.service';
import { FloorPlansController } from './floor-plans.controller';
import { FloorPlansService } from './floor-plans.service';

@Module({
  imports: [AvailabilityModule, OperatingHoursModule],
  controllers: [FloorPlansController],
  providers: [FloorPlansService, FloorPlanStatusService],
})
export class FloorPlansModule {}
