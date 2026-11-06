import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DEMO_USERS = [
  'ana.asociado@demo.com',
  'luis.lider@demo.com',
  'carlos.spoc@demo.com',
  'admin@demo.com',
];

function packageVersion(): string {
  const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
  const { version } = JSON.parse(raw) as { version: string };
  return version;
}

function description(demoMode: boolean): string {
  const login =
    'Backend NestJS + Prisma + Azure SQL. Inicia sesión con POST /auth/google (o POST /auth/demo ' +
    'en modo demo), copia el accessToken y pégalo en Authorize > bearer. ';
  const demo = `En modo demo también puedes usar Authorize > demo-user con un correo: ${DEMO_USERS.join(', ')}`;
  return demoMode ? login + demo : login;
}

export function setupSwagger(app: INestApplication, demoMode: boolean): void {
  const builder = new DocumentBuilder()
    .setTitle('API de Reservas de Salas y Laboratorios de IA')
    .setDescription(description(demoMode))
    .setVersion(packageVersion())
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addSecurityRequirements('bearer');
  if (demoMode) {
    builder
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-demo-user' }, 'demo-user')
      .addSecurityRequirements('demo-user');
  }
  const document = SwaggerModule.createDocument(app, builder.build());
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
