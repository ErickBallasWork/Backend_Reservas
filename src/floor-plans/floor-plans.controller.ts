import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { assertMayListInactive } from '../catalog/catalog-visibility';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import {
  CreateFloorPlanDto,
  FloorPlanStatusQueryDto,
  ListFloorPlansQueryDto,
  ReplaceFloorZonesDto,
  UpdateFloorPlanDto,
} from './dto/floor-plan.dto';
import {
  FloorPlanDetailDto,
  FloorPlanStatusDto,
  FloorPlanSummaryDto,
} from './dto/floor-plan-response.dto';
import { FloorPlanStatusService } from './floor-plan-status.service';
import { FloorPlansService } from './floor-plans.service';

@ApiTags('Planos de piso')
@ApiErrorResponses(400, 401, 403, 404, 409, 422)
@Controller('floor-plans')
export class FloorPlansController {
  constructor(
    private readonly floorPlans: FloorPlansService,
    private readonly floorPlanStatus: FloorPlanStatusService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [FloorPlanSummaryDto] })
  @ApiOperation({ summary: 'Listar planos de piso (RF-19)' })
  list(@CurrentUser() user: CurrentUserData, @Query() query: ListFloorPlansQueryDto) {
    assertMayListInactive(user, query.includeInactive);
    return this.floorPlans.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: FloorPlanDetailDto })
  @ApiOperation({ summary: 'Ver un plano con sus zonas (RF-19)' })
  get(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.floorPlans.get(user, id);
  }

  @Get(':id/status')
  @ApiOkResponse({ type: FloorPlanStatusDto })
  @ApiOperation({ summary: 'Estado de las zonas y laptops de un plano en un rango (RF-19)' })
  status(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FloorPlanStatusQueryDto,
  ) {
    return this.floorPlanStatus.status(user, id, query);
  }

  @Roles('ADMIN')
  @Post()
  @ApiCreatedResponse({ type: FloorPlanDetailDto })
  @ApiOperation({ summary: 'Crear el plano de un piso de un edificio (RF-19)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateFloorPlanDto) {
    return this.floorPlans.create(user, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOkResponse({ type: FloorPlanDetailDto })
  @ApiOperation({ summary: 'Editar, redimensionar o inactivar un plano (RF-19)' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFloorPlanDto,
  ) {
    return this.floorPlans.update(user, id, dto);
  }

  @Roles('ADMIN')
  @Put(':id/zones')
  @ApiOkResponse({ type: FloorPlanDetailDto })
  @ApiOperation({ summary: 'Reemplazar las zonas dibujadas de un plano (RF-19)' })
  replaceZones(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceFloorZonesDto,
  ) {
    return this.floorPlans.replaceZones(user, id, dto);
  }
}
