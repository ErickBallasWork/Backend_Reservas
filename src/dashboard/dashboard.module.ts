import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ReservationsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
