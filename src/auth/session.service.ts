import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { AppConfigService } from '../config/app-config.service';
import { JwtPayload } from './jwt-payload';

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly appConfig: AppConfigService,
  ) {}

  async issue(user: CurrentUserData, deviceId?: string) {
    const payload: JwtPayload = { sub: user.id, email: user.email, did: deviceId };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.appConfig.auth.jwtExpiresInSeconds,
      user,
    };
  }

  async issueForDevice(user: CurrentUserData, deviceId: string, refreshToken: string) {
    const session = await this.issue(user, deviceId);
    return { ...session, refreshToken };
  }
}
