import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [CatalogModule, SanctionsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
