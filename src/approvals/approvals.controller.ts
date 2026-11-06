import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import {
  ReservationDetailResponseDto,
  ReservationResponseDto,
} from '../reservations/dto/reservation-response.dto';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto, SeriesDecisionResponseDto } from './dto/approval.dto';

@ApiTags('Aprobaciones (Entrenamiento)')
@Roles('LIDER', 'ADMIN')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @ApiOkResponse({ type: [ReservationResponseDto] })
  @ApiOperation({
    summary: 'Entrenamientos pendientes que me corresponde decidir (RF-08)',
    description:
      'Un Líder ve los de sus asociados a cargo. ADMIN y SUPERADMIN ven los de quienes no tienen Líder asignado. Nadie ve los propios.',
  })
  listPending(@CurrentUser() user: CurrentUserData) {
    return this.approvals.listPending(user);
  }

  @Post('series/:seriesId')
  @HttpCode(200)
  @ApiOkResponse({ type: SeriesDecisionResponseDto })
  @ApiOperation({
    summary: 'Aprobar o rechazar las ocurrencias pendientes de una serie (RF-08, RF-15)',
    description:
      'Decide solo las ocurrencias futuras que siguen pendientes. Rechazar exige comentario.',
  })
  decideSeries(
    @CurrentUser() user: CurrentUserData,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvals.decideSeries(user, seriesId, dto);
  }

  @Post(':reservationId')
  @HttpCode(200)
  @ApiOkResponse({ type: ReservationDetailResponseDto })
  @ApiOperation({
    summary: 'Aprobar o rechazar un entrenamiento (RF-08)',
    description:
      'Rechazar exige comentario y libera la franja. Nadie decide su propia solicitud (CANNOT_APPROVE_OWN).',
  })
  decide(
    @CurrentUser() user: CurrentUserData,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvals.decide(user, reservationId, dto);
  }
}
