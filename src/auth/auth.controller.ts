import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/current-user/public.decorator';
import { ApiErrorResponses } from '../common/error-response.dto';
import { AuthService } from './auth.service';
import { DemoLoginDto } from './dto/auth.dto';
import { SessionResponseDto } from './dto/auth-response.dto';

@ApiTags('Autenticación')
@ApiErrorResponses(400, 401, 403, 404)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('demo')
  @ApiOkResponse({ type: SessionResponseDto })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Solo desarrollo (DEMO_LOGIN_ENABLED=true): iniciar sesión como usuario demo',
  })
  demo(@Body() dto: DemoLoginDto) {
    return this.auth.loginDemo(dto.email);
  }
}
