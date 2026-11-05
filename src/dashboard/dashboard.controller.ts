import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto, MetricsQueryDto } from './dto/dashboard.dto';

@ApiTags('Panel (SPOC Administrativo y Líder)')
@Roles('SPOC_ADMIN', 'LIDER')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('reservations')
  @ApiOperation({ summary: 'Historial filtrable de solicitudes (HU-16)' })
  reservations(@Query() query: DashboardQueryDto) {
    return this.dashboard.reservations(query);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Totales por estado, motivo y tipo; tasa de No-Show (HU-16)' })
  metrics(@Query() query: MetricsQueryDto) {
    return this.dashboard.metrics(query);
  }
}
