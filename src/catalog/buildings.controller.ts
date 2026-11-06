import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { BuildingsService } from './buildings.service';
import { assertMayListInactive } from './catalog-visibility';
import {
  BuildingDetailResponseDto,
  BuildingResponseDto,
  FutureReservationResponseDto,
} from './dto/catalog-response.dto';
import { CreateBuildingDto, ListBuildingsQueryDto, UpdateBuildingDto } from './dto/building.dto';

@ApiTags('Catálogo: edificios')
@ApiErrorResponses(400, 401, 403, 404, 409)
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Get()
  @ApiOkResponse({ type: [BuildingResponseDto] })
  @ApiOperation({ summary: 'Listar edificios' })
  list(@CurrentUser() user: CurrentUserData, @Query() query: ListBuildingsQueryDto) {
    assertMayListInactive(user, query.includeInactive);
    return this.buildings.list(query.includeInactive);
  }

  @Get(':id')
  @ApiOkResponse({ type: BuildingDetailResponseDto })
  @ApiOperation({ summary: 'Ver un edificio con sus salas y laboratorios' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildings.get(id);
  }

  @Roles('ADMIN')
  @Get(':id/future-reservations')
  @ApiOkResponse({ type: [FutureReservationResponseDto] })
  @ApiOperation({ summary: 'Reservas futuras afectadas si se inactiva el edificio' })
  futureReservations(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildings.futureReservations(id);
  }

  @Roles('ADMIN')
  @Post()
  @ApiCreatedResponse({ type: BuildingResponseDto })
  @ApiOperation({ summary: 'Crear edificio (HU-01)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateBuildingDto) {
    return this.buildings.create(user, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiOperation({ summary: 'Editar o inactivar edificio (HU-01)' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildings.update(user, id, dto);
  }
}
