import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

// Cesión de reservas entre asociados. Usa createInTx de reservas para crear la reserva nueva
// con las mismas reglas (franjas, laptops del laboratorio, entrenamientos pendientes del Líder).
@Module({
  imports: [CatalogModule, ReservationsModule, SanctionsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}