import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { RangeQueryDto, SearchAvailabilityQueryDto } from './dto/availability.dto';

@ApiTags('Disponibilidad')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('search')
  @ApiOperation({ summary: 'Salas y laboratorios libres en un rango (HU-06)' })
  search(@Query() query: SearchAvailabilityQueryDto) {
    return this.availability.search(query);
  }

  @Get('resources/:id')
  @ApiOperation({ summary: 'Franjas ocupadas de una sala o laboratorio y sus laptops (HU-06)' })
  resource(@Param('id', ParseUUIDPipe) id: string, @Query() query: RangeQueryDto) {
    return this.availability.resource(id, query);
  }
}
