import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCurrentUser, USER_WITH_ROLES } from './current-user.mapper';
import { GoogleProfile, GoogleVerifierService } from './google-verifier.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly google: GoogleVerifierService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** Inicio de sesión con Google: verifica el token de Google y entrega el token propio de la API. */
  async loginWithGoogle(credential: string) {
    const profile = await this.google.verify(credential);
    const user = await this.findOrCreate(profile);
    const session = await this.issueSession(user);
    // null = cuenta personal de Google con correo de la empresa; "tcs.com" = cuenta de Google Workspace
    return { ...session, googleWorkspaceDomain: profile.hostedDomain };
  }

  /** Solo en AUTH_MODE=demo: inicia sesión como un usuario demo sin Google. */
  async loginDemo(email: string) {
    if (this.appConfig.auth.mode !== 'demo') {
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

  /** Busca al usuario por correo; si no existe y está permitido, lo crea como ASOCIADO. */
  private async findOrCreate(profile: GoogleProfile): Promise<CurrentUserData> {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existing) {
      if (!existing.isActive) {
        throw new ForbiddenException({
          code: 'USER_INACTIVE',
          message: 'Tu usuario está desactivado. Contacta a un administrador.',
        });
      }
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date(), tenantId: profile.hostedDomain ?? existing.tenantId },
        include: USER_WITH_ROLES,
      });
      return toCurrentUser(updated);
    }

    if (!this.appConfig.auth.autoCreateUsers) {
      throw new ForbiddenException({
        code: 'USER_NOT_REGISTERED',
        message: 'Tu usuario no está habilitado en el sistema. Pide acceso a un administrador.',
      });
    }

    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        fullName: profile.name,
        tenantId: profile.hostedDomain,
        lastLoginAt: new Date(),
        roles: { create: [{ role: { connect: { name: 'ASOCIADO' } } }] },
      },
      include: USER_WITH_ROLES,
    });
    await this.audit.log({
      userId: created.id,
      action: 'USER_CREATED_ON_FIRST_LOGIN',
      entity: 'User',
      entityId: created.id,
      details: { email: created.email, googleWorkspaceDomain: profile.hostedDomain },
    });
    return toCurrentUser(created);
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
