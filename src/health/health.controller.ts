import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/current-user/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Container Apps llama a esta ruta para saber si el servicio está vivo (BE-24).
  @Public()
  @Get()
  @ApiOperation({ summary: 'Chequeo de salud: API y base de datos' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'La base de datos no responde (puede estar despertando)',
      });
    }
  }
}
