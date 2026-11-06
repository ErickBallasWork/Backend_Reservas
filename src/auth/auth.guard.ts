import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SUPERADMIN_ROLE } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { IS_PUBLIC_KEY } from '../common/current-user/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.service';
import { toCurrentUser, USER_WITH_ROLES } from './current-user.mapper';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserData }>();
    request.user = await this.authenticate(request);

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (required && required.length > 0) {
      const roles = request.user.roles;
      if (!roles.includes(SUPERADMIN_ROLE) && !required.some((r) => roles.includes(r))) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ROLE',
          message: `Necesitas uno de estos roles: ${required.join(', ')}`,
        });
      }
    }
    return true;
  }

  private async authenticate(request: Request): Promise<CurrentUserData> {
    const header = request.headers.authorization;

    if (header && header.startsWith('Bearer ')) {
      let payload: JwtPayload;
      try {
        payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      } catch {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
        });
      }
      return this.loadUser(payload.sub);
    }

    throw new UnauthorizedException({ code: 'NO_TOKEN', message: 'Inicia sesión para continuar' });
  }

  private async loadUser(id: string): Promise<CurrentUserData> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_WITH_ROLES });
    if (!user) {
      throw new UnauthorizedException({ code: 'UNKNOWN_USER', message: 'El usuario no existe' });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'Tu usuario está desactivado',
      });
    }
    return toCurrentUser(user);
  }
}
