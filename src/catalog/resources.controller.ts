import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import {
  ResourceDetailResponseDto,
  ResourceListItemResponseDto,
  ResourceResponseDto,
} from './dto/catalog-response.dto';
import { CreateResourceDto, ListResourcesQueryDto, UpdateResourceDto } from './dto/resource.dto';
import { ResourcesService } from './resources.service';

@ApiTags('Catálogo: salas, laboratorios y laptops')
@ApiErrorResponses(400, 401, 403, 404, 422)
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOkResponse({ type: [ResourceListItemResponseDto] })
  @ApiOperation({ summary: 'Listar recursos (filtros: edificio, tipo, laboratorio, capacidad)' })
  list(@Query() query: ListResourcesQueryDto) {
    return this.resources.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ResourceDetailResponseDto })
  @ApiOperation({ summary: 'Ver un recurso; si es laboratorio, con sus laptops' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.resources.get(id);
  }

  @Roles('ADMIN')
  @Get(':id/future-reservations')
  @ApiOperation({ summary: 'Reservas futuras afectadas si se inactiva (HU-05)' })
  futureReservations(@Param('id', ParseUUIDPipe) id: string) {
    return this.resources.futureReservations(id);
  }

  @Roles('ADMIN')
  @Post()
  @ApiCreatedResponse({ type: ResourceResponseDto })
  @ApiOperation({ summary: 'Crear sala, laboratorio de IA o laptop (HU-02, HU-03)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateResourceDto) {
    return this.resources.create(user, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOkResponse({ type: ResourceResponseDto })
  @ApiOperation({ summary: 'Editar, mover laptop de laboratorio o inactivar (HU-02, HU-03)' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.update(user, id, dto);
  }
}
