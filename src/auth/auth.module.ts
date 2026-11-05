import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { jwtExpiresInSeconds, jwtSecret } from './auth-config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GoogleVerifierService } from './google-verifier.service';

@Module({
  imports: [
    // registerAsync: el secreto se lee cuando ya está cargado el .env
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: jwtExpiresInSeconds() },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleVerifierService,
    // Guard global: toda ruta exige sesión salvo las marcadas con @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
