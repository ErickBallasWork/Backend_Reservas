import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto, ListBuildingsQueryDto, UpdateBuildingDto } from './dto/building.dto';

@ApiTags('Catálogo: edificios')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar edificios' })
  list(@Query() query: ListBuildingsQueryDto) {
    return this.buildings.list(query.includeInactive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un edificio con sus salas y laboratorios' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildings.get(id);
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crear edificio (HU-01)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateBuildingDto) {
    return this.buildings.create(user, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Editar o inactivar edificio (HU-01)' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildings.update(user, id, dto);
  }
}
