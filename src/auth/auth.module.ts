import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { JWT_ALGORITHM, JWT_ISSUER } from './jwt-payload';
import { SessionService } from './session.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.auth.jwtSecret,
        signOptions: {
          algorithm: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          expiresIn: config.auth.jwtExpiresInSeconds,
        },
        verifyOptions: { algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER },
      }),
    }),
  ],
  controllers: [AuthController, DevicesController],
  providers: [
    AuthService,
    SessionService,
    DevicesService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
