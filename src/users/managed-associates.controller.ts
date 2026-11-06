import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { ReplaceManagedAssociatesDto } from './dto/managed-associates.dto';
import { ManagedAssociateResponseDto } from './dto/user-response.dto';
import { ManagedAssociatesService } from './managed-associates.service';

@ApiTags('Usuarios y roles')
@ApiErrorResponses(400, 401, 403, 404)
@Roles('ADMIN')
@Controller('users/:id/managed-associates')
export class ManagedAssociatesController {
  constructor(private readonly managedAssociates: ManagedAssociatesService) {}

  @Get()
  @ApiOkResponse({ type: [ManagedAssociateResponseDto] })
  @ApiOperation({ summary: 'Asociados a cargo de un SPOC Administrativo o Líder' })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.managedAssociates.list(id);
  }

  @Put()
  @HttpCode(200)
  @ApiOkResponse({ type: [ManagedAssociateResponseDto] })
  @ApiOperation({ summary: 'Reemplazar la lista de asociados a cargo' })
  replace(
    @CurrentUser() actor: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceManagedAssociatesDto,
  ) {
    return this.managedAssociates.replace(actor, id, dto);
  }
}
