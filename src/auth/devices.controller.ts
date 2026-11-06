import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { DevicesService } from './devices.service';
import { DeviceResponseDto } from './dto/auth-response.dto';
import { Roles } from './roles.decorator';

@ApiTags('Dispositivos aprobados')
@ApiErrorResponses(401, 403, 404)
@Roles('SUPERADMIN')
@Controller()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('users/:userId/devices')
  @ApiOkResponse({ type: [DeviceResponseDto] })
  @ApiOperation({ summary: 'Dispositivos aprobados de un usuario' })
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.devices.listForUser(userId);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Revocar un dispositivo: su sesión deja de funcionar al instante' })
  revoke(@CurrentUser() actor: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.revoke(actor, id);
  }
}
