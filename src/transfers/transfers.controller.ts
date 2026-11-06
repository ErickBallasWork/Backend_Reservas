import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import {
  TransferRequestPageResponseDto,
  TransferRequestResponseDto,
} from './dto/transfer-response.dto';
import {
  CreateTransferRequestDto,
  RespondTransferDto,
  TransferListQueryDto,
} from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('Cesión de reservas')
@Controller()
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('reservations/:id/transfer-requests')
  @ApiCreatedResponse({ type: TransferRequestResponseDto })
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
  @ApiOkResponse({ type: TransferRequestPageResponseDto })
  @ApiOperation({ summary: 'Solicitudes de cesión que me llegaron por mis reservas' })
  received(@CurrentUser() user: CurrentUserData, @Query() query: TransferListQueryDto) {
    return this.transfers.received(user, query);
  }

  @Get('transfer-requests/sent')
  @ApiOkResponse({ type: TransferRequestPageResponseDto })
  @ApiOperation({ summary: 'Solicitudes de cesión que yo envié' })
  sent(@CurrentUser() user: CurrentUserData, @Query() query: TransferListQueryDto) {
    return this.transfers.sent(user, query);
  }

  @Post('transfer-requests/:id/accept')
  @ApiCreatedResponse({ type: TransferRequestResponseDto })
  @ApiOperation({ summary: 'Ceder mi reserva a quien la pidió (comentario opcional)' })
  accept(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTransferDto,
  ) {
    return this.transfers.accept(user, id, dto);
  }

  @Post('transfer-requests/:id/reject')
  @ApiCreatedResponse({ type: TransferRequestResponseDto })
  @ApiOperation({ summary: 'No ceder mi reserva (el comentario es obligatorio)' })
  reject(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTransferDto,
  ) {
    return this.transfers.reject(user, id, dto);
  }

  @Patch('transfer-requests/:id/cancel')
  @ApiOkResponse({ type: TransferRequestResponseDto })
  @ApiOperation({ summary: 'Retirar una solicitud que envié' })
  cancel(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.cancel(user, id);
  }
}
