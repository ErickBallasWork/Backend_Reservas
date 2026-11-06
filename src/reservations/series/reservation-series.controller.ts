import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user/current-user.decorator';
import { CurrentUserData } from '../../common/current-user/current-user.types';
import {
  CreateReservationSeriesDto,
  SeriesCancelResponseDto,
  SeriesCreatedResponseDto,
  SeriesDetailResponseDto,
  SeriesPreviewResponseDto,
} from './dto/reservation-series.dto';
import { ReservationSeriesService } from './reservation-series.service';

@ApiTags('Reservas')
@Controller('reservation-series')
export class ReservationSeriesController {
  constructor(private readonly series: ReservationSeriesService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOkResponse({ type: SeriesPreviewResponseDto })
  @ApiOperation({
    summary: 'Ver qué fechas de una serie semanal están disponibles, sin reservar (RF-15)',
  })
  preview(@CurrentUser() user: CurrentUserData, @Body() dto: CreateReservationSeriesDto) {
    return this.series.preview(user, dto);
  }

  @Post()
  @ApiCreatedResponse({ type: SeriesCreatedResponseDto })
  @ApiOperation({
    summary: 'Crear una serie de reservas semanales (RF-15)',
    description:
      'Cada fecha se valida por separado: se crean las disponibles y las demás se informan en skipped. ' +
      'Si ninguna está disponible responde 409 SERIES_EMPTY. Una serie de Entrenamiento deja una aprobación por reserva.',
  })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateReservationSeriesDto) {
    return this.series.create(user, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: SeriesDetailResponseDto })
  @ApiOperation({ summary: 'Ver una serie con todas sus reservas' })
  get(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.series.get(user, id);
  }

  @Patch(':id/cancel')
  @ApiOkResponse({ type: SeriesCancelResponseDto })
  @ApiOperation({
    summary: 'Cancelar las reservas que quedan de una serie (RF-15)',
    description:
      'Cancela las futuras con al menos 24 h de anticipación. Las que empiezan antes se conservan y se cuentan en kept. ' +
      'Para cancelar una sola fecha se usa la cancelación de la reserva.',
  })
  cancel(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.series.cancel(user, id);
  }
}
