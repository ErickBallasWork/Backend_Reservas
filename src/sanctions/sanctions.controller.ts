import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { Public } from '../common/current-user/public.decorator';
import { assertJobKey } from '../common/job-key';
import { ListSanctionsQueryDto, ResolveSanctionDto } from './dto/sanction.dto';
import { SanctionsService } from './sanctions.service';

@ApiTags('Sanciones (No-Show)')
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'Listar sanciones (filtro: ACTIVE o RESOLVED)' })
  list(@Query() query: ListSanctionsQueryDto) {
    return this.sanctions.list(query);
  }

  @Roles('ADMIN')
  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Regularizar una sanción (HU-22)' })
  resolve(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSanctionDto,
  ) {
    return this.sanctions.resolve(user, id, dto);
  }

  @Public()
  @Post('no-show/run')
  @ApiOperation({ summary: 'Tarea programada: marcar No-Show y vencer entrenamientos (HU-21)' })
  runNoShow(@Headers('x-job-key') jobKey?: string) {
    assertJobKey(jobKey);
    return this.sanctions.processNoShows();
  }
}
