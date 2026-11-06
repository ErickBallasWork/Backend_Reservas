import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const { server, auth } = app.get(AppConfigService);

  app.set('trust proxy', server.trustProxyHops);
  app.setGlobalPrefix('api/v1');
  // CSP is disabled outside production so the Swagger UI loads.
  app.use(helmet({ contentSecurityPolicy: server.isProduction ? undefined : false }));
  app.enableCors({ origin: server.corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (server.swaggerEnabled) setupSwagger(app, auth.demoLoginEnabled);

  app.enableShutdownHooks();
  await app.listen(server.port);
  Logger.log(`API ready at http://localhost:${server.port}/api/v1`, 'Bootstrap');
  Logger.log(`Swagger at http://localhost:${server.port}/api/docs`, 'Bootstrap');
  if (auth.demoLoginEnabled) Logger.warn('Demo login is enabled (development only)', 'Bootstrap');
}

void bootstrap();
