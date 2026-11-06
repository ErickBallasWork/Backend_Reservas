import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { CheckInDto, CreateReservationDto, MyReservationsQueryDto } from './dto/reservation.dto';
import {
  ReservationDetailResponseDto,
  ReservationPageResponseDto,
} from './dto/reservation-response.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservas')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @ApiCreatedResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({
    summary: 'Reservar una sala, un laboratorio completo o una laptop (HU-07 a HU-14)',
    description:
      'El tipo se deduce del recurso. Valida sanción activa, anticipación, duración máxima, motivo y ' +
      'choque de franjas. Si el motivo es TRAINING queda pendiente de aprobación. Un choque devuelve 409 SLOT_TAKEN.',
  })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user, dto);
  }

  @Get('mine')
  @ApiOkResponse({ type: ReservationPageResponseDto })
  @ApiOperation({ summary: 'Mis reservas' })
  listMine(@CurrentUser() user: CurrentUserData, @Query() query: MyReservationsQueryDto) {
    return this.reservations.listMine(user.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({
    summary: 'Ver una reserva con sus aprobaciones, reasignaciones y check-in',
    description:
      'Solo la ve su dueño, un ADMIN o SUPERADMIN, el SPOC de su edificio o quien la tenga a cargo.',
  })
  get(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.getForViewer(user, id);
  }

  @Patch(':id/cancel')
  @ApiOkResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({ summary: 'Cancelar mi reserva (HU-11)' })
  cancel(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.cancel(user, id);
  }

  @Post(':id/check-in')
  @ApiCreatedResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({ summary: 'Registrar que usé el espacio (HU-20)' })
  checkIn(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    return this.reservations.checkIn(user, id, dto);
  }
}
