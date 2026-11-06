import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { ReservationDetailResponseDto } from '../reservations/dto/reservation-response.dto';
import { ReallocateReservationDto } from './dto/reallocation.dto';
import { SpocAgendaQueryDto, SpocAgendaResponseDto } from './dto/spoc-agenda.dto';
import { ReallocationsService } from './reallocations.service';
import { SpocAgendaService } from './spoc-agenda.service';

@ApiTags('Reasignaciones (SPOC de Edificio)')
@ApiErrorResponses(400, 401, 403, 404, 409, 422)
@Roles('SPOC_EDIFICIO')
@Controller()
export class ReallocationsController {
  constructor(
    private readonly reallocations: ReallocationsService,
    private readonly agenda: SpocAgendaService,
  ) {}

  @Get('spoc/agenda')
  @ApiOkResponse({ type: SpocAgendaResponseDto })
  @ApiOperation({
    summary: 'Agenda de las salas de un edificio del SPOC (RF-10)',
    description:
      'Reservas de salas confirmadas, pendientes o con uso registrado en el rango (máximo 8 días), ' +
      'más los edificios que administra con sus salas activas para elegir un destino.',
  })
  getAgenda(@CurrentUser() user: CurrentUserData, @Query() query: SpocAgendaQueryDto) {
    return this.agenda.get(user, query);
  }

  @Post('reservations/:id/reallocate')
  @ApiCreatedResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({
    summary: 'Mover una reserva de sala por evento con cliente (RF-10, RF-11)',
    description:
      'Cambia la sala, el horario o ambos dentro de los edificios del SPOC. Aplica las reglas de ' +
      'traslape, horario operativo y capacidad, pero no la anticipación mínima. Avisa al asociado ' +
      'con el antes, el después y la justificación.',
  })
  reallocate(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReallocateReservationDto,
  ) {
    return this.reallocations.reallocate(user, id, dto);
  }
}
