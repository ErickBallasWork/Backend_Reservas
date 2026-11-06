import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [CatalogModule, ReservationsModule, SanctionsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
