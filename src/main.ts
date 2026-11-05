import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const demoMode = process.env.AUTH_MODE !== 'google';

  // El modo demo permite hacerse pasar por cualquier usuario: jamás en producción.
  if (isProduction && demoMode) {
    throw new Error('En producción usa AUTH_MODE=google (el modo demo no es seguro)');
  }

  const app = await NestFactory.create(AppModule);

  // Todas las rutas empiezan con /api/v1
  app.setGlobalPrefix('api/v1');

  // Cabeceras de seguridad. En desarrollo se apaga la política CSP para que Swagger funcione sin problemas.
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));

  // Solo el frontend puede llamar a la API desde el navegador.
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  });

  // Valida los DTO: rechaza campos de más y convierte tipos (por ejemplo "5" a 5 en los query params).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Formato único de errores.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Documentación interactiva en /api/docs
  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    const builder = new DocumentBuilder()
      .setTitle('API de Reservas de Salas y Laboratorios de IA')
      .setDescription(
        'Backend NestJS + Prisma + Azure SQL. Inicia sesión con POST /auth/google (o POST /auth/demo ' +
          'en modo demo), copia el accessToken y pégalo en Authorize > bearer. ' +
          (demoMode
            ? 'En modo demo también puedes usar Authorize > demo-user con un correo: ' +
              'ana.asociado@demo.com, luis.lider@demo.com, carlos.spoc@demo.com, admin@demo.com'
            : ''),
      )
      .setVersion('0.2.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addSecurityRequirements('bearer');
    if (demoMode) {
      builder
        .addApiKey({ type: 'apiKey', in: 'header', name: 'x-demo-user' }, 'demo-user')
        .addSecurityRequirements('demo-user');
    }
    const config = builder.build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API lista en http://localhost:${port}/api/v1`, 'Inicio');
  Logger.log(`Swagger en http://localhost:${port}/api/docs`, 'Inicio');
  Logger.log(`Autenticación: ${demoMode ? 'demo (solo desarrollo)' : 'Google'}`, 'Inicio');
}

void bootstrap();
