import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { CreateTransferRequestDto, RespondTransferDto, TransferListQueryDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

// Sin @Roles: cualquier usuario con sesión puede pedir y responder. Que sea el dueño o quien
// pidió lo revisa el service.
@ApiTags('Cesión de reservas')
@Controller()
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('reservations/:id/transfer-requests')
  @ApiOperation({
    summary: 'Pedir una reserva ocupada a su dueño',
    description:
      'La justificación le llega al dueño en un aviso. Solo reservas CONFIRMED que no hayan empezado. ' +
      'Si el dueño acepta, se crea tu reserva con el mismo recurso y horario.',
  })
  request(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body() dto: CreateTransferRequestDto,
  ) {
    return this.transfers.request(user, reservationId, dto);
  }

  @Get('transfer-requests/received')
  @ApiOperation({ summary: 'Solicitudes de cesión que me llegaron por mis reservas' })
  received(@CurrentUser() user: CurrentUserData, @Query() query: TransferListQueryDto) {
    return this.transfers.received(user, query);
  }

  @Get('transfer-requests/sent')
  @ApiOperation({ summary: 'Solicitudes de cesión que yo envié' })
  sent(@CurrentUser() user: CurrentUserData, @Query() query: TransferListQueryDto) {
    return this.transfers.sent(user, query);
  }

  @Post('transfer-requests/:id/accept')
  @ApiOperation({ summary: 'Ceder mi reserva a quien la pidió (comentario opcional)' })
  accept(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTransferDto,
  ) {
    return this.transfers.accept(user, id, dto);
  }

  @Post('transfer-requests/:id/reject')
  @ApiOperation({ summary: 'No ceder mi reserva (el comentario es obligatorio)' })
  reject(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTransferDto,
  ) {
    return this.transfers.reject(user, id, dto);
  }

  @Patch('transfer-requests/:id/cancel')
  @ApiOperation({ summary: 'Retirar una solicitud que envié' })
  cancel(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.cancel(user, id);
  }
}