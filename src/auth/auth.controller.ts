import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/current-user/public.decorator';
import { AuthService } from './auth.service';
import { DemoLoginDto, GoogleLoginDto } from './dto/auth.dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar sesión con Google (solo correos de los dominios permitidos)',
    description:
      'Recibe el "credential" del botón de Google y devuelve el token de la API (accessToken). ' +
      'El frontend lo envía después en cada petición: Authorization: Bearer <accessToken>.',
  })
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.credential);
  }

  @Public()
  @Post('demo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solo AUTH_MODE=demo: iniciar sesión como usuario demo, sin Google' })
  demo(@Body() dto: DemoLoginDto) {
    return this.auth.loginDemo(dto.email);
  }
}
