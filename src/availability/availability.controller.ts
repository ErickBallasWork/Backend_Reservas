import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { AvailabilityService } from './availability.service';
import {
  AvailabilitySearchItemDto,
  ResourceAvailabilityResponseDto,
} from './dto/availability-response.dto';
import { RangeQueryDto, SearchAvailabilityQueryDto } from './dto/availability.dto';

@ApiTags('Disponibilidad')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('search')
  @ApiOkResponse({ type: [AvailabilitySearchItemDto] })
  @ApiOperation({ summary: 'Salas y laboratorios libres en un rango (HU-06)' })
  search(@Query() query: SearchAvailabilityQueryDto) {
    return this.availability.search(query);
  }

  @Get('resources/:id')
  @ApiOkResponse({ type: ResourceAvailabilityResponseDto })
  @ApiOperation({
    summary: 'Franjas ocupadas de una sala o laboratorio y sus laptops (HU-06)',
    description:
      'reservations dice qué reserva ocupa cada tramo, si es mía y si se puede pedir en cesión ' +
      '(POST /reservations/{reservationId}/transfer-requests).',
  })
  resource(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RangeQueryDto,
  ) {
    return this.availability.resource(id, query, user.id);
  }
}
