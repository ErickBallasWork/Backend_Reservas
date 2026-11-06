import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { ReservationPageResponseDto } from '../reservations/dto/reservation-response.dto';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto, MetricsQueryDto } from './dto/dashboard.dto';
import { DashboardMetricsResponseDto } from './dto/dashboard-response.dto';

@ApiTags('Panel (SPOC Administrativo y Líder)')
@ApiErrorResponses(400, 401, 403)
@Roles('SPOC_ADMIN', 'LIDER', 'ADMIN')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('reservations')
  @ApiOkResponse({ type: ReservationPageResponseDto })
  @ApiOperation({
    summary: 'Historial filtrable de solicitudes de los asociados a cargo (RF-09)',
    description:
      'SPOC_ADMIN y LIDER ven solo a sus asociados a cargo. ADMIN y SUPERADMIN ven todo. Cada consulta no automática queda en la auditoría.',
  })
  reservations(@CurrentUser() user: CurrentUserData, @Query() query: DashboardQueryDto) {
    return this.dashboard.reservations(user, query);
  }

  @Get('metrics')
  @ApiOkResponse({ type: DashboardMetricsResponseDto })
  @ApiOperation({
    summary: 'Totales por estado, motivo y tipo; tasa de No-Show (RF-09)',
    description: 'Con el mismo alcance por rol que el historial.',
  })
  metrics(@CurrentUser() user: CurrentUserData, @Query() query: MetricsQueryDto) {
    return this.dashboard.metrics(user, query);
  }
}
