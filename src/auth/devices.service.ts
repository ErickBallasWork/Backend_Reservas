import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessRequestStatusQueryDto } from '../access-requests/dto/access-request.dto';
import { AuditService } from '../audit/audit.service';
import { SUPERADMIN_ROLE } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { generateSecret, hashSecret, matchesSecretHash } from '../common/secret-hash';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCurrentUser, USER_WITH_ROLES } from './current-user.mapper';
import { RefreshDto, SuperadminLoginDto } from './dto/auth.dto';
import { SessionService } from './session.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 30 * 1000;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly appConfig: AppConfigService,
  ) {}

  async redeem(dto: AccessRequestStatusQueryDto) {
    const request = await this.prisma.accessRequest.findUnique({ where: { id: dto.requestId } });
    if (!request || !matchesSecretHash(dto.deviceSecret, request.deviceSecretHash)) {
      throw new NotFoundException({
        code: 'ACCESS_REQUEST_NOT_FOUND',
        message: 'No encontramos esa solicitud',
      });
    }
    if (request.status !== 'APPROVED') {
      throw new ConflictException({
        code: 'ACCESS_REQUEST_NOT_APPROVED',
        message: 'Tu solicitud todavía no fue aprobada',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { email: request.email },
      include: USER_WITH_ROLES,
    });
    if (!user || !user.isActive) throw this.inactiveUser();

    const refreshToken = generateSecret();
    const now = new Date();
    const device = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.accessRequest.updateMany({
        where: { id: request.id, redeemedAt: null },
        data: { redeemedAt: now },
      });
      if (count === 0) {
        throw new ConflictException({
          code: 'ACCESS_REQUEST_REDEEMED',
          message: 'Este dispositivo ya ingresó con esta solicitud',
        });
      }
      const created = await tx.device.create({
        data: {
          userId: user.id,
          label: request.deviceLabel,
          refreshTokenHash: hashSecret(refreshToken),
          expiresAt: this.nextExpiry(now),
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await this.audit.log(
        {
          userId: user.id,
          action: 'DEVICE_ENROLLED',
          entity: 'Device',
          entityId: created.id,
          details: { accessRequestId: request.id, label: request.deviceLabel },
        },
        tx,
      );
      return created;
    });
    return this.sessions.issueForDevice(toCurrentUser(user), device.id, refreshToken);
  }

  async loginSuperadminForTests(dto: SuperadminLoginDto) {
    const { superadminTestLoginEnabled, bootstrapSuperadmin } = this.appConfig.auth;
    if (!superadminTestLoginEnabled || !bootstrapSuperadmin) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No disponible' });
    }
    const email = dto.email.trim().toLowerCase();
    const credentialsMatch =
      email === bootstrapSuperadmin.email && matchesSecretHash(dto.password, hashSecret(email));
    if (!credentialsMatch) throw this.invalidCredentials();

    const user = await this.prisma.user.findUnique({ where: { email }, include: USER_WITH_ROLES });
    const isSuperadmin = user?.roles.some((entry) => entry.role.name === SUPERADMIN_ROLE);
    if (!user || !user.isActive || !isSuperadmin) throw this.invalidCredentials();

    const refreshToken = generateSecret();
    const now = new Date();
    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          userId: user.id,
          label: 'Login de pruebas',
          refreshTokenHash: hashSecret(refreshToken),
          expiresAt: this.nextExpiry(now),
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await this.audit.log(
        {
          userId: user.id,
          action: 'SUPERADMIN_TEST_LOGIN',
          entity: 'Device',
          entityId: created.id,
        },
        tx,
      );
      return created;
    });
    return this.sessions.issueForDevice(toCurrentUser(user), device.id, refreshToken);
  }

  async refresh(dto: RefreshDto) {
    const hash = hashSecret(dto.refreshToken);
    const device = await this.prisma.device.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { include: USER_WITH_ROLES } },
    });
    if (!device) {
      await this.revokeOnReuse(hash);
      throw this.notAuthorized();
    }
    const now = new Date();
    if (device.revokedAt || device.expiresAt <= now) throw this.notAuthorized();
    if (!device.user.isActive) throw this.inactiveUser();

    const nextToken = generateSecret();
    const { count } = await this.prisma.device.updateMany({
      where: { id: device.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        refreshTokenHash: hashSecret(nextToken),
        previousRefreshTokenHash: hash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: this.nextExpiry(now),
      },
    });
    if (count === 0) throw this.notAuthorized();
    return this.sessions.issueForDevice(toCurrentUser(device.user), device.id, nextToken);
  }

  async logout(dto: RefreshDto): Promise<void> {
    const hash = hashSecret(dto.refreshToken);
    await this.prisma.device.updateMany({
      where: {
        revokedAt: null,
        OR: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }],
      },
      data: { revokedAt: new Date() },
    });
  }

  listForUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async revoke(actor: CurrentUserData, deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'No existe ese dispositivo',
      });
    }
    if (device.revokedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DEVICE_REVOKED',
          entity: 'Device',
          entityId: deviceId,
          details: { ownerId: device.userId },
        },
        tx,
      );
    });
  }

  private async revokeOnReuse(hash: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { previousRefreshTokenHash: hash, revokedAt: null },
    });
    if (!device?.rotatedAt) return;
    if (Date.now() - device.rotatedAt.getTime() <= ROTATION_GRACE_MS) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          userId: device.userId,
          action: 'DEVICE_TOKEN_REUSE_DETECTED',
          entity: 'Device',
          entityId: device.id,
        },
        tx,
      );
    });
  }

  private nextExpiry(from: Date): Date {
    return new Date(from.getTime() + this.appConfig.auth.deviceIdleDays * MS_PER_DAY);
  }

  private notAuthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'DEVICE_NOT_AUTHORIZED',
      message: 'Este dispositivo ya no está autorizado. Pide acceso de nuevo.',
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Correo o contraseña incorrectos',
    });
  }

  private inactiveUser(): ForbiddenException {
    return new ForbiddenException({
      code: 'USER_INACTIVE',
      message: 'Tu usuario está desactivado. Contacta a un administrador.',
    });
  }
}
