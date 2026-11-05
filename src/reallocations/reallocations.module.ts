import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ReallocationsController } from './reallocations.controller';
import { ReallocationsService } from './reallocations.service';

@Module({
  imports: [CatalogModule, ReservationsModule],
  controllers: [ReallocationsController],
  providers: [ReallocationsService],
})
export class ReallocationsModule {}
