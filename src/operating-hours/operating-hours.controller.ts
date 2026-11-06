import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import {
  ClosedDateResponseDto,
  CreateClosedDateDto,
  OperatingHoursQueryDto,
  OperatingHoursResponseDto,
  ReplaceOperatingHoursDto,
} from './dto/operating-hours.dto';
import { OperatingHoursService } from './operating-hours.service';

@ApiTags('Horario operativo')
@Roles('ADMIN')
@Controller()
export class OperatingHoursController {
  constructor(private readonly operatingHours: OperatingHoursService) {}

  @Get('operating-hours')
  @ApiOkResponse({ type: OperatingHoursResponseDto })
  @ApiOperation({ summary: 'Horario semanal vigente, global o de un recurso (RF-17)' })
  read(@Query() query: OperatingHoursQueryDto) {
    return this.operatingHours.read(query.resourceId);
  }

  @Put('operating-hours')
  @ApiOkResponse({ type: OperatingHoursResponseDto })
  @ApiOperation({
    summary: 'Reemplazar el horario semanal global o de un recurso (RF-17)',
    description:
      'Una lista vacía quita el horario: el recurso hereda el del laboratorio o el global, y el global vuelve a 24×7.',
  })
  replace(@CurrentUser() user: CurrentUserData, @Body() dto: ReplaceOperatingHoursDto) {
    return this.operatingHours.replace(user, dto);
  }

  @Get('closed-dates')
  @ApiOkResponse({ type: [ClosedDateResponseDto] })
  @ApiOperation({ summary: 'Días cerrados desde hoy (RF-17)' })
  listClosedDates() {
    return this.operatingHours.listClosedDates();
  }

  @Post('closed-dates')
  @ApiCreatedResponse({ type: ClosedDateResponseDto })
  @ApiOperation({ summary: 'Cerrar un día, para todos los recursos o para uno (RF-17)' })
  createClosedDate(@CurrentUser() user: CurrentUserData, @Body() dto: CreateClosedDateDto) {
    return this.operatingHours.createClosedDate(user, dto);
  }

  @Delete('closed-dates/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Reabrir un día cerrado (RF-17)' })
  deleteClosedDate(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.operatingHours.deleteClosedDate(user, id);
  }
}
