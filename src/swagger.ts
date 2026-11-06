import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function packageVersion(): string {
  const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
  const { version } = JSON.parse(raw) as { version: string };
  return version;
}

function description(demoLoginEnabled: boolean): string {
  const base = 'Backend NestJS + Prisma + Azure SQL. Pega el accessToken en Authorize > bearer. ';
  const demo = 'Con el login demo activo, obtén el token con POST /auth/demo y un correo del seed.';
  return demoLoginEnabled ? base + demo : base;
}

export function setupSwagger(app: INestApplication, demoLoginEnabled: boolean): void {
  const builder = new DocumentBuilder()
    .setTitle('API de Reservas de Salas y Laboratorios de IA')
    .setDescription(description(demoLoginEnabled))
    .setVersion(packageVersion())
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addSecurityRequirements('bearer');
  const document = SwaggerModule.createDocument(app, builder.build());
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
