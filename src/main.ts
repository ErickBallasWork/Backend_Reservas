import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { server, auth } = app.get(AppConfigService);
  const demoMode = auth.mode === 'demo';

  app.setGlobalPrefix('api/v1');
  // CSP is disabled outside production so the Swagger UI assets load.
  app.use(helmet({ contentSecurityPolicy: server.isProduction ? undefined : false }));
  app.enableCors({ origin: server.corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (server.swaggerEnabled) setupSwagger(app, demoMode);

  app.enableShutdownHooks();
  await app.listen(server.port);
  Logger.log(`API lista en http://localhost:${server.port}/api/v1`, 'Inicio');
  Logger.log(`Swagger en http://localhost:${server.port}/api/docs`, 'Inicio');
  Logger.log(`Autenticación: ${demoMode ? 'demo (solo desarrollo)' : 'Google'}`, 'Inicio');
}

void bootstrap();
