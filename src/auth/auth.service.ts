import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCurrentUser, USER_WITH_ROLES } from './current-user.mapper';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
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
    return this.sessions.issue(toCurrentUser(user));
  }
}
