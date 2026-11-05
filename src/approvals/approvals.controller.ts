import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './dto/approval.dto';

@ApiTags('Aprobaciones (Entrenamiento)')
@Roles('LIDER')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Entrenamientos pendientes de aprobación (HU-15)' })
  listPending() {
    return this.approvals.listPending();
  }

  @Post(':reservationId')
  @ApiOperation({ summary: 'Aprobar o rechazar un entrenamiento (HU-15)' })
  decide(
    @CurrentUser() user: CurrentUserData,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvals.decide(user, reservationId, dto);
  }
}
