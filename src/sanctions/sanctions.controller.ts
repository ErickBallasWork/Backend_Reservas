import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { JobEndpoint } from '../common/guards/job-endpoint.decorator';
import { ListSanctionsQueryDto, ResolveSanctionDto } from './dto/sanction.dto';
import {
  ProcessNoShowsResponseDto,
  SanctionPageResponseDto,
  SanctionResponseDto,
} from './dto/sanction-response.dto';
import { SanctionsService } from './sanctions.service';

@ApiTags('Sanciones (No-Show)')
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Roles('ADMIN')
  @Get()
  @ApiOkResponse({ type: SanctionPageResponseDto })
  @ApiOperation({ summary: 'Listar sanciones (filtro: ACTIVE o RESOLVED)' })
  list(@Query() query: ListSanctionsQueryDto) {
    return this.sanctions.list(query);
  }

  @Roles('ADMIN')
  @Patch(':id/resolve')
  @ApiOkResponse({ type: SanctionResponseDto })
  @ApiOperation({ summary: 'Regularizar una sanción (HU-22)' })
  resolve(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSanctionDto,
  ) {
    return this.sanctions.resolve(user, id, dto);
  }

  @JobEndpoint()
  @Post('no-show/run')
  @ApiCreatedResponse({ type: ProcessNoShowsResponseDto })
  @ApiOperation({ summary: 'Tarea programada: marcar No-Show y vencer entrenamientos (HU-21)' })
  runNoShow() {
    return this.sanctions.processNoShows();
  }
}
