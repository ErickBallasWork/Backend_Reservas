import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessRequestStatusQueryDto } from '../access-requests/dto/access-request.dto';
import { Public } from '../common/current-user/public.decorator';
import { ApiErrorResponses } from '../common/error-response.dto';
import { limitFor } from '../throttling/rate-limits';
import { AuthService } from './auth.service';
import { DevicesService } from './devices.service';
import { DemoLoginDto, RefreshDto, SuperadminLoginDto } from './dto/auth.dto';
import { DeviceSessionResponseDto, SessionResponseDto } from './dto/auth-response.dto';

@ApiTags('Autenticación')
@ApiErrorResponses(400, 401, 403, 404, 409)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly devices: DevicesService,
  ) {}

  @Public()
  @Throttle(limitFor('deviceSession'))
  @Post('device-session')
  @HttpCode(200)
  @ApiOkResponse({ type: DeviceSessionResponseDto })
  @ApiOperation({
    summary: 'Primer ingreso de un dispositivo con una solicitud aprobada (una sola vez)',
  })
  deviceSession(@Body() dto: AccessRequestStatusQueryDto) {
    return this.devices.redeem(dto);
  }

  @Public()
  @Throttle(limitFor('refresh'))
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: DeviceSessionResponseDto })
  @ApiOperation({
    summary: 'Renovar la sesión de un dispositivo aprobado. El refresh token rota en cada uso',
  })
  refresh(@Body() dto: RefreshDto) {
    return this.devices.refresh(dto);
  }

  @Public()
  @Throttle(limitFor('logout'))
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Cerrar sesión: revoca el dispositivo dueño del refresh token' })
  logout(@Body() dto: RefreshDto) {
    return this.devices.logout(dto);
  }

  @Public()
  @Throttle(limitFor('superadminLogin'))
  @Post('superadmin-login')
  @HttpCode(200)
  @ApiOkResponse({ type: DeviceSessionResponseDto })
  @ApiOperation({
    summary:
      'Solo pruebas (SUPERADMIN_TEST_LOGIN_ENABLED=true): entrar como el SUPERADMIN inicial con su correo como contraseña',
  })
  superadminLogin(@Body() dto: SuperadminLoginDto) {
    return this.devices.loginSuperadminForTests(dto);
  }

  @Public()
  @Throttle(limitFor('demoLogin'))
  @Post('demo')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiOperation({
    summary: 'Solo desarrollo (DEMO_LOGIN_ENABLED=true): iniciar sesión como usuario demo',
  })
  demo(@Body() dto: DemoLoginDto) {
    return this.auth.loginDemo(dto.email);
  }
}
