import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { Public } from '../common/current-user/public.decorator';
import { ApiErrorResponses } from '../common/error-response.dto';
import { AccessRequestsService } from './access-requests.service';
import {
  AccessRequestStatusQueryDto,
  ApproveAccessRequestDto,
  CreateAccessRequestDto,
  ListAccessRequestsQueryDto,
  RejectAccessRequestDto,
} from './dto/access-request.dto';
import {
  AccessRequestCreatedResponseDto,
  AccessRequestPageResponseDto,
  AccessRequestResponseDto,
  AccessRequestStatusResponseDto,
} from './dto/access-request-response.dto';

@ApiTags('Solicitudes de acceso')
@ApiErrorResponses(400, 401, 403, 404, 409, 422)
@Controller('access-requests')
export class AccessRequestsController {
  constructor(private readonly accessRequests: AccessRequestsService) {}

  @Public()
  @Post()
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AccessRequestCreatedResponseDto })
  @ApiOperation({
    summary: 'Pedir acceso con un correo @tcs.com o @pichincha.com desde este dispositivo',
  })
  create(@Body() dto: CreateAccessRequestDto) {
    return this.accessRequests.create(dto);
  }

  @Public()
  @Post('status')
  @HttpCode(200)
  @ApiOkResponse({ type: AccessRequestStatusResponseDto })
  @ApiOperation({ summary: 'Estado de una solicitud, solo para el dispositivo que la creó' })
  status(@Body() dto: AccessRequestStatusQueryDto) {
    return this.accessRequests.status(dto);
  }

  @Roles('SUPERADMIN')
  @Get()
  @ApiOkResponse({ type: AccessRequestPageResponseDto })
  @ApiOperation({ summary: 'Bandeja de solicitudes de acceso' })
  list(@Query() query: ListAccessRequestsQueryDto) {
    return this.accessRequests.list(query);
  }

  @Roles('SUPERADMIN')
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: AccessRequestResponseDto })
  @ApiOperation({ summary: 'Aprobar una solicitud y habilitar el dispositivo' })
  approve(
    @CurrentUser() actor: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveAccessRequestDto,
  ) {
    return this.accessRequests.approve(actor, id, dto);
  }

  @Roles('SUPERADMIN')
  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: AccessRequestResponseDto })
  @ApiOperation({ summary: 'Rechazar una solicitud con un comentario' })
  reject(
    @CurrentUser() actor: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAccessRequestDto,
  ) {
    return this.accessRequests.reject(actor, id, dto);
  }
}
