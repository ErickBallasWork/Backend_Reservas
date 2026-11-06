import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCurrentUser, USER_WITH_ROLES } from './current-user.mapper';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly appConfig: AppConfigService,
  ) {}

  async loginDemo(email: string) {
    if (!this.appConfig.auth.demoLoginEnabled) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No disponible' });
    }
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: USER_WITH_ROLES,
    });
    if (!user || !user.isActive) {
      throw new ForbiddenException({
        code: 'UNKNOWN_USER',
        message: `No existe un usuario activo con el correo ${email}`,
      });
    }
    return this.issueSession(toCurrentUser(user));
  }

  private async issueSession(user: CurrentUserData) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.appConfig.auth.jwtExpiresInSeconds,
      user,
    };
  }
}
