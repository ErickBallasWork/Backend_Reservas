import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  type AccessRequestKind,
  type AccessRequestStatus,
  SUPERADMIN_ROLE,
} from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { Db, isUniqueViolation } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { AppConfigService } from '../config/app-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleRowsService } from '../users/role-rows.service';
import {
  cooldownEndsAt,
  hashDeviceSecret,
  isAllowedDomain,
  matchesDeviceSecret,
} from './access-request.rules';
import {
  AccessRequestStatusQueryDto,
  ApproveAccessRequestDto,
  CreateAccessRequestDto,
  ListAccessRequestsQueryDto,
  RejectAccessRequestDto,
} from './dto/access-request.dto';

const WITH_DECIDER = { decidedBy: { select: { fullName: true } } } as const;

type RequestWithDecider = Prisma.AccessRequestGetPayload<{ include: typeof WITH_DECIDER }>;

@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly appConfig: AppConfigService,
    private readonly roleRows: RoleRowsService,
  ) {}

  async create(dto: CreateAccessRequestDto) {
    const email = dto.email.trim().toLowerCase();
    if (!isAllowedDomain(email, this.appConfig.auth.allowedEmailDomains)) {
      throw new BadRequestException({
        code: 'DOMAIN_NOT_ALLOWED',
        message: 'Solo se permiten correos @tcs.com o @pichincha.com',
      });
    }
    await this.assertCanRequest(email);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    const kind: AccessRequestKind = existingUser ? 'NEW_DEVICE' : 'NEW_USER';

    try {
      const request = await this.prisma.$transaction(async (tx) => {
        const created = await tx.accessRequest.create({
          data: {
            email,
            fullName: existingUser?.fullName ?? dto.fullName.trim(),
            department: dto.department?.trim() || existingUser?.department,
            kind,
            deviceSecretHash: hashDeviceSecret(dto.deviceSecret),
            deviceLabel: dto.deviceLabel?.trim(),
          },
        });
        await this.audit.log(
          {
            userId: existingUser?.id ?? null,
            action: 'ACCESS_REQUESTED',
            entity: 'AccessRequest',
            entityId: created.id,
            details: { email, kind },
          },
          tx,
        );
        await this.notifySuperadmins(created.fullName, email, tx);
        return created;
      });
      return { requestId: request.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw this.pendingConflict();
      throw error;
    }
  }

  async status(dto: AccessRequestStatusQueryDto) {
    const request = await this.prisma.accessRequest.findUnique({ where: { id: dto.requestId } });
    if (!request || !matchesDeviceSecret(dto.deviceSecret, request.deviceSecretHash)) {
      throw this.notFound();
    }
    return {
      status: request.status as AccessRequestStatus,
      decisionComment: request.decisionComment,
    };
  }

  async list(query: ListAccessRequestsQueryDto) {
    const where: Prisma.AccessRequestWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.accessRequest.findMany({
        where,
        include: WITH_DECIDER,
        orderBy: { requestedAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.accessRequest.count({ where }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((item) => this.toResponse(item)),
    };
  }

  async approve(actor: CurrentUserData, id: string, dto: ApproveAccessRequestDto) {
    const request = await this.getPending(id);
    const existing = await this.prisma.user.findUnique({ where: { email: request.email } });
    if (existing && !existing.isActive) {
      throw new ConflictException({
        code: 'USER_INACTIVE',
        message: 'El usuario está desactivado. Actívalo antes de aprobar un dispositivo nuevo',
      });
    }
    if (existing && dto.roles) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Los roles solo se asignan al aprobar a un usuario nuevo',
      });
    }
    const roleRows = existing
      ? []
      : await this.roleRows.resolve(dto.roles ?? [{ role: 'ASOCIADO' }]);

    const decided = await this.prisma.$transaction(async (tx) => {
      await this.markDecided(tx, id, actor, 'APPROVED');
      if (!existing) {
        const user = await tx.user.create({
          data: {
            email: request.email,
            fullName: request.fullName,
            department: request.department,
          },
        });
        await tx.userRole.createMany({
          data: roleRows.map((row) => ({ ...row, userId: user.id })),
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'ACCESS_REQUEST_APPROVED',
          entity: 'AccessRequest',
          entityId: id,
          details: { email: request.email, kind: request.kind, roles: dto.roles ?? null },
        },
        tx,
      );
      return tx.accessRequest.findUniqueOrThrow({ where: { id }, include: WITH_DECIDER });
    });
    return this.toResponse(decided);
  }

  async reject(actor: CurrentUserData, id: string, dto: RejectAccessRequestDto) {
    const request = await this.getPending(id);
    const comment = dto.comment.trim();
    const decided = await this.prisma.$transaction(async (tx) => {
      await this.markDecided(tx, id, actor, 'REJECTED', comment);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'ACCESS_REQUEST_REJECTED',
          entity: 'AccessRequest',
          entityId: id,
          details: { email: request.email, comment },
        },
        tx,
      );
      return tx.accessRequest.findUniqueOrThrow({ where: { id }, include: WITH_DECIDER });
    });
    return this.toResponse(decided);
  }

  private async assertCanRequest(email: string): Promise<void> {
    const pending = await this.prisma.accessRequest.findFirst({
      where: { email, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw this.pendingConflict();

    const lastRejected = await this.prisma.accessRequest.findFirst({
      where: { email, status: 'REJECTED' },
      orderBy: { decidedAt: 'desc' },
      select: { decidedAt: true },
    });
    if (!lastRejected?.decidedAt) return;
    const retryAt = cooldownEndsAt(lastRejected.decidedAt);
    if (retryAt.getTime() > Date.now()) {
      const date = retryAt.toLocaleDateString('es-EC', {
        timeZone: this.appConfig.server.timeZone,
      });
      throw new UnprocessableEntityException({
        code: 'ACCESS_REQUEST_COOLDOWN',
        message: `Tu solicitud anterior fue rechazada. Podrás volver a pedir acceso el ${date}`,
      });
    }
  }

  private pendingConflict(): ConflictException {
    return new ConflictException({
      code: 'ACCESS_REQUEST_PENDING',
      message: 'Ya hay una solicitud pendiente para este correo',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ACCESS_REQUEST_NOT_FOUND',
      message: 'No encontramos esa solicitud',
    });
  }

  private alreadyResolved(): ConflictException {
    return new ConflictException({
      code: 'ALREADY_RESOLVED',
      message: 'Esta solicitud ya fue resuelta',
    });
  }

  private async getPending(id: string) {
    const request = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw this.notFound();
    if (request.status !== 'PENDING') throw this.alreadyResolved();
    return request;
  }

  private async markDecided(
    tx: Prisma.TransactionClient,
    id: string,
    actor: CurrentUserData,
    status: AccessRequestStatus,
    comment?: string,
  ): Promise<void> {
    const { count } = await tx.accessRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status,
        decidedAt: new Date(),
        decidedById: actor.id,
        decisionComment: comment ?? null,
      },
    });
    if (count === 0) throw this.alreadyResolved();
  }

  private async notifySuperadmins(fullName: string, email: string, db: Db): Promise<void> {
    const superadmins = await db.user.findMany({
      where: { isActive: true, roles: { some: { role: { name: SUPERADMIN_ROLE } } } },
      select: { id: true },
    });
    for (const { id } of superadmins) {
      await this.notifications.notify(
        {
          userId: id,
          type: 'ACCESS_REQUEST',
          title: 'Nueva solicitud de acceso',
          message: `${fullName} (${email}) pidió acceso al sistema.`,
        },
        db,
      );
    }
  }

  private toResponse(request: RequestWithDecider) {
    return {
      id: request.id,
      email: request.email,
      fullName: request.fullName,
      department: request.department,
      kind: request.kind as AccessRequestKind,
      status: request.status as AccessRequestStatus,
      deviceLabel: request.deviceLabel,
      requestedAt: request.requestedAt,
      decidedAt: request.decidedAt,
      decidedByName: request.decidedBy?.fullName ?? null,
      decisionComment: request.decisionComment,
    };
  }
}
