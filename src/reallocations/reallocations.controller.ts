import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ReallocateReservationDto } from './dto/reallocation.dto';
import { ReallocationsService } from './reallocations.service';

@ApiTags('Reasignaciones (SPOC de Edificio)')
@Controller('reservations')
export class ReallocationsController {
  constructor(private readonly reallocations: ReallocationsService) {}

  @Roles('SPOC_EDIFICIO')
  @Post(':id/reallocate')
  @ApiOperation({ summary: 'Mover una reserva de sala por evento con cliente (HU-17, HU-18)' })
  reallocate(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReallocateReservationDto,
  ) {
    return this.reallocations.reallocate(user, id, dto);
  }
}
